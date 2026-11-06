// PasarKita API test suite (91 test cases).
// HOW TO RUN (in the backend folder):
//   1. npm run setup        <- resets the database to the demo data (REQUIRED: the tests expect it)
//   2. npm start            <- in a second terminal; leave it running
//   3. npm run test:api     <- runs the tests and prints the result
//   4. npm run setup        <- run again afterwards: the tests change the demo data
// Results are also saved to tests/api-results.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
import dotenv from 'dotenv';
dotenv.config({ quiet: true, path: path.join(HERE, '..', '.env') });
const B = `http://localhost:${process.env.PORT || 3000}/api`;
const OUT = process.argv[2] || path.join(HERE, 'api-results.json');
const RECEIPT = path.join(HERE, '..', '..', 'database', 'demo-receipt.png');
const cases = [];
let n = 0;

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(B + path, { method, headers, body: payload });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const say = (r) => `HTTP ${r.status}` + (r.data?.error ? ` - "${r.data.error}"` : r.data?.message ? ` - "${r.data.message}"` : '');
function tc(module, condition, expected, pass, actual) {
  n += 1;
  cases.push({ id: `TC-A${String(n).padStart(2, '0')}`, module, condition, expected, actual, pass: !!pass });
}
async function login(u, p = 'Password123!') { return (await call('POST', '/auth/login', { body: { username: u, password: p } })).data?.token; }
const png = () => new Blob([fs.readFileSync(RECEIPT)], { type: 'image/png' });
const fdPay = (app, amount, file) => { const f = new FormData(); f.append('applicationId', app); f.append('amount', amount); if (file) f.append('receipt', file.blob, file.name); return f; };

// ================= Public view =================
let r = await call('GET', '/events');
tc('Public view', 'Visitor (no login) opens the event list', 'Only today\'s and upcoming events are listed (3 of 4 seeded events; the past event is hidden)',
  r.status === 200 && r.data.length === 3 && r.data[0].phase === 'ongoing', `HTTP ${r.status} - ${r.data.length} events: ${r.data.map(e => e.phase).join(', ')}`);
const [E1, E2, E3] = r.data.map(e => e.event_id);
r = await call('GET', `/events/${E2}/map`);
tc('Public view', 'Visitor opens the stall map of the Weekend Family Bazaar', 'Map returns all 14 lots and 9 facilities with each lot\'s applicant count',
  r.data.lots.length === 14 && r.data.facilities.length === 9, `HTTP ${r.status} - ${r.data.lots.length} lots, ${r.data.facilities.length} facilities`);
const L2 = Object.fromEntries(r.data.lots.map(l => [l.lot_number, l]));
tc('Public view', 'Lot G2 has two vendors applying', 'pending_count for G2 = 2', L2.G2.pending_count === 2, `pending_count = ${L2.G2.pending_count}`);
r = await call('GET', '/events/999/map');
tc('Public view', 'Request the map of an event ID that does not exist (999)', 'HTTP 404 "Event not found."', r.status === 404, say(r));

// ================= Authentication =================
const ORG = await login('organizer1');
const V = {}; for (let i = 1; i <= 6; i++) V[i] = await login(`vendor${i}`);
tc('Authentication', 'Log in with each of the 7 demo accounts (organizer1, vendor1-vendor6)', 'Every login returns a token', ORG && Object.values(V).every(Boolean), `${[ORG, ...Object.values(V)].filter(Boolean).length} of 7 tokens issued`);
r = await call('POST', '/auth/login', { body: { username: 'vendor1', password: 'wrongpass' } });
tc('Authentication', 'Log in with a wrong password', 'HTTP 401 with a message that does not reveal which field was wrong', r.status === 401, say(r));
r = await call('POST', '/auth/register', { body: { username: 'testvendor', password: 'short', name: 'X', contactNumber: '1' } });
tc('Authentication', 'Register with a 5-character password (boundary: minimum is 8)', 'HTTP 400, account not created', r.status === 400, say(r));
r = await call('POST', '/auth/register', { body: { username: 'bad name!', password: 'Password123!', name: 'X', contactNumber: '1' } });
tc('Authentication', 'Register with a username containing a space and "!"', 'HTTP 400, account not created', r.status === 400, say(r));
r = await call('POST', '/auth/register', { body: { username: 'testvendor', password: 'Password123!', name: 'Test Vendor', contactNumber: '011-000 0000' } });
tc('Authentication', 'Register a new vendor with valid details', 'HTTP 201, account created', r.status === 201, say(r));
r = await call('POST', '/auth/register', { body: { username: 'testvendor', password: 'Password123!', name: 'Copy', contactNumber: '1' } });
tc('Authentication', 'Register again with the same username', 'HTTP 409 "That username is already taken."', r.status === 409, say(r));
const NV = await login('testvendor');
tc('Authentication', 'Log in with the newly registered account', 'Login succeeds', !!NV, NV ? 'Token issued' : 'No token');
r = await call('GET', '/auth/me', { token: V[1] });
tc('Authentication', 'vendor1 asks "who am I" with its token', 'Returns role vendor, name Kak Siti Kuih', r.data.role === 'vendor' && r.data.name === 'Kak Siti Kuih', `role=${r.data.role}, name=${r.data.name}`);

