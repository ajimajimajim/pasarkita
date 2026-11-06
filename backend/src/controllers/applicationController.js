// Lots and stall applications.
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { phaseOf } = require('../utils/dates');
const { requireFields, toId, isTime, clean } = require('../utils/validate');

const APP_SELECT = `
  SELECT a.*, e.name AS event_name, e.event_date, e.start_time, e.end_time, e.location, e.status AS event_status,
         l.lot_number, l.size_label, l.zone, l.price,
         v.name AS vendor_name, v.contact_number AS vendor_contact, v.email AS vendor_email, v.goods_type AS vendor_goods
  FROM stall_applications a
  JOIN market_events e ON e.event_id = a.event_id
  JOIN vendors v ON v.vendor_id = a.vendor_id
  LEFT JOIN lots l ON l.lot_id = a.lot_id`;

function addPhase(row) {
  return { ...row, phase: row.event_status === 'cancelled' ? 'cancelled' : phaseOf(row.event_date) };
}

async function findLot(lotId, conn = db) {
  const [rows] = await conn.query(
    `SELECT l.*, e.name AS event_name, e.event_date, e.start_time, e.end_time, e.location, e.status AS event_status,
            e.map_image_url, v.name AS vendor_name,
            (SELECT COUNT(*) FROM stall_applications a WHERE a.lot_id = l.lot_id AND a.status = 'pending') AS pending_count
     FROM lots l
     JOIN market_events e ON e.event_id = l.event_id
     LEFT JOIN vendors v ON v.vendor_id = l.vendor_id
     WHERE l.lot_id = ?`, [lotId]);
  if (!rows[0]) throw httpError(404, 'Lot not found.');
  return addPhase(rows[0]);
}

async function findApplication(id, conn = db) {
  const [rows] = await conn.query(`${APP_SELECT} WHERE a.application_id = ?`, [id]);
  if (!rows[0]) throw httpError(404, 'Application not found.');
  return addPhase(rows[0]);
}

// ---------------- Lots ----------------
const getLot = asyncHandler(async (req, res) => {
  res.json(await findLot(toId(req.params.id, 'lot id')));
});

// Organizer: who is applying for this lot.
const lotApplications = asyncHandler(async (req, res) => {
  const lotId = toId(req.params.id, 'lot id');
  await findLot(lotId);
  const [rows] = await db.query(`${APP_SELECT} WHERE a.lot_id = ? ORDER BY FIELD(a.status,'accepted','pending','rejected','cancelled'), a.created_at`, [lotId]);
  res.json(rows.map(addPhase));
});

