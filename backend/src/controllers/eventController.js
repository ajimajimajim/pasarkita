// Market events, their map image, and the map layout (lots + facilities).
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { today, phaseOf } = require('../utils/dates');
const { requireFields, toId, isTime, isDate, clean } = require('../utils/validate');

const FACILITY_TYPES = ['parking', 'toilet', 'surau', 'registration', 'entrance', 'water', 'trash',
  'food', 'stage', 'firstaid', 'loading', 'info'];

function withPhase(ev) {
  return { ...ev, phase: ev.status === 'cancelled' ? 'cancelled' : phaseOf(ev.event_date) };
}

async function findEvent(eventId) {
  const [rows] = await db.query('SELECT * FROM market_events WHERE event_id = ?', [eventId]);
  if (!rows[0]) throw httpError(404, 'Event not found.');
  return withPhase(rows[0]);
}

// Public: ongoing + upcoming events that are not cancelled.
const listActive = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT e.*,
            (SELECT COUNT(*) FROM lots l WHERE l.event_id = e.event_id) AS total_lots,
            (SELECT COUNT(*) FROM lots l WHERE l.event_id = e.event_id AND l.vendor_id IS NOT NULL) AS taken_lots
     FROM market_events e
     WHERE e.status = 'scheduled' AND e.event_date >= ?
     ORDER BY e.event_date, e.start_time`,
    [today()]
  );
  res.json(rows.map(withPhase));
});

// Organizer: every event, including past and cancelled.
const listAll = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT e.*,
            (SELECT COUNT(*) FROM lots l WHERE l.event_id = e.event_id) AS total_lots,
            (SELECT COUNT(*) FROM lots l WHERE l.event_id = e.event_id AND l.vendor_id IS NOT NULL) AS taken_lots,
            (SELECT COUNT(*) FROM stall_applications a WHERE a.event_id = e.event_id AND a.status = 'pending') AS pending_applications
     FROM market_events e
     ORDER BY e.event_date DESC, e.start_time`
  );
  res.json(rows.map(withPhase));
});

const getEvent = asyncHandler(async (req, res) => {
  res.json(await findEvent(toId(req.params.id, 'event id')));
});

function readEventBody(b) {
  requireFields(b, ['name', 'eventDate', 'location', 'startTime', 'endTime']);
  if (!isDate(b.eventDate)) throw httpError(400, 'Event date must be a valid date.');
  if (!isTime(b.startTime) || !isTime(b.endTime)) throw httpError(400, 'Start and end time must be valid times.');
  if (String(b.endTime).slice(0, 5) <= String(b.startTime).slice(0, 5)) {
    throw httpError(400, 'End time must be later than start time.');
  }
  return [clean(b.name, 150), b.eventDate, clean(b.location, 200), b.startTime, b.endTime];
}

const createEvent = asyncHandler(async (req, res) => {
  const values = readEventBody(req.body);
  if (values[1] < today()) throw httpError(400, 'Event date cannot be in the past.');
  const [r] = await db.query(
    'INSERT INTO market_events (name, event_date, location, start_time, end_time) VALUES (?, ?, ?, ?, ?)', values);
  res.status(201).json({ message: 'Event created.', eventId: r.insertId });
});

const updateEvent = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'event id');
  await findEvent(id);
  const values = readEventBody(req.body);
  await db.query(
    'UPDATE market_events SET name = ?, event_date = ?, location = ?, start_time = ?, end_time = ? WHERE event_id = ?',
    [...values, id]);
  res.json({ message: 'Event updated.' });
});

const setStatus = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'event id');
  const status = req.body.status;
  if (!['scheduled', 'cancelled'].includes(status)) throw httpError(400, 'Status must be scheduled or cancelled.');
  await findEvent(id);
  await db.query('UPDATE market_events SET status = ? WHERE event_id = ?', [status, id]);
  res.json({ message: status === 'cancelled' ? 'Event cancelled.' : 'Event restored.' });
});

const deleteEvent = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'event id');
  await findEvent(id);
  const [apps] = await db.query(
    "SELECT COUNT(*) AS n FROM stall_applications WHERE event_id = ? AND status IN ('pending','accepted')", [id]);
  if (apps[0].n > 0) {
    throw httpError(409, 'This event has vendor applications. Cancel the event instead of deleting it.');
  }
  await db.query('DELETE FROM market_events WHERE event_id = ?', [id]);
  res.json({ message: 'Event deleted.' });
});

function removeOldUpload(url) {
  if (url && url.startsWith('/uploads/maps/')) {
    const file = path.join(__dirname, '..', '..', url);
    fs.promises.unlink(file).catch(() => {});
  }
}

const uploadMap = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'event id');
  if (!req.file) throw httpError(400, 'Please choose a map image to upload.');
  const ev = await findEvent(id).catch((e) => { fs.promises.unlink(req.file.path).catch(() => {}); throw e; });
  const url = `/uploads/maps/${req.file.filename}`;
  await db.query('UPDATE market_events SET map_image_url = ? WHERE event_id = ?', [url, id]);
  removeOldUpload(ev.map_image_url);
  res.json({ message: 'Map image uploaded.', mapImageUrl: url });
});

const removeMap = asyncHandler(async (req, res) => {
  const id = toId(req.params.id, 'event id');
  const ev = await findEvent(id);
  await db.query('UPDATE market_events SET map_image_url = NULL WHERE event_id = ?', [id]);
  removeOldUpload(ev.map_image_url);
  res.json({ message: 'Map image removed.' });
});