// ================= Access control =================
r = await call('GET', '/vendors', { token: V[1] });
tc('Access control', 'Vendor calls the organizer-only vendor list', 'HTTP 403', r.status === 403, say(r));
r = await call('GET', '/vendors');
tc('Access control', 'Call an organizer route with no login token', 'HTTP 401', r.status === 401, say(r));
r = await call('GET', '/vendors', { token: 'not-a-real-token' });
tc('Access control', 'Call an organizer route with a fake token', 'HTTP 401', r.status === 401, say(r));
r = await call('POST', '/applications', { token: ORG, body: { lotId: L2.G3.lot_id } });
tc('Access control', 'Organizer tries to apply for a lot (vendor-only action)', 'HTTP 403', r.status === 403, say(r));

// ================= Stall application =================
r = await call('POST', '/applications', { token: V[6], body: { lotId: L2.G3.lot_id, goodsDescription: 'Batik', notes: 'Near entrance please' } });
tc('Stall application', 'vendor6 (no applications) applies for free lot G3 in an upcoming event', 'HTTP 201, application saved as pending', r.status === 201, say(r));
const v6app = r.data.applicationId;
r = await call('POST', '/applications', { token: V[6], body: { lotId: L2.G4.lot_id } });
tc('Stall application', 'vendor6 applies for a second lot (G4) in the same event', 'HTTP 409: only one pending/accepted lot per vendor per event', r.status === 409, say(r));
r = await call('POST', '/applications', { token: NV, body: { lotId: L2.G1.lot_id } });
tc('Stall application', 'Apply for lot G1, which already has a vendor', 'HTTP 409 "already taken"', r.status === 409, say(r));
const e1 = (await call('GET', `/events/${E1}/map`)).data;
const free1 = e1.lots.find(l => !l.vendor_id);
r = await call('POST', '/applications', { token: NV, body: { lotId: free1.lot_id } });
tc('Stall application', `Apply for free lot ${free1.lot_number} in the event happening today`, 'HTTP 400: applications close on the event day', r.status === 400, say(r));
r = await call('POST', '/applications', { token: V[1], body: { lotId: L2.G5.lot_id } });
tc('Stall application', 'vendor1, who already has lot G1 in this event, applies for G5', 'HTTP 409 telling the vendor to use relocation instead', r.status === 409, say(r));
r = await call('PUT', `/applications/${v6app}/cancel`, { token: V[5] });
tc('Stall application', 'vendor5 tries to cancel vendor6\'s application', 'HTTP 404 (vendors cannot see others\' applications)', r.status === 404, say(r));

