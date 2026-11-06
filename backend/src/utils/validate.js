// Small input helpers used by the controllers.
const httpError = require('./httpError');

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  if (missing.length) throw httpError(400, `Missing required field(s): ${missing.join(', ')}.`);
}

function toId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `Invalid ${label}.`);
  return n;
}

function isTime(v) {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(v));
}

function isDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v));
}

function clean(v, max = 255) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s.slice(0, max);
}

module.exports = { requireFields, toId, isTime, isDate, clean };
