// Vendor asks to move from their accepted lot to another free lot; organizer approves or rejects.
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { phaseOf } = require('../utils/dates');
const { requireFields, toId, clean } = require('../utils/validate');
const { findApplication, findLot } = require('./applicationController');

const RELOC_SELECT = `
  SELECT r.*, v.name AS vendor_name, v.contact_number AS vendor_contact,
         e.event_id, e.name AS event_name, e.event_date,
         lf.lot_number AS from_lot_number, lf.size_label AS from_size, lf.zone AS from_zone,
         lt.lot_number AS to_lot_number, lt.size_label AS to_size, lt.zone AS to_zone, lt.vendor_id AS to_lot_vendor
  FROM relocation_requests r
  JOIN stall_applications a ON a.application_id = r.application_id
  JOIN market_events e ON e.event_id = a.event_id
  JOIN vendors v ON v.vendor_id = r.vendor_id
  LEFT JOIN lots lf ON lf.lot_id = r.from_lot_id
  LEFT JOIN lots lt ON lt.lot_id = r.to_lot_id`;

const create = asyncHandler(async (req, res) => {
  requireFields(req.body, ['applicationId', 'toLotId']);
  const app = await findApplication(toId(req.body.applicationId, 'application id'));
  if (app.vendor_id !== req.user.profileId) throw httpError(404, 'Application not found.');
  if (app.status !== 'accepted' || !app.lot_id) throw httpError(400, 'You can only ask to relocate from a lot you have been given.');
  if (app.phase === 'past' || app.phase === 'cancelled') throw httpError(400, 'This event is no longer active.');

  const toLot = await findLot(toId(req.body.toLotId, 'lot id'));
  if (toLot.event_id !== app.event_id) throw httpError(400, 'The new lot must be in the same event.');
  if (toLot.lot_id === app.lot_id) throw httpError(400, 'That is already your lot.');
  if (toLot.vendor_id) throw httpError(409, `Lot ${toLot.lot_number} is already taken. Choose a free lot.`);

  const [pending] = await db.query(
    "SELECT relocation_id FROM relocation_requests WHERE application_id = ? AND status = 'pending'", [app.application_id]);
  if (pending.length) throw httpError(409, 'You already have a relocation request waiting. Wait for the organizer to decide.');

  const [r] = await db.query(
    'INSERT INTO relocation_requests (application_id, vendor_id, from_lot_id, to_lot_id, reason) VALUES (?, ?, ?, ?, ?)',
    [app.application_id, app.vendor_id, app.lot_id, toLot.lot_id, clean(req.body.reason, 500)]);
  res.status(201).json({ message: `Relocation request sent (lot ${app.lot_number} → ${toLot.lot_number}).`, relocationId: r.insertId });
});

const mine = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`${RELOC_SELECT} WHERE r.vendor_id = ? ORDER BY r.created_at DESC`, [req.user.profileId]);
  res.json(rows);
});

const list = asyncHandler(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) { where = 'WHERE r.status = ?'; params.push(req.query.status); }
  const [rows] = await db.query(`${RELOC_SELECT} ${where} ORDER BY e.event_date, r.created_at`, params);
  res.json(rows.map((r) => ({ ...r, phase: phaseOf(r.event_date) })));
});

const decide = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'relocation id');
  const { decision } = req.body;
  const note = clean(req.body.note, 255);
  if (!['approved', 'rejected'].includes(decision)) throw httpError(400, 'Decision must be approved or rejected.');

  const message = await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM relocation_requests WHERE relocation_id = ? FOR UPDATE', [id]);
    const reloc = rows[0];
    if (!reloc) throw httpError(404, 'Relocation request not found.');
    if (reloc.status !== 'pending') throw httpError(409, `This request is already ${reloc.status}.`);

    if (decision === 'rejected') {
      await conn.query("UPDATE relocation_requests SET status = 'rejected', organizer_note = ?, decided_at = NOW() WHERE relocation_id = ?", [note, id]);
      return 'Relocation rejected.';
    }

    const app = await findApplication(reloc.application_id, conn);
    if (app.status !== 'accepted') throw httpError(409, 'The vendor no longer has this lot.');
    if (!reloc.to_lot_id) throw httpError(409, 'The requested lot was deleted.');
    const [toRows] = await conn.query('SELECT lot_id, lot_number, vendor_id FROM lots WHERE lot_id = ? FOR UPDATE', [reloc.to_lot_id]);
    if (!toRows[0]) throw httpError(409, 'The requested lot was deleted.');
    if (toRows[0].vendor_id) throw httpError(409, `Lot ${toRows[0].lot_number} has been taken by another vendor. Reject this request.`);

    if (app.lot_id) await conn.query('UPDATE lots SET vendor_id = NULL WHERE lot_id = ? AND vendor_id = ?', [app.lot_id, app.vendor_id]);
    await conn.query('UPDATE lots SET vendor_id = ? WHERE lot_id = ?', [app.vendor_id, reloc.to_lot_id]);
    await conn.query('UPDATE stall_applications SET lot_id = ? WHERE application_id = ?', [reloc.to_lot_id, app.application_id]);
    await conn.query("UPDATE relocation_requests SET status = 'approved', organizer_note = ?, decided_at = NOW() WHERE relocation_id = ?", [note, id]);
    await conn.query(
      `UPDATE stall_applications SET status = 'rejected', organizer_note = 'Lot was given to another vendor.', decided_at = NOW()
       WHERE lot_id = ? AND status = 'pending'`, [reloc.to_lot_id]);
    return `Approved. ${app.vendor_name} moved to lot ${toRows[0].lot_number}.`;
  });
  res.json({ message });
});

module.exports = { create, mine, list, decide };