// ================= Application review =================
r = await call('GET', `/lots/${L2.G2.lot_id}/applications`, { token: ORG });
tc('Application review', 'Organizer opens the applicant list for lot G2', 'Two pending applicants are listed', r.data.filter(a => a.status === 'pending').length === 2, `${r.data.filter(a => a.status === 'pending').length} pending: ${r.data.map(a => a.vendor_name).join(', ')}`);
const g2a = r.data.find(a => a.vendor_name === 'Ahmad Fresh Fruit').application_id;
const g2b = r.data.find(a => a.vendor_name === 'Raju Teh Tarik').application_id;
r = await call('PUT', `/applications/${g2a}/decision`, { token: ORG, body: { decision: 'accepted', note: 'Welcome' } });
tc('Application review', 'Organizer accepts Ahmad Fresh Fruit for G2', 'HTTP 200; the other applicant (Raju Teh Tarik) is rejected automatically', r.status === 200 && r.data.autoRejected === 1, `${say(r)}; autoRejected = ${r.data.autoRejected}`);
r = await call('PUT', `/applications/${g2b}/decision`, { token: ORG, body: { decision: 'accepted' } });
tc('Application review', 'Organizer tries to accept the auto-rejected applicant', 'HTTP 409: application is no longer pending', r.status === 409, say(r));
r = await call('PUT', `/applications/${g2a}/decision`, { token: ORG, body: { decision: 'maybe' } });
tc('Application review', 'Send a decision value other than accepted/rejected', 'HTTP 400', r.status === 400, say(r));
r = await call('GET', '/applications/mine', { token: V[4] });
const v4rej = r.data.find(a => a.status === 'rejected');
tc('Application review', 'Raju Teh Tarik (vendor4) checks his applications', 'Shows "rejected" with the reason "Lot was given to another vendor."', !!v4rej && /another vendor/.test(v4rej.organizer_note), v4rej ? `status=${v4rej.status}, note="${v4rej.organizer_note}"` : 'not found');
r = await call('POST', '/applications', { token: V[4], body: { lotId: L2.R3.lot_id } });
tc('Application review', 'vendor4 applies for another lot (R3) after being rejected', 'HTTP 201 (a rejected application does not block new ones)', r.status === 201, say(r));
const v4r3 = r.data.applicationId;
r = await call('PUT', `/applications/${v4r3}/decision`, { token: ORG, body: { decision: 'rejected', note: 'Sorry, zone full' } });
tc('Application review', 'Organizer rejects vendor4\'s R3 application with a note', 'HTTP 200', r.status === 200, say(r));

// ================= Relocation =================
r = await call('GET', '/relocations?status=pending', { token: ORG });
const rel = r.data[0];
tc('Relocation', 'Organizer lists pending relocation requests', 'One request: Mei Ling Crafts, R4 to R5', r.data.length === 1 && rel.from_lot_number === 'R4' && rel.to_lot_number === 'R5', `${r.data.length} request(s): ${rel.vendor_name}, ${rel.from_lot_number} -> ${rel.to_lot_number}`);
r = await call('POST', '/relocations', { token: V[3], body: { applicationId: rel.application_id, toLotId: L2.R6.lot_id } });
tc('Relocation', 'Mei Ling sends a second relocation request while one is pending', 'HTTP 409', r.status === 409, say(r));
const v1E2 = (await call('GET', '/applications/mine', { token: V[1] })).data.find(a => a.event_id === E2);
r = await call('POST', '/relocations', { token: V[1], body: { applicationId: v1E2.application_id, toLotId: L2.G2.lot_id } });
tc('Relocation', 'vendor1 asks to move to G2, which now has a vendor', 'HTTP 409: can only move to a free lot', r.status === 409, say(r));
r = await call('PUT', `/relocations/${rel.relocation_id}/decision`, { token: ORG, body: { decision: 'approved' } });
tc('Relocation', 'Organizer approves Mei Ling\'s move R4 to R5', 'HTTP 200', r.status === 200, say(r));
let m2 = Object.fromEntries((await call('GET', `/events/${E2}/map`)).data.lots.map(l => [l.lot_number, l]));
tc('Relocation', 'Check the map after approval', 'R4 is free; R5 belongs to Mei Ling Crafts', !m2.R4.vendor_id && m2.R5.vendor_name === 'Mei Ling Crafts', `R4 vendor=${m2.R4.vendor_name || 'none'}, R5 vendor=${m2.R5.vendor_name}`);
const v3app = rel.application_id;

