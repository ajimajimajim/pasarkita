// Event reports. Print Report «extends» Generate Report by reusing the generated copy.
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { toId } = require('../utils/validate');
const { findEvent } = require('./eventController');

const reportCache = new Map();

async function buildReport(eventId) {
  const event = await findEvent(eventId);
  const [[lots]] = await db.query(
    `SELECT COUNT(*) AS total, SUM(vendor_id IS NOT NULL) AS taken, COALESCE(SUM(CASE WHEN vendor_id IS NOT NULL THEN price END), 0) AS taken_value
     FROM lots WHERE event_id = ?`, [eventId]);
  const [[apps]] = await db.query(
    `SELECT COUNT(*) AS total, SUM(status='pending') AS pending, SUM(status='accepted') AS accepted,
            SUM(status='rejected') AS rejected, SUM(status='cancelled') AS cancelled,
            SUM(status='accepted' AND attendance='attending') AS attending,
            SUM(status='accepted' AND attendance='not_attending') AS not_attending,
            SUM(status='accepted' AND attendance='unconfirmed') AS unconfirmed
     FROM stall_applications WHERE event_id = ?`, [eventId]);
  const [[pay]] = await db.query(
    `SELECT COUNT(*) AS total, SUM(status='verified') AS verified, SUM(status='pending') AS pending, SUM(status='rejected') AS rejected,
            COALESCE(SUM(CASE WHEN status='verified' THEN amount END), 0) AS verified_amount
     FROM payments WHERE event_id = ?`, [eventId]);
  const [[help]] = await db.query(
    `SELECT COUNT(*) AS total, SUM(status='pending') AS pending, SUM(status='assigned') AS assigned,
            SUM(status='completed') AS completed, SUM(status='rejected') AS rejected
     FROM helper_requests WHERE event_id = ?`, [eventId]);
  const [[reloc]] = await db.query(
    `SELECT COUNT(*) AS total, SUM(r.status='pending') AS pending, SUM(r.status='approved') AS approved, SUM(r.status='rejected') AS rejected
     FROM relocation_requests r JOIN stall_applications a ON a.application_id = r.application_id WHERE a.event_id = ?`, [eventId]);
  const [vendors] = await db.query(
    `SELECT l.lot_number, l.zone, l.size_label, l.price, v.name AS vendor_name, v.goods_type, v.contact_number,
            a.attendance, a.arrival_time,
            (SELECT p.status FROM payments p WHERE p.application_id = a.application_id ORDER BY p.created_at DESC LIMIT 1) AS payment_status
     FROM stall_applications a
     JOIN vendors v ON v.vendor_id = a.vendor_id
     LEFT JOIN lots l ON l.lot_id = a.lot_id
     WHERE a.event_id = ? AND a.status = 'accepted'
     ORDER BY l.lot_number`, [eventId]);

  // SUM() returns null when there are no rows; turn everything into plain numbers.
  const n = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Number(v) || 0]));
  return {
    event,
    generatedAt: new Date().toISOString(),
    lots: n(lots),
    applications: n(apps),
    payments: n(pay),
    helperRequests: n(help),
    relocations: n(reloc),
    vendors,
  };
}

const generate = asyncHandler(async (req, res) => {
  const eventId = toId(req.params.eventId, 'event id');
  const report = await buildReport(eventId);
  reportCache.set(eventId, report);
  res.json(report);
});

const print = asyncHandler(async (req, res) => {
  const eventId = toId(req.params.eventId, 'event id');
  let report = reportCache.get(eventId);
  if (!report) {
    report = await buildReport(eventId);
    reportCache.set(eventId, report);
  }
  res.json({ ...report, printedAt: new Date().toISOString() });
});

module.exports = { generate, print };
