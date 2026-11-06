import fs from 'fs';
const B = 'http://localhost:3000/api';
const login = async (u) => (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'Password123!' }) })).json()).token;
const ORG = await login('organizer1'); const V1 = await login('vendor1');
const ev = await (await fetch(B + '/events')).json(); const E1 = ev[0].event_id;
async function time(label, n, fn) {
  const t = [];
  for (let i = 0; i < n; i++) { const s = performance.now(); const r = await fn(); if (!r.ok) throw new Error(label + ' ' + r.status); await r.arrayBuffer(); t.push(performance.now() - s); }
  t.sort((a, b) => a - b);
  const mean = t.reduce((a, b) => a + b, 0) / n;
  return { label, n, mean: +mean.toFixed(1), p95: +t[Math.ceil(n * 0.95) - 1].toFixed(1), max: +t[n - 1].toFixed(1) };
}
const H = (tok) => ({ headers: { Authorization: `Bearer ${tok}` } });
const rows = [
  await time('Public event list (GET /api/events)', 50, () => fetch(B + '/events')),
  await time('Stall map, 14 lots + 9 facilities (GET /api/events/:id/map)', 50, () => fetch(`${B}/events/${E1}/map`)),
  await time("Vendor's applications (GET /api/applications/mine)", 50, () => fetch(B + '/applications/mine', H(V1))),
  await time('Organizer badge counts (GET /api/stats/counts)', 50, () => fetch(B + '/stats/counts', H(ORG))),
  await time('Generate event report (GET /api/reports/:id/generate)', 50, () => fetch(`${B}/reports/${E1}/generate`, H(ORG))),
  await time('Log in, includes password hash check (POST /api/auth/login)', 20, () => fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'vendor1', password: 'Password123!' }) })),
];
fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 2));
console.table(rows);
