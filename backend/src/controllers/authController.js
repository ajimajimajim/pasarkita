// Login, vendor registration, current user, change password.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { requireFields, clean } = require('../utils/validate');

async function profileFor(userId, role) {
  const table = role === 'organizer' ? 'organizers' : 'vendors';
  const idCol = role === 'organizer' ? 'organizer_id' : 'vendor_id';
  const [rows] = await db.query(`SELECT ${idCol} AS profile_id, name FROM ${table} WHERE user_id = ?`, [userId]);
  return rows[0] || null;
}

const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ['username', 'password']);
  const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [String(req.body.username).trim()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(req.body.password), user.password_hash))) {
    throw httpError(401, 'Wrong username or password.');
  }
  const profile = await profileFor(user.user_id, user.role);
  if (!profile) throw httpError(403, 'This account has no profile. Please contact the organizer.');

  const token = jwt.sign(
    { userId: user.user_id, role: user.role, profileId: profile.profile_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  res.json({ token, role: user.role, name: profile.name });
});

const register = asyncHandler(async (req, res) => {
  requireFields(req.body, ['username', 'password', 'name', 'contactNumber']);
  const username = String(req.body.username).trim();
  if (!/^[A-Za-z0-9_.]{3,50}$/.test(username)) {
    throw httpError(400, 'Username must be 3-50 characters: letters, numbers, _ or . only.');
  }
  if (String(req.body.password).length < 8) throw httpError(400, 'Password must be at least 8 characters.');

  const [existing] = await db.query('SELECT user_id FROM users WHERE username = ?', [username]);
  if (existing.length) throw httpError(409, 'That username is already taken.');

  const hash = await bcrypt.hash(String(req.body.password), 10);
  await withTransaction(async (conn) => {
    const [u] = await conn.query('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)', ['vendor', username, hash]);
    await conn.query(
      `INSERT INTO vendors (user_id, name, contact_number, email, goods_type, stall_size_required)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [u.insertId, clean(req.body.name, 120), clean(req.body.contactNumber, 30), clean(req.body.email, 120),
        clean(req.body.goodsType, 100), clean(req.body.stallSizeRequired, 50)]
    );
  });
  res.status(201).json({ message: 'Registration successful. You can now log in.' });
});

const me = asyncHandler(async (req, res) => {
  const profile = await profileFor(req.user.userId, req.user.role);
  if (!profile) throw httpError(401, 'Account no longer exists. Please log in again.');
  res.json({ role: req.user.role, name: profile.name, profileId: profile.profile_id });
});

const changePassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ['currentPassword', 'newPassword']);
  if (String(req.body.newPassword).length < 8) throw httpError(400, 'New password must be at least 8 characters.');
  const [rows] = await db.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.userId]);
  if (!rows[0] || !(await bcrypt.compare(String(req.body.currentPassword), rows[0].password_hash))) {
    throw httpError(400, 'Current password is wrong.');
  }
  const hash = await bcrypt.hash(String(req.body.newPassword), 10);
  await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, req.user.userId]);
  res.json({ message: 'Password changed.' });
});

module.exports = { login, register, me, changePassword };