// ================= Helpers =================
r = await call('GET', '/helper-requests?status=pending', { token: ORG });
const hreq = r.data[0];
tc('Helper management', 'Organizer lists pending helper requests', 'One request: Mei Ling Crafts, porter at 7:15 AM', r.data.length === 1 && hreq.service_type === 'porter', `${r.data.length} request(s): ${hreq.vendor_name}, ${hreq.service_type} ${hreq.requested_time}`);
r = await call('PUT', '/helpers/4', { token: ORG, body: { name: 'Kumar', contactNumber: '011-7777 8888', serviceType: 'trolley', status: 'off_duty' } });
tc('Helper management', 'Set helper Kumar to off duty', 'HTTP 200', r.status === 200, say(r));
r = await call('PUT', `/helper-requests/${hreq.request_id}/assign`, { token: ORG, body: { helperId: 4 } });
tc('Helper management', 'Assign off-duty Kumar to the request', 'HTTP 409 "Kumar is off duty."', r.status === 409, say(r));
r = await call('PUT', `/helper-requests/${hreq.request_id}/assign`, { token: ORG, body: { helperId: 1 } });
tc('Helper management', 'Assign available helper Razak', 'HTTP 200 "Razak assigned."', r.status === 200, say(r));
r = await call('DELETE', '/helpers/1', { token: ORG });
tc('Helper management', 'Delete Razak while he has an assigned job', 'HTTP 409', r.status === 409, say(r));
r = await call('PUT', `/helper-requests/${hreq.request_id}/complete`, { token: ORG });
tc('Helper management', 'Mark Razak\'s job as done', 'HTTP 200', r.status === 200, say(r));
r = await call('POST', '/helper-requests', { token: V[3], body: { applicationId: v3app, serviceType: 'trolley', requestedTime: '07:30', notes: '3 boxes' } });
tc('Helper management', 'Vendor with an accepted lot requests a trolley helper at 7:30 AM', 'HTTP 201', r.status === 201, say(r));
r = await call('POST', '/helper-requests', { token: V[6], body: { applicationId: v6app, serviceType: 'porter', requestedTime: '07:30' } });
tc('Helper management', 'Vendor with only a pending application requests a helper', 'HTTP 400', r.status === 400, say(r));
r = await call('POST', '/helper-requests', { token: V[3], body: { applicationId: v3app, serviceType: 'robot', requestedTime: '07:30' } });
tc('Helper management', 'Request helper type "robot" (not porter/trolley)', 'HTTP 400', r.status === 400, say(r));
r = await call('POST', '/helpers', { token: ORG, body: { name: 'Test Helper', serviceType: 'porter' } });
const th = r.data.helperId;
tc('Helper management', 'Organizer adds a new helper', 'HTTP 201', r.status === 201, say(r));
r = await call('DELETE', `/helpers/${th}`, { token: ORG });
tc('Helper management', 'Delete a helper with no jobs', 'HTTP 200', r.status === 200, say(r));