// Public: everything needed to draw the map.
async function loadMap(eventId) {
  const event = await findEvent(eventId);
  const [lots] = await db.query(
    `SELECT l.*, v.name AS vendor_name, v.goods_type AS vendor_goods,
            (SELECT COUNT(*) FROM stall_applications a WHERE a.lot_id = l.lot_id AND a.status = 'pending') AS pending_count
     FROM lots l LEFT JOIN vendors v ON v.vendor_id = l.vendor_id
     WHERE l.event_id = ? ORDER BY l.lot_number`, [eventId]);
  const [facilities] = await db.query('SELECT * FROM facilities WHERE event_id = ? ORDER BY facility_id', [eventId]);
  return { event, lots, facilities };
}

const getMap = asyncHandler(async (req, res) => {
  res.json(await loadMap(toId(req.params.id, 'event id')));
});

// --- Map editor save -------------------------------------------------------
function num(v, label, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `${label} must be between ${min} and ${max}.`);
  return Math.round(n * 100) / 100;
}

function readBox(item, label) {
  const box = {
    pos_x: num(item.pos_x, `${label} X position`, 0, 100),
    pos_y: num(item.pos_y, `${label} Y position`, 0, 100),
    width: num(item.width, `${label} width`, 1, 100),
    height: num(item.height, `${label} height`, 1, 100),
  };
  if (box.pos_x + box.width > 100.5 || box.pos_y + box.height > 100.5) throw httpError(400, `${label} is outside the map.`);
  return box;
}

const saveLayout = asyncHandler(async (req, res) => {
  const eventId = toId(req.params.id, 'event id');
  await findEvent(eventId);
  const lotsIn = Array.isArray(req.body.lots) ? req.body.lots : [];
  const facilitiesIn = Array.isArray(req.body.facilities) ? req.body.facilities : [];

  // Validate lots.
  const seen = new Set();
  const lots = lotsIn.map((l, i) => {
    const lotNumber = clean(l.lot_number, 20);
    if (!lotNumber) throw httpError(400, `Lot #${i + 1} needs a lot number.`);
    const key = lotNumber.toUpperCase();
    if (seen.has(key)) throw httpError(400, `Lot number "${lotNumber}" is used twice. Each lot needs a unique number.`);
    seen.add(key);
    const price = Number(l.price ?? 0);
    if (!Number.isFinite(price) || price < 0) throw httpError(400, `Lot ${lotNumber}: price must be 0 or more.`);
    return {
      lot_id: l.lot_id ? toId(l.lot_id, 'lot id') : null,
      lot_number: lotNumber,
      size_label: clean(l.size_label, 50),
      zone: clean(l.zone, 60),
      price: Math.round(price * 100) / 100,
      ...readBox(l, `Lot ${lotNumber}`),
    };
  });

  const facilities = facilitiesIn.map((f, i) => {
    if (!FACILITY_TYPES.includes(f.type)) throw httpError(400, `Facility #${i + 1} has an unknown type.`);
    return { type: f.type, label: clean(f.label, 60), ...readBox(f, `Facility ${f.label || f.type}`) };
  });

  await withTransaction(async (conn) => {
    const [existing] = await conn.query(
      `SELECT l.lot_id, l.lot_number, l.vendor_id,
              (SELECT COUNT(*) FROM stall_applications a WHERE a.lot_id = l.lot_id AND a.status IN ('pending','accepted')) AS active_apps
       FROM lots l WHERE l.event_id = ? FOR UPDATE`, [eventId]);
    const existingIds = new Set(existing.map((e) => e.lot_id));

    for (const l of lots) {
      if (l.lot_id && !existingIds.has(l.lot_id)) throw httpError(400, `Lot ${l.lot_number} does not belong to this event.`);
    }

    // Lots removed in the editor.
    const keptIds = new Set(lots.filter((l) => l.lot_id).map((l) => l.lot_id));
    const removed = existing.filter((e) => !keptIds.has(e.lot_id));
    const blocked = removed.filter((e) => e.vendor_id || e.active_apps > 0);
    if (blocked.length) {
      throw httpError(409, `Cannot delete lot ${blocked.map((b) => b.lot_number).join(', ')}: a vendor has it or has applied for it. Reject or remove the vendor first.`);
    }
    if (removed.length) await conn.query('DELETE FROM lots WHERE lot_id IN (?)', [removed.map((r) => r.lot_id)]);

    // Temporary numbers first, so swapping two lot numbers does not clash.
    for (const l of lots.filter((x) => x.lot_id)) {
      await conn.query('UPDATE lots SET lot_number = ? WHERE lot_id = ?', [`__tmp_${l.lot_id}`, l.lot_id]);
    }
    for (const l of lots) {
      const vals = [l.lot_number, l.size_label, l.zone, l.price, l.pos_x, l.pos_y, l.width, l.height];
      if (l.lot_id) {
        await conn.query(
          `UPDATE lots SET lot_number = ?, size_label = ?, zone = ?, price = ?, pos_x = ?, pos_y = ?, width = ?, height = ?
           WHERE lot_id = ?`, [...vals, l.lot_id]);
      } else {
        await conn.query(
          `INSERT INTO lots (lot_number, size_label, zone, price, pos_x, pos_y, width, height, event_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...vals, eventId]);
      }
    }

    await conn.query('DELETE FROM facilities WHERE event_id = ?', [eventId]);
    for (const f of facilities) {
      await conn.query(
        'INSERT INTO facilities (event_id, type, label, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [eventId, f.type, f.label, f.pos_x, f.pos_y, f.width, f.height]);
    }
  });

  res.json({ message: 'Map saved.', ...(await loadMap(eventId)) });
});

module.exports = {
  FACILITY_TYPES, findEvent, listActive, listAll, getEvent, createEvent, updateEvent, setStatus, deleteEvent,
  uploadMap, removeMap, getMap, saveLayout,
};
