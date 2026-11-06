// Stall fee payments: vendor uploads receipt, organizer verifies or rejects.
const fs = require('fs');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { requireFields, toId, clean } = require('../utils/validate');
const { findApplication } = require('./applicationController');

const PAY_SELECT = `
  SELECT p.*, v.name AS vendor_name, e.name AS event_name, e.event_date, l.lot_number, l.price AS lot_price
  FROM payments p
  JOIN vendors v ON v.vendor_id = p.vendor_id
  JOIN market_events e ON e.event_id = p.event_id
  JOIN stall_applications a ON a.application_id = p.application_id
  LEFT JOIN lots l ON l.lot_id = a.lot_id`;

const create = asyncHandler(async (req, res) => {
  const discardFile = () => { if (req.file) fs.promises.unlink(req.file.path).catch(() => {}); };
  try {
    if (!req.file) throw httpError(400, 'Please attach your receipt (JPG, PNG or PDF).');
    requireFields(req.body, ['applicationId', 'amount']);
    const app = await findApplication(toId(req.body.applicationId, 'application id'));
    if (app.vendor_id !== req.user.profileId) throw httpError(404, 'Application not found.');
    if (app.status !== 'accepted') throw httpError(400, 'You can only pay for a lot you have been given.');
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Amount must be more than 0.');

    const [open] = await db.query(
      "SELECT status FROM payments WHERE application_id = ? AND status IN ('pending','verified')", [app.application_id]);
    if (open.length) {
      throw httpError(409, open[0].status === 'verified' ? 'This lot is already paid.' : 'Your payment is still waiting for verification.');
    }

    const url = `/uploads/receipts/${req.file.filename}`;
    const [r] = await db.query(
      'INSERT INTO payments (application_id, vendor_id, event_id, amount, receipt_file_url) VALUES (?, ?, ?, ?, ?)',
      [app.application_id, app.vendor_id, app.event_id, Math.round(amount * 100) / 100, url]);
    res.status(201).json({ message: 'Payment sent. Waiting for the organizer to verify.', paymentId: r.insertId });
  } catch (err) {
    discardFile();
    throw err;
  }
});

const mine = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`${PAY_SELECT} WHERE p.vendor_id = ? ORDER BY p.created_at DESC`, [req.user.profileId]);
  res.json(rows);
});

const list = asyncHandler(async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) { where = 'WHERE p.status = ?'; params.push(req.query.status); }
  const [rows] = await db.query(`${PAY_SELECT} ${where} ORDER BY p.created_at DESC`, params);
  res.json(rows);
});

const review = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'payment id');
  const { status } = req.body;
  if (!['verified', 'rejected'].includes(status)) throw httpError(400, 'Status must be verified or rejected.');
  const [r] = await db.query(
    "UPDATE payments SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE payment_id = ? AND status = 'pending'",
    [status, clean(req.body.note, 255), req.user.userId, id]);
  if (!r.affectedRows) throw httpError(409, 'Payment not found or already reviewed.');
  res.json({ message: status === 'verified' ? 'Payment verified.' : 'Payment rejected.' });
});

module.exports = { create, mine, list, review };