// ================= Payment =================
r = await call('POST', '/payments', { token: V[3], form: fdPay(v3app, '60', { blob: png(), name: 'receipt.png' }) });
tc('Payment', 'Vendor pays RM60 with a PNG receipt for an accepted lot', 'HTTP 201, payment pending verification', r.status === 201, say(r));
const pay1 = r.data.paymentId;
r = await call('POST', '/payments', { token: V[3], form: fdPay(v3app, '60', { blob: png(), name: 'receipt.png' }) });
tc('Payment', 'Pay again while the first payment is still pending', 'HTTP 409', r.status === 409, say(r));
r = await call('POST', '/payments', { token: V[3], form: fdPay(v3app, '60') });
tc('Payment', 'Pay without attaching a receipt (Make Payment includes Upload Receipt)', 'HTTP 400', r.status === 400, say(r));
r = await call('POST', '/payments', { token: V[3], form: fdPay(v3app, '60', { blob: new Blob(['hello'], { type: 'text/plain' }), name: 'receipt.txt' }) });
tc('Payment', 'Attach a .txt file as the receipt', 'HTTP 400: only JPG, PNG or PDF', r.status === 400, say(r));
r = await call('POST', '/payments', { token: V[6], form: fdPay(v6app, '60', { blob: png(), name: 'receipt.png' }) });
tc('Payment', 'Pay for an application that is still pending', 'HTTP 400', r.status === 400, say(r));
r = await call('PUT', `/payments/${pay1}/review`, { token: ORG, body: { status: 'rejected', note: 'Receipt is blurry' } });
tc('Payment', 'Organizer rejects the payment with note "Receipt is blurry"', 'HTTP 200', r.status === 200, say(r));
r = await call('POST', '/payments', { token: V[3], form: fdPay(v3app, '60', { blob: png(), name: 'receipt2.png' }) });
const pay2 = r.data.paymentId;
tc('Payment', 'Vendor uploads a new receipt after the rejection', 'HTTP 201', r.status === 201, say(r));
r = await call('PUT', `/payments/${pay2}/review`, { token: ORG, body: { status: 'verified' } });
tc('Payment', 'Organizer verifies the new payment', 'HTTP 200 "Payment verified."', r.status === 200, say(r));
r = await call('GET', '/payments/mine', { token: V[3] });
const rec = await fetch(B.replace('/api', '') + r.data[0].receipt_file_url);
tc('Payment', 'Open the uploaded receipt link', 'File is served (HTTP 200)', rec.status === 200, `HTTP ${rec.status} ${r.data[0].receipt_file_url}`);
const leftover = fs.readdirSync(path.join(HERE, '..', 'uploads', 'receipts')).filter(f => f.startsWith('receipts-') && !f.includes('demo'));
tc('Payment', 'Check the upload folder after the failed uploads (.txt and pending application)', 'Only the 2 accepted receipts are stored; rejected uploads are deleted', leftover.length === 2, `${leftover.length} new file(s) on disk`);

// ================= Attendance =================
r = await call('PUT', `/applications/${v3app}/attendance`, { token: V[3], body: { attendance: 'attending' } });
tc('Attendance', 'Confirm "attending" without an arrival time', 'HTTP 400 "Please give your arrival time."', r.status === 400, say(r));
r = await call('PUT', `/applications/${v3app}/attendance`, { token: V[3], body: { attendance: 'attending', arrivalTime: '07:00' } });
tc('Attendance', 'Confirm "attending" with arrival time 7:00 AM', 'HTTP 200 "Attendance confirmed."', r.status === 200, say(r));
r = await call('PUT', `/applications/${v6app}/attendance`, { token: V[6], body: { attendance: 'attending', arrivalTime: '07:00' } });
tc('Attendance', 'Confirm attendance for a pending (not accepted) application', 'HTTP 400', r.status === 400, say(r));

// ================= Cancel / revoke =================
r = await call('PUT', `/applications/${v6app}/cancel`, { token: V[6] });
tc('Stall application', 'vendor6 cancels her pending G3 application', 'HTTP 200', r.status === 200, say(r));
r = await call('PUT', `/applications/${v6app}/cancel`, { token: V[6] });
tc('Stall application', 'Cancel the same application again', 'HTTP 400: only pending applications can be cancelled', r.status === 400, say(r));
r = await call('PUT', `/applications/${g2a}/revoke`, { token: ORG, body: { note: 'Test removal' } });
m2 = Object.fromEntries((await call('GET', `/events/${E2}/map`)).data.lots.map(l => [l.lot_number, l]));
tc('Application review', 'Organizer removes Ahmad Fresh Fruit from G2', 'HTTP 200 and G2 becomes free on the map', r.status === 200 && !m2.G2.vendor_id, `${say(r)}; G2 vendor=${m2.G2.vendor_name || 'none'}`);

