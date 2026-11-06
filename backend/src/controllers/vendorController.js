// Organizer manages vendor records.
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { requireFields, toId, clean } = require('../utils/validate');

const list = asyncHandler(async (req, res) => {
  const search = clean(req.query.search, 100);
  const params = [];
  let where = '';
  if (search) {
    where = 'WHERE v.name LIKE ? OR v.goods_type LIKE ? OR u.username LIKE ? OR v.contact_number LIKE ?';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const [rows] = await db.query(
    `SELECT v.*, u.username,
            (SELECT COUNT(*) FROM stall_applications a WHERE a.vendor_id = v.vendor_id AND a.status = 'accepted') AS accepted_lots,
            (SELECT COUNT(*) FROM stall_applications a WHERE a.vendor_id = v.vendor_id AND a.status = 'pending') AS pending_applications
     FROM vendors v JOIN users u ON u.user_id = v.user_id ${where} ORDER BY v.name`, params);
  res.json(rows);
});

const get = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'vendor id');
  const [rows] = await db.query('SELECT v.*, u.username FROM vendors v JOIN users u ON u.user_id = v.user_id WHERE v.vendor_id = ?', [id]);
  if (!rows[0]) throw httpError(404, 'Vendor not found.');
  const [apps] = await db.query(
    `SELECT a.application_id, a.status, a.created_at, e.name AS event_name, e.event_date, l.lot_number
     FROM stall_applications a JOIN market_events e ON e.event_id = a.event_id LEFT JOIN lots l ON l.lot_id = a.lot_id
     WHERE a.vendor_id = ? ORDER BY e.event_date DESC`, [id]);
  res.json({ ...rows[0], applications: apps });
});

const update = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'vendor id');
  const b = req.body;
  requireFields(b, ['name', 'contactNumber']);
  const [r] = await db.query(
    'UPDATE vendors SET name = ?, contact_number = ?, email = ?, goods_type = ?, stall_size_required = ? WHERE vendor_id = ?',
    [clean(b.name, 120), clean(b.contactNumber, 30), clean(b.email, 120), clean(b.goodsType, 100), clean(b.stallSizeRequired, 50), id]);
  if (!r.affectedRows) throw httpError(404, 'Vendor not found.');
  res.json({ message: 'Vendor updated.' });
});

const remove = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'vendor id');
  const [rows] = await db.query('SELECT user_id FROM vendors WHERE vendor_id = ?', [id]);
  if (!rows[0]) throw httpError(404, 'Vendor not found.');
  // Deleting the login account removes the vendor and their records; their lots become free.
  await db.query('DELETE FROM users WHERE user_id = ?', [rows[0].user_id]);
  res.json({ message: 'Vendor account deleted. Their lots are free again.' });
});

module.exports = { list, get, update, remove };
