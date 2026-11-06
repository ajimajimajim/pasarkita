// npm run setup            -> creates all tables and loads demo data (dates are relative to TODAY)
// npm run setup -- --empty -> creates all tables with only the organizer account and helpers
//
// WARNING: this wipes every table. Run it again before your presentation so the
// demo "ongoing" event is dated today.
require('dotenv').config({ quiet: true, path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const EMPTY = process.argv.includes('--empty');
const DB_NAME = process.env.DB_NAME || 'pasarkita';
const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const DEMO_RECEIPT = path.join(__dirname, '..', '..', '..', 'database', 'demo-receipt.png');
const DEMO_MAP = '/assets/img/demo-venue.png';
const PASSWORD = 'Password123!';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function connect() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    dateStrings: ['DATE'],
  };
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      return await mysql.createConnection(config);
    } catch (err) {
      if (err.code === 'ER_ACCESS_DENIED_ERROR') throw err;
      console.log(`Waiting for the database (${attempt}/30): ${err.code || err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('Could not connect to MySQL. Is Docker (or XAMPP) running?');
}

function cleanUploads() {
  for (const folder of ['receipts', 'maps']) {
    const dir = path.join(UPLOADS, folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f !== '.gitkeep') fs.unlinkSync(path.join(dir, f));
  }
}

// The same demo layout is used for every demo event. Values are % of the map.
const LOTS = [
  // zone, number, x, y, w, h, size, price
  ['Food Court', 'F1', 6, 50, 9, 11, '10ft x 10ft', 80], ['Food Court', 'F2', 17, 50, 9, 11, '10ft x 10ft', 80],
  ['Food Court', 'F3', 28, 50, 9, 11, '10ft x 10ft', 80],
  ['Riverside', 'R1', 6, 70, 9, 11, '10ft x 12ft', 60], ['Riverside', 'R2', 17, 70, 9, 11, '10ft x 12ft', 60],
  ['Riverside', 'R3', 28, 70, 9, 11, '10ft x 12ft', 60], ['Riverside', 'R4', 61, 70, 9, 11, '10ft x 12ft', 60],
  ['Riverside', 'R5', 72, 70, 9, 11, '10ft x 12ft', 60], ['Riverside', 'R6', 83, 70, 9, 11, '10ft x 12ft', 60],
  ['Garden', 'G1', 61, 33, 9, 11, '8ft x 10ft', 50], ['Garden', 'G2', 72, 33, 9, 11, '8ft x 10ft', 50],
  ['Garden', 'G3', 83, 33, 9, 11, '8ft x 10ft', 50], ['Garden', 'G4', 61, 50, 9, 11, '8ft x 10ft', 50],
  ['Garden', 'G5', 72, 50, 9, 11, '8ft x 10ft', 50],
];
const FACILITIES = [
  ['parking', 'Parking', 3, 2, 19, 13], ['registration', 'Registration', 26, 2, 9, 12],
  ['entrance', 'Entrance', 46.5, 2, 7, 12], ['firstaid', 'First Aid', 88, 2, 7, 12],
  ['surau', 'Surau', 6, 33, 9, 11], ['toilet', 'Toilet', 17, 33, 9, 11],
  ['water', 'Water', 28, 34, 5, 8], ['trash', 'Bins', 35, 34, 5, 8],
  ['loading', 'Loading Bay', 83, 50, 9, 11],
];

async function main() {
  const conn = await connect();
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
  } catch (err) {
    console.log(`(Could not create database "${DB_NAME}" - assuming it already exists.)`);
  }
  await conn.query(`USE \`${DB_NAME}\``);

  console.log('Creating tables...');
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  cleanUploads();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const q = async (sql, params) => (await conn.query(sql, params))[0];

  // Organizer
  const org = await q("INSERT INTO users (role, username, password_hash) VALUES ('organizer', 'organizer1', ?)", [hash]);
  await q('INSERT INTO organizers (user_id, name, phone, email) VALUES (?, ?, ?, ?)',
    [org.insertId, 'Puan Aminah (Organizer)', '012-300 4455', 'organizer@pasarkita.test']);

  // Helpers
  for (const h of [['Razak', '011-1111 2222', 'porter'], ['Farid', '011-3333 4444', 'trolley'],
    ['Mei Ling', '011-5555 6666', 'porter'], ['Kumar', '011-7777 8888', 'trolley']]) {
    await q('INSERT INTO helpers (name, contact_number, service_type) VALUES (?, ?, ?)', h);
  }

  if (EMPTY) {
    console.log('\nDone (empty mode). Log in as organizer1 /', PASSWORD);
    await conn.end();
    return;
  }

  // Vendors
  const vendorData = [
    ['vendor1', 'Kak Siti Kuih', '012-345 6789', 'siti@example.com', 'Traditional kuih', '10ft x 10ft'],
    ['vendor2', 'Ahmad Fresh Fruit', '013-987 6543', 'ahmad@example.com', 'Fresh fruit', '10ft x 12ft'],
    ['vendor3', 'Mei Ling Crafts', '016-222 3344', 'meiling@example.com', 'Handicrafts', '8ft x 10ft'],
    ['vendor4', 'Raju Teh Tarik', '017-555 1212', 'raju@example.com', 'Drinks', '8ft x 10ft'],
    ['vendor5', 'Nurul Burger Bakar', '019-888 7766', 'nurul@example.com', 'Burgers', '10ft x 10ft'],
    ['vendor6', 'Farah Batik', '018-444 9090', 'farah@example.com', 'Batik clothing', '10ft x 12ft'],
  ];
  const V = {};
  for (const [username, ...profile] of vendorData) {
    const u = await q("INSERT INTO users (role, username, password_hash) VALUES ('vendor', ?, ?)", [username, hash]);
    const v = await q(
      'INSERT INTO vendors (user_id, name, contact_number, email, goods_type, stall_size_required) VALUES (?, ?, ?, ?, ?, ?)',
      [u.insertId, ...profile]);
    V[username] = v.insertId;
  }

  // Events, each with the demo layout
  async function makeEvent(name, offset, location, start, end) {
    const e = await q(
      'INSERT INTO market_events (name, event_date, location, start_time, end_time, map_image_url) VALUES (?, ?, ?, ?, ?, ?)',
      [name, dateOffset(offset), location, start, end, DEMO_MAP]);
    const lots = {};
    for (const [zone, num, x, y, w, h, size, price] of LOTS) {
      const l = await q(
        'INSERT INTO lots (event_id, lot_number, zone, pos_x, pos_y, width, height, size_label, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [e.insertId, num, zone, x, y, w, h, size, price]);
      lots[num] = { id: l.insertId, price };
    }
    for (const [type, label, x, y, w, h] of FACILITIES) {
      await q('INSERT INTO facilities (event_id, type, label, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [e.insertId, type, label, x, y, w, h]);
    }
    return { id: e.insertId, lots };
  }

  // status: 'accepted' | 'pending' | 'rejected'
  async function application(ev, vendor, lotNum, status, extra = {}) {
    const lot = ev.lots[lotNum];
    const a = await q(
      `INSERT INTO stall_applications (vendor_id, event_id, lot_id, goods_description, notes, status, attendance, arrival_time, organizer_note, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [V[vendor], ev.id, lot.id, extra.goods || null, extra.notes || null, status, extra.attendance || 'unconfirmed',
        extra.arrival || null, extra.note || null, status === 'pending' ? null : new Date()]);
    if (status === 'accepted') await q('UPDATE lots SET vendor_id = ? WHERE lot_id = ?', [V[vendor], lot.id]);
    return { id: a.insertId, vendor: V[vendor], event: ev.id, lot };
  }

  let receiptNo = 0;
  async function payment(app, status) {
    receiptNo += 1;
    const file = `receipts-demo-${receiptNo}.png`;
    fs.copyFileSync(DEMO_RECEIPT, path.join(UPLOADS, 'receipts', file));
    await q(
      `INSERT INTO payments (application_id, vendor_id, event_id, amount, receipt_file_url, status, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [app.id, app.vendor, app.event, app.lot.price, `/uploads/receipts/${file}`, status,
        status === 'pending' ? null : org.insertId, status === 'pending' ? null : new Date()]);
  }

  const today = await makeEvent('PasarKita Night Market', 0, 'Dataran PasarKita, Shah Alam', '16:00', '23:00');
  const soon = await makeEvent('Weekend Family Bazaar', 5, 'Taman Jaya, Petaling Jaya', '08:00', '14:00');
  const later = await makeEvent('Merdeka Craft Fair', 12, 'Padang Merdeka, Kajang', '17:00', '22:00');
  const past = await makeEvent('Last Week Night Market', -7, 'Dataran PasarKita, Shah Alam', '16:00', '23:00');

  // Ongoing (today)
  const t1 = await application(today, 'vendor1', 'F1', 'accepted', { goods: 'Kuih lapis, onde-onde', attendance: 'attending', arrival: '15:00' });
  const t2 = await application(today, 'vendor2', 'R1', 'accepted', { goods: 'Durian, rambutan', attendance: 'attending', arrival: '15:30' });
  await application(today, 'vendor4', 'F2', 'accepted', { goods: 'Teh tarik, kopi' });
  const t5 = await application(today, 'vendor5', 'F3', 'accepted', { goods: 'Burger bakar', attendance: 'attending', arrival: '15:00' });
  await payment(t1, 'verified');
  await payment(t2, 'verified');
  await payment(t5, 'pending');
  await q("INSERT INTO helper_requests (application_id, vendor_id, event_id, service_type, requested_time, notes, status, helper_id) VALUES (?, ?, ?, 'trolley', '15:30', '6 boxes of fruit', 'assigned', 2)",
    [t2.id, t2.vendor, today.id]);

  // Upcoming (in 5 days)
  const s1 = await application(soon, 'vendor1', 'G1', 'accepted', { goods: 'Kuih muih', attendance: 'attending', arrival: '07:00' });
  const s3 = await application(soon, 'vendor3', 'R4', 'accepted', { goods: 'Rattan baskets, keychains' });
  await application(soon, 'vendor2', 'G2', 'pending', { goods: 'Fresh fruit', notes: 'Need a lot near the road for my lorry.' });
  await application(soon, 'vendor4', 'G2', 'pending', { goods: 'Drinks', notes: 'Shaded lot please.' });
  await application(soon, 'vendor5', 'R2', 'pending', { goods: 'Burger bakar' });
  await payment(s1, 'pending');
  await q("INSERT INTO relocation_requests (application_id, vendor_id, from_lot_id, to_lot_id, reason) VALUES (?, ?, ?, ?, 'Closer to the loading bay for my heavy items.')",
    [s3.id, s3.vendor, soon.lots.R4.id, soon.lots.R5.id]);
  await q("INSERT INTO helper_requests (application_id, vendor_id, event_id, service_type, requested_time, notes) VALUES (?, ?, ?, 'porter', '07:15', 'Two tables and display racks')",
    [s3.id, s3.vendor, soon.id]);

  // Upcoming (in 12 days)
  await application(later, 'vendor1', 'R1', 'pending', { goods: 'Kuih raya' });

  // Past
  const p1 = await application(past, 'vendor1', 'F1', 'accepted', { attendance: 'attending', arrival: '15:00' });
  const p2 = await application(past, 'vendor2', 'R1', 'accepted', { attendance: 'attending', arrival: '15:15' });
  await payment(p1, 'verified');
  await payment(p2, 'verified');

  await conn.end();
  console.log('\nDone! Demo data loaded. Every password is', PASSWORD);
  console.log('  Organizer: organizer1');
  console.log('  Vendors:   vendor1 ... vendor6  (vendor6 has no applications yet)');
}

main().catch((err) => {
  console.error('\nSetup failed:', err.code || '', err.message);
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('Check DB_USER / DB_PASSWORD in backend/.env');
  process.exit(1);
});