// ================= Map editor =================
let m3 = (await call('GET', `/events/${E3}/map`)).data;
const lay = { lots: m3.lots.map(l => ({ ...l })), facilities: m3.facilities.map(f => ({ ...f })) };
const before = Object.fromEntries(m3.lots.map(l => [l.lot_number, l]));
r = await call('PUT', `/events/${E3}/layout`, { token: ORG, body: { ...lay, lots: lay.lots.filter(l => l.lot_number !== 'R1') } });
tc('Map editor', 'Save a layout that deletes lot R1, which has a pending applicant', 'HTTP 409, nothing saved', r.status === 409, say(r));
r = await call('PUT', `/events/${E3}/layout`, { token: ORG, body: { ...lay, lots: lay.lots.map(l => l.lot_number === 'R2' ? { ...l, lot_number: 'R3' } : l) } });
tc('Map editor', 'Save a layout where two lots are both numbered R3', 'HTTP 400', r.status === 400, say(r));
r = await call('PUT', `/events/${E3}/layout`, { token: ORG, body: { ...lay, lots: lay.lots.map(l => l.lot_number === 'R2' ? { ...l, pos_x: 95, width: 9 } : l) } });
tc('Map editor', 'Save a lot placed at X 95% with width 9% (past the right edge)', 'HTTP 400 "outside the map"', r.status === 400, say(r));
const good = {
  lots: [...lay.lots.filter(l => l.lot_number !== 'G5').map(l => l.lot_number === 'R2' ? { ...l, lot_number: 'R3' } : l.lot_number === 'R3' ? { ...l, lot_number: 'R2' } : l.lot_number === 'G1' ? { ...l, pos_x: 40, pos_y: 40 } : l),
    { lot_number: 'NEW1', size_label: '5ft x 5ft', zone: 'Test', price: 25, pos_x: 45, pos_y: 60, width: 6, height: 6 }],
  facilities: [...lay.facilities, { type: 'stage', label: 'Stage', pos_x: 40, pos_y: 3, width: 5, height: 8 }],
};
r = await call('PUT', `/events/${E3}/layout`, { token: ORG, body: good });
m3 = (await call('GET', `/events/${E3}/map`)).data;
const L3 = Object.fromEntries(m3.lots.map(l => [l.lot_number, l]));
tc('Map editor', 'Save one layout that swaps R2/R3 numbers, moves G1, deletes free lot G5, adds lot NEW1 and a stage', 'HTTP 200; all five changes stored; R1 keeps its ID and applicant',
  r.status === 200 && !L3.G5 && L3.NEW1 && L3.G1.pos_x === 40 && m3.facilities.length === 10 && L3.R2.lot_id === before.R3.lot_id && L3.R1.lot_id === before.R1.lot_id,
  `${say(r)}; lots=${m3.lots.length}, facilities=${m3.facilities.length}, G1 x=${L3.G1.pos_x}, G5 ${L3.G5 ? 'present' : 'removed'}, NEW1 ${L3.NEW1 ? 'added' : 'missing'}`);
r = await call('PUT', `/events/${E3}/layout`, { token: V[1], body: good });
tc('Map editor', 'Vendor tries to save a map layout', 'HTTP 403', r.status === 403, say(r));
let f = new FormData(); f.append('map', png(), 'venue.png');
r = await call('POST', `/events/${E3}/map-image`, { token: ORG, form: f });
const mapUrl = r.data.mapImageUrl;
const mapGet = await fetch(B.replace('/api', '') + mapUrl);
tc('Map editor', 'Upload a PNG venue picture', 'HTTP 200 and the picture is served', r.status === 200 && mapGet.status === 200, `${say(r)}; GET picture = HTTP ${mapGet.status}`);
f = new FormData(); f.append('map', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'venue.pdf');
r = await call('POST', `/events/${E3}/map-image`, { token: ORG, form: f });
tc('Map editor', 'Upload a PDF as the venue picture', 'HTTP 400: images only', r.status === 400, say(r));
r = await call('DELETE', `/events/${E3}/map-image`, { token: ORG });
tc('Map editor', 'Remove the venue picture', 'HTTP 200', r.status === 200, say(r));