// ---------------- Vendor side ----------------
const apply = asyncHandler(async (req, res) => {
  const vendorId = req.user.profileId;
  requireFields(req.body, ['lotId']);
  const lotId = toId(req.body.lotId, 'lot id');

  const id = await withTransaction(async (conn) => {
    const lot = await findLot(lotId, conn);
    if (lot.phase === 'cancelled') throw httpError(400, 'This event has been cancelled.');
    if (lot.phase === 'ongoing') throw httpError(400, 'Applications are closed: this event is happening today.');
    if (lot.phase === 'past') throw httpError(400, 'This event is already over.');
    if (lot.vendor_id) throw httpError(409, `Lot ${lot.lot_number} is already taken. Please choose another lot.`);

    const [mine] = await conn.query(
      `SELECT a.status, l.lot_number FROM stall_applications a LEFT JOIN lots l ON l.lot_id = a.lot_id
       WHERE a.vendor_id = ? AND a.event_id = ? AND a.status IN ('pending','accepted')`, [vendorId, lot.event_id]);
    if (mine.length) {
      const m = mine[0];
      throw httpError(409, m.status === 'accepted'
        ? `You already have lot ${m.lot_number} for this event. Use "Request relocation" to move.`
        : `You already applied for lot ${m.lot_number} in this event. Cancel that application first to choose a different lot.`);
    }

    const [r] = await conn.query(
      `INSERT INTO stall_applications (vendor_id, event_id, lot_id, goods_description, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [vendorId, lot.event_id, lotId, clean(req.body.goodsDescription, 255), clean(req.body.notes, 500)]);
    return r.insertId;
  });
  res.status(201).json({ message: 'Application sent. The organizer will review it.', applicationId: id });
});

const myApplications = asyncHandler(async (req, res) => {
  const vendorId = req.user.profileId;
  const [apps] = await db.query(`${APP_SELECT} WHERE a.vendor_id = ? ORDER BY e.event_date DESC, a.created_at DESC`, [vendorId]);
  const [payments] = await db.query('SELECT * FROM payments WHERE vendor_id = ? ORDER BY created_at DESC', [vendorId]);
  const [relocs] = await db.query(
    `SELECT r.*, lf.lot_number AS from_lot_number, lt.lot_number AS to_lot_number
     FROM relocation_requests r LEFT JOIN lots lf ON lf.lot_id = r.from_lot_id LEFT JOIN lots lt ON lt.lot_id = r.to_lot_id
     WHERE r.vendor_id = ? ORDER BY r.created_at DESC`, [vendorId]);
  const [helps] = await db.query(
    `SELECT h.*, hp.name AS helper_name, hp.contact_number AS helper_contact
     FROM helper_requests h LEFT JOIN helpers hp ON hp.helper_id = h.helper_id
     WHERE h.vendor_id = ? ORDER BY h.created_at DESC`, [vendorId]);

  res.json(apps.map((a) => ({
    ...addPhase(a),
    payments: payments.filter((p) => p.application_id === a.application_id),
    relocations: relocs.filter((r) => r.application_id === a.application_id),
    helperRequests: helps.filter((h) => h.application_id === a.application_id),
  })));
});

async function ownApplication(req, id) {
  const app = await findApplication(id);
  if (app.vendor_id !== req.user.profileId) throw httpError(404, 'Application not found.');
  return app;
}

const cancel = asyncHandler(async (req, res) => {
  const app = await ownApplication(req, toId(req.params.id, 'application id'));
  if (app.status !== 'pending') throw httpError(400, 'Only pending applications can be cancelled.');
  await db.query("UPDATE stall_applications SET status = 'cancelled', decided_at = NOW() WHERE application_id = ? AND status = 'pending'",
    [app.application_id]);
  res.json({ message: 'Application cancelled.' });
});

// Next Event page: confirm attendance and arrival time.
const setAttendance = asyncHandler(async (req, res) => {
  const app = await ownApplication(req, toId(req.params.id, 'application id'));
  if (app.status !== 'accepted') throw httpError(400, 'You can only confirm attendance for an accepted lot.');
  if (app.phase === 'past' || app.phase === 'cancelled') throw httpError(400, 'This event is no longer active.');
  const { attendance, arrivalTime } = req.body;
  if (!['attending', 'not_attending'].includes(attendance)) throw httpError(400, 'Choose attending or not attending.');
  let time = null;
  if (attendance === 'attending') {
    if (!isTime(arrivalTime)) throw httpError(400, 'Please give your arrival time.');
    time = arrivalTime;
  }
  await db.query('UPDATE stall_applications SET attendance = ?, arrival_time = ? WHERE application_id = ?',
    [attendance, time, app.application_id]);
  res.json({ message: attendance === 'attending' ? 'Attendance confirmed.' : 'Marked as not attending.' });
});

// ---------------- Organizer side ----------------
const listApplications = asyncHandler(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.eventId) { where.push('a.event_id = ?'); params.push(toId(req.query.eventId, 'event id')); }
  const sql = `${APP_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.event_date, a.created_at`;
  const [rows] = await db.query(sql, params);
  res.json(rows.map(addPhase));
});

const decide = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'application id');
  const { decision } = req.body;
  const note = clean(req.body.note, 255);
  if (!['accepted', 'rejected'].includes(decision)) throw httpError(400, 'Decision must be accepted or rejected.');

  const result = await withTransaction(async (conn) => {
    const [locked] = await conn.query('SELECT * FROM stall_applications WHERE application_id = ? FOR UPDATE', [id]);
    if (!locked[0]) throw httpError(404, 'Application not found.');
    const app = await findApplication(id, conn);
    if (app.status !== 'pending') throw httpError(409, `This application is already ${app.status}.`);

    if (decision === 'rejected') {
      await conn.query("UPDATE stall_applications SET status = 'rejected', organizer_note = ?, decided_at = NOW() WHERE application_id = ?",
        [note, id]);
      return { message: 'Application rejected.', autoRejected: 0 };
    }

    if (app.phase === 'past' || app.phase === 'cancelled') throw httpError(400, 'This event is no longer active.');
    if (!app.lot_id) throw httpError(409, 'The lot for this application was deleted.');
    const [lotRows] = await conn.query('SELECT vendor_id, lot_number FROM lots WHERE lot_id = ? FOR UPDATE', [app.lot_id]);
    if (lotRows[0].vendor_id) throw httpError(409, `Lot ${lotRows[0].lot_number} is already given to another vendor.`);
    const [other] = await conn.query(
      "SELECT application_id FROM stall_applications WHERE vendor_id = ? AND event_id = ? AND status = 'accepted'",
      [app.vendor_id, app.event_id]);
    if (other.length) throw httpError(409, 'This vendor already has a lot in this event.');

    await conn.query('UPDATE lots SET vendor_id = ? WHERE lot_id = ?', [app.vendor_id, app.lot_id]);
    await conn.query("UPDATE stall_applications SET status = 'accepted', organizer_note = ?, decided_at = NOW() WHERE application_id = ?",
      [note, id]);
    const [auto] = await conn.query(
      `UPDATE stall_applications SET status = 'rejected', organizer_note = 'Lot was given to another vendor.', decided_at = NOW()
       WHERE lot_id = ? AND status = 'pending' AND application_id <> ?`, [app.lot_id, id]);
    return { message: `Accepted. Lot ${app.lot_number} is now ${app.vendor_name}'s.`, autoRejected: auto.affectedRows };
  });
  res.json(result);
});

// Organizer removes a vendor from their accepted lot.
const revoke = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'application id');
  const note = clean(req.body.note, 255) || 'Removed from lot by organizer.';
  await withTransaction(async (conn) => {
    const app = await findApplication(id, conn);
    if (app.status !== 'accepted') throw httpError(400, 'Only accepted applications can be removed.');
    if (app.lot_id) await conn.query('UPDATE lots SET vendor_id = NULL WHERE lot_id = ? AND vendor_id = ?', [app.lot_id, app.vendor_id]);
    await conn.query("UPDATE stall_applications SET status = 'rejected', organizer_note = ?, decided_at = NOW() WHERE application_id = ?",
      [note, id]);
    await conn.query("UPDATE relocation_requests SET status = 'rejected', organizer_note = 'Vendor removed from lot.', decided_at = NOW() WHERE application_id = ? AND status = 'pending'",
      [id]);
    await conn.query("UPDATE helper_requests SET status = 'rejected', organizer_note = 'Vendor removed from lot.' WHERE application_id = ? AND status IN ('pending','assigned')",
      [id]);
  });
  res.json({ message: 'Vendor removed from the lot. The lot is free again.' });
});

module.exports = {
  findLot, findApplication, getLot, lotApplications, apply, myApplications, cancel, setAttendance,
  listApplications, decide, revoke,
};
