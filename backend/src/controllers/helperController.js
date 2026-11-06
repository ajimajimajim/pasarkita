// Helper roster (organizer) and helper requests (vendor asks, organizer assigns).
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { phaseOf } = require('../utils/dates');
const { requireFields, toId, isTime, clean } = require('../utils/validate');
const { findApplication } = require('./applicationController');

const SERVICE_TYPES = ['porter', 'trolley'];

// ---------------- Roster ----------------
const listHelpers = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT h.*, (SELECT COUNT(*) FROM helper_requests r WHERE r.helper_id = h.helper_id AND r.status = 'assigned') AS active_jobs
     FROM helpers h ORDER BY h.name`);
  res.json(rows);
});

function readHelper(b) {
  requireFields(b, ['name', 'serviceType']);
  if (!SERVICE_TYPES.includes(b.serviceType)) throw httpError(400, 'Service type must be porter or trolley.');
  const status = b.status || 'available';
  if (!['available', 'off_duty'].includes(status)) throw httpError(400, 'Status must be available or off duty.');
  return [clean(b.name, 120), clean(b.contactNumber, 30), b.serviceType, status];
}

const createHelper = asyncHandler(async (req, res) => {
  const [r] = await db.query('INSERT INTO helpers (name, contact_number, service_type, status) VALUES (?, ?, ?, ?)', readHelper(req.body));
  res.status(201).json({ message: 'Helper added.', helperId: r.insertId });
});

const updateHelper = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'helper id');
  const [r] = await db.query('UPDATE helpers SET name = ?, contact_number = ?, service_type = ?, status = ? WHERE helper_id = ?',
    [...readHelper(req.body), id]);
  if (!r.affectedRows) throw httpError(404, 'Helper not found.');
  res.json({ message: 'Helper updated.' });
});

const deleteHelper = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'helper id');
  const [jobs] = await db.query("SELECT COUNT(*) AS n FROM helper_requests WHERE helper_id = ? AND status = 'assigned'", [id]);
  if (jobs[0].n > 0) throw httpError(409, 'This helper has assigned jobs. Mark them off duty instead, or reassign the jobs first.');
  const [r] = await db.query('DELETE FROM helpers WHERE helper_id = ?', [id]);
  if (!r.affectedRows) throw httpError(404, 'Helper not found.');
  res.json({ message: 'Helper removed.' });
});

// ---------------- Requests ----------------
const REQ_SELECT = `
  SELECT r.*, v.name AS vendor_name, v.contact_number AS vendor_contact,
         e.name AS event_name, e.event_date, l.lot_number, l.zone,
         h.name AS helper_name, h.contact_number AS helper_contact
  FROM helper_requests r
  JOIN vendors v ON v.vendor_id = r.vendor_id
  JOIN market_events e ON e.event_id = r.event_id
  JOIN stall_applications a ON a.application_id = r.application_id
  LEFT JOIN lots l ON l.lot_id = a.lot_id
  LEFT JOIN helpers h ON h.helper_id = r.helper_id`;

const createRequest = asyncHandler(async (req, res) => {
  requireFields(req.body, ['applicationId', 'serviceType', 'requestedTime']);
  const app = await findApplication(toId(req.body.applicationId, 'application id'));
  if (app.vendor_id !== req.user.profileId) throw httpError(404, 'Application not found.');
  if (app.status !== 'accepted') throw httpError(400, 'You can only request a helper for a lot you have been given.');
  if (app.phase === 'past' || app.phase === 'cancelled') throw httpError(400, 'This event is no longer active.');
  if (!SERVICE_TYPES.includes(req.body.serviceType)) throw httpError(400, 'Service type must be porter or trolley.');
  if (!isTime(req.body.requestedTime)) throw httpError(400, 'Please give a valid time.');

  const [r] = await db.query(
    `INSERT INTO helper_requests (application_id, vendor_id, event_id, service_type, requested_time, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [app.application_id, app.vendor_id, app.event_id, req.body.serviceType, req.body.requestedTime, clean(req.body.notes, 500)]);
  res.status(201).json({ message: 'Helper request sent.', requestId: r.insertId });
});

const myRequests = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`${REQ_SELECT} WHERE r.vendor_id = ? ORDER BY e.event_date DESC, r.requested_time`, [req.user.profileId]);
  res.json(rows);
});

const listRequests = asyncHandler(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) { where = 'WHERE r.status = ?'; params.push(req.query.status); }
  const [rows] = await db.query(`${REQ_SELECT} ${where} ORDER BY e.event_date, r.requested_time`, params);
  res.json(rows.map((r) => ({ ...r, phase: phaseOf(r.event_date) })));
});

async function findRequest(id) {
  const [rows] = await db.query('SELECT * FROM helper_requests WHERE request_id = ?', [id]);
  if (!rows[0]) throw httpError(404, 'Helper request not found.');
  return rows[0];
}

const assign = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'request id');
  const helperId = toId(req.body.helperId, 'helper');
  const request = await findRequest(id);
  if (!['pending', 'assigned'].includes(request.status)) throw httpError(409, `This request is already ${request.status}.`);
  const [h] = await db.query('SELECT * FROM helpers WHERE helper_id = ?', [helperId]);
  if (!h[0]) throw httpError(404, 'Helper not found.');
  if (h[0].status !== 'available') throw httpError(409, `${h[0].name} is off duty.`);
  await db.query("UPDATE helper_requests SET status = 'assigned', helper_id = ?, organizer_note = ? WHERE request_id = ?",
    [helperId, clean(req.body.note, 255), id]);
  res.json({ message: `${h[0].name} assigned.` });
});

const reject = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'request id');
  const request = await findRequest(id);
  if (!['pending', 'assigned'].includes(request.status)) throw httpError(409, `This request is already ${request.status}.`);
  await db.query("UPDATE helper_requests SET status = 'rejected', helper_id = NULL, organizer_note = ? WHERE request_id = ?",
    [clean(req.body.note, 255), id]);
  res.json({ message: 'Helper request rejected.' });
});

const complete = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'request id');
  const request = await findRequest(id);
  if (request.status !== 'assigned') throw httpError(409, 'Only assigned requests can be marked done.');
  await db.query("UPDATE helper_requests SET status = 'completed' WHERE request_id = ?", [id]);
  res.json({ message: 'Marked as done.' });
});

module.exports = {
  listHelpers, createHelper, updateHelper, deleteHelper,
  createRequest, myRequests, listRequests, assign, reject, complete,
};