// ================= Event management =================
r = await call('POST', '/events', { token: ORG, body: { name: 'Old', eventDate: '2020-01-01', location: 'X', startTime: '08:00', endTime: '10:00' } });
tc('Event management', 'Create an event dated 1 Jan 2020 (in the past)', 'HTTP 400', r.status === 400, say(r));
r = await call('POST', '/events', { token: ORG, body: { name: 'Backwards', eventDate: '2099-01-01', location: 'X', startTime: '10:00', endTime: '08:00' } });
tc('Event management', 'Create an event ending (8:00) before it starts (10:00)', 'HTTP 400', r.status === 400, say(r));
r = await call('POST', '/events', { token: ORG, body: { name: 'Test Event', eventDate: '2099-01-01', location: 'Test Hall', startTime: '08:00', endTime: '10:00' } });
const NE = r.data.eventId;
tc('Event management', 'Create a valid event', 'HTTP 201', r.status === 201, say(r));
r = await call('PUT', `/events/${NE}`, { token: ORG, body: { name: 'Test Event 2', eventDate: '2099-01-02', location: 'Hall B', startTime: '09:00', endTime: '11:00' } });
tc('Event management', 'Edit the event name, date, place and times', 'HTTP 200', r.status === 200, say(r));
r = await call('PUT', `/events/${NE}/status`, { token: ORG, body: { status: 'cancelled' } });
const pub = await call('GET', '/events');
const all = await call('GET', '/events/all', { token: ORG });
tc('Event management', 'Cancel the event, then check the public list and organizer list', 'Hidden from the public list; organizer sees it as cancelled',
  r.status === 200 && !pub.data.some(e => e.event_id === NE) && all.data.find(e => e.event_id === NE).phase === 'cancelled', `${say(r)}; public list has it: ${pub.data.some(e => e.event_id === NE)}; organizer phase: ${all.data.find(e => e.event_id === NE).phase}`);
r = await call('DELETE', `/events/${E2}`, { token: ORG });
tc('Event management', 'Delete the Weekend Family Bazaar, which has vendor applications', 'HTTP 409: cancel instead', r.status === 409, say(r));
r = await call('DELETE', `/events/${NE}`, { token: ORG });
tc('Event management', 'Delete the empty test event', 'HTTP 200', r.status === 200, say(r));

// ================= Vendor management =================
r = await call('GET', '/vendors?search=fruit', { token: ORG });
tc('Vendor management', 'Search vendors for "fruit"', 'Exactly one result: Ahmad Fresh Fruit', r.data.length === 1 && r.data[0].name === 'Ahmad Fresh Fruit', `${r.data.length} result(s): ${r.data.map(v => v.name).join(', ')}`);
const nvId = (await call('GET', '/vendors?search=testvendor', { token: ORG })).data[0].vendor_id;
r = await call('PUT', `/vendors/${nvId}`, { token: ORG, body: { name: 'Renamed Vendor', contactNumber: '012-000 0000' } });
const nvGet = await call('GET', `/vendors/${nvId}`, { token: ORG });
tc('Vendor management', 'Organizer edits the test vendor\'s name, then views the record', 'HTTP 200; name shows "Renamed Vendor" with application history', r.status === 200 && nvGet.data.name === 'Renamed Vendor' && Array.isArray(nvGet.data.applications), `${say(r)}; name now "${nvGet.data.name}"`);
r = await call('DELETE', `/vendors/${nvId}`, { token: ORG });
const me = await call('GET', '/auth/me', { token: NV });
tc('Vendor management', 'Delete the test vendor, then use their old login token', 'Delete HTTP 200; old token rejected with HTTP 401', r.status === 200 && me.status === 401, `${say(r)}; old token: HTTP ${me.status}`);

// ================= Profile =================
r = await call('PUT', '/profile', { token: ORG, body: { name: 'Puan Aminah', phone: '012-300 4455', email: 'organizer@pasarkita.test' } });
const op = await call('GET', '/profile', { token: ORG });
tc('Profile', 'Organizer edits own name and phone', 'HTTP 200 and the new name is saved', r.status === 200 && op.data.name === 'Puan Aminah', `${say(r)}; name now "${op.data.name}"`);
r = await call('PUT', '/profile', { token: V[6], body: { name: 'Farah Batik', contactNumber: '018-444 9090', goodsType: 'Batik and songket' } });
tc('Profile', 'Vendor edits what they sell', 'HTTP 200', r.status === 200, say(r));
r = await call('PUT', '/profile', { token: V[6], body: { name: '', contactNumber: '018' } });
tc('Profile', 'Vendor saves profile with an empty name', 'HTTP 400', r.status === 400, say(r));
r = await call('PUT', '/auth/password', { token: V[6], body: { currentPassword: 'wrong', newPassword: 'NewPass123!' } });
tc('Profile', 'Change password with the wrong current password', 'HTTP 400', r.status === 400, say(r));
r = await call('PUT', '/auth/password', { token: V[6], body: { currentPassword: 'Password123!', newPassword: 'NewPass123!' } });
const relog = await login('vendor6', 'NewPass123!');
tc('Profile', 'Change password correctly, then log in with the new password', 'HTTP 200; new password works', r.status === 200 && !!relog, `${say(r)}; login with new password: ${relog ? 'success' : 'failed'}`);

