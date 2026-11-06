// View and edit your own profile (organizer or vendor).
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { requireFields, clean } = require('../utils/validate');

const getProfile = asyncHandler(async (req, res) => {
  const { role, userId } = req.user;
  const sql = role === 'organizer'
    ? `SELECT o.*, u.username FROM organizers o JOIN users u ON u.user_id = o.user_id WHERE o.user_id = ?`
    : `SELECT v.*, u.username FROM vendors v JOIN users u ON u.user_id = v.user_id WHERE v.user_id = ?`;
  const [rows] = await db.query(sql, [userId]);
  if (!rows[0]) throw httpError(404, 'Profile not found.');
  res.json({ role, ...rows[0] });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { role, userId } = req.user;
  const b = req.body;
  if (role === 'organizer') {
    requireFields(b, ['name']);
    await db.query('UPDATE organizers SET name = ?, phone = ?, email = ? WHERE user_id = ?',
      [clean(b.name, 120), clean(b.phone, 30), clean(b.email, 120), userId]);
  } else {
    requireFields(b, ['name', 'contactNumber']);
    await db.query(
      `UPDATE vendors SET name = ?, contact_number = ?, email = ?, goods_type = ?, stall_size_required = ?
       WHERE user_id = ?`,
      [clean(b.name, 120), clean(b.contactNumber, 30), clean(b.email, 120), clean(b.goodsType, 100),
        clean(b.stallSizeRequired, 50), userId]
    );
  }
  res.json({ message: 'Profile saved.' });
});

module.exports = { getProfile, updateProfile };
