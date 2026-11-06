// Small counters for the organizer sidebar badges.
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const counts = asyncHandler(async (req, res) => {
  const [[row]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM stall_applications WHERE status = 'pending') AS applications,
            (SELECT COUNT(*) FROM relocation_requests WHERE status = 'pending') AS relocations,
            (SELECT COUNT(*) FROM helper_requests WHERE status = 'pending') AS helpers,
            (SELECT COUNT(*) FROM payments WHERE status = 'pending') AS payments`);
  const c = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  res.json({ ...c, total: c.applications + c.relocations + c.helpers + c.payments });
});

module.exports = { counts };