// ================= Reports =================
r = await call('GET', `/reports/${E1}/generate`, { token: ORG });
tc('Reports', 'Generate the report for today\'s PasarKita Night Market', 'Lots 4/14 taken; 2 verified payments totalling RM140; 4 vendors listed',
  r.status === 200 && r.data.lots.taken === 4 && r.data.lots.total === 14 && r.data.payments.verified === 2 && r.data.payments.verified_amount === 140 && r.data.vendors.length === 4,
  `lots ${r.data.lots.taken}/${r.data.lots.total}; verified ${r.data.payments.verified} = RM${r.data.payments.verified_amount}; vendors listed ${r.data.vendors.length}`);
r = await call('GET', `/reports/${E1}/print`, { token: ORG });
tc('Reports', 'Print the same report', 'Returns the generated report plus a printed-at time', r.status === 200 && !!r.data.printedAt && r.data.lots.taken === 4, `HTTP ${r.status}; printedAt present: ${!!r.data.printedAt}`);
r = await call('GET', `/reports/${E1}/generate`, { token: V[1] });
tc('Reports', 'Vendor tries to generate a report', 'HTTP 403', r.status === 403, say(r));

// ================= Added: true boundary values and payment-status view =================
r = await call('POST', '/auth/register', { body: { username: 'boundary7', password: 'Pass12!', name: 'Boundary Seven', contactNumber: '011-000 0007' } });
tc('Authentication', 'Register with a 7-character password (boundary: one below the 8-character minimum)', 'HTTP 400, account not created', r.status === 400, say(r));
r = await call('POST', '/auth/register', { body: { username: 'boundary8', password: 'Pass123!', name: 'Boundary Eight', contactNumber: '011-000 0008' } });
tc('Authentication', 'Register with an exactly 8-character password (boundary: the minimum)', 'HTTP 201, account created', r.status === 201, say(r));
{
  const m = (await call('GET', `/events/${E3}/map`)).data;
  const lots = m.lots.map((l) => ({ ...l }));
  const edge = lots.find((l) => !l.vendor_id && !l.pending_count);
  edge.width = 9; edge.pos_x = 91; // right edge at exactly 100%
  const r2 = await call('PUT', `/events/${E3}/layout`, { token: ORG, body: { lots, facilities: m.facilities } });
  const saved = (await call('GET', `/events/${E3}/map`)).data.lots.find((l) => l.lot_id === edge.lot_id);
  tc('Map editor', `Save lot ${edge.lot_number} at X 91% with width 9% (right edge exactly at the 100% boundary)`, 'HTTP 200; lot saved at X 91%', r2.status === 200 && saved.pos_x === 91, `${say(r2)}; saved X = ${saved.pos_x}%`);
}
r = await call('GET', '/payments/mine', { token: V[3] });
const mine = r.data.map((p) => p.status);
tc('Payment', 'Mei Ling (vendor3) views her payment status after the organizer rejected one receipt and verified the next', 'Shows one "verified" and one "rejected" payment', r.status === 200 && mine.includes('verified') && mine.includes('rejected'), `HTTP ${r.status} - statuses: ${mine.join(', ')}`);

fs.writeFileSync(OUT, JSON.stringify(cases, null, 2));
const failed = cases.filter(c => !c.pass);
for (const c of cases) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  [${c.module}] ${c.condition}`);
console.log(`
${cases.length} cases, ${cases.length - failed.length} passed, ${failed.length} failed`);
failed.forEach(c => console.log('FAIL', c.id, c.condition, '|', c.actual));
