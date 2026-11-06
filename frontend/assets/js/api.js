// Shared helpers used by every page: API calls, login session, formatting, toasts, dialogs.
const API_BASE = '/api';

// ---------- Login session (stored in the browser) ----------
const Auth = {
  _get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  _set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  _del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  token() { return this._get('pk_token'); },
  role() { return this._get('pk_role'); },
  name() { return this._get('pk_name'); },
  save(token, role, name) { this._set('pk_token', token); this._set('pk_role', role); this._set('pk_name', name || ''); },
  clear() { ['pk_token', 'pk_role', 'pk_name'].forEach((k) => this._del(k)); },
  home(role) { return role === 'organizer' ? '/organizer/dashboard.html' : '/vendor/dashboard.html'; },
};

// ---------- API calls ----------
// api('/events')                         -> GET
// api('/events', { method: 'POST', body: {...} })
// api('/payments', { method: 'POST', form: formData })   -> file upload
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const token = Auth.token();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: payload });
  } catch (e) {
    throw new Error('Cannot reach the server. Is "npm start" still running?');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }

  if (res.status === 401 && token && /^\/(organizer|vendor)\//.test(location.pathname)) {
    Auth.clear();
    location.href = '/login.html?expired=1';
    throw new Error('Session expired.');
  }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status}).`);
  return data;
}

// ---------- Formatting ----------
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '-';
  // Plain dates ('2026-10-27') are read as local dates; full timestamps use the browser's time zone.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
  const date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-MY', opts);
}

function fmtDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function fmtTime(t) {
  if (!t) return '-';
  const [h, m] = String(t).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

function money(n) {
  return `RM ${Number(n || 0).toFixed(2)}`;
}

const STATUS_LABELS = {
  pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', cancelled: 'Cancelled',
  approved: 'Approved', verified: 'Verified', assigned: 'Assigned', completed: 'Done',
  attending: 'Attending', not_attending: 'Not attending', unconfirmed: 'Not confirmed',
  available: 'Available', off_duty: 'Off duty', taken: 'Taken',
  ongoing: 'Today', upcoming: 'Upcoming', past: 'Past', scheduled: 'Scheduled',
};

function badge(status, text) {
  return `<span class="badge b-${esc(status)}">${esc(text || STATUS_LABELS[status] || status)}</span>`;
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

// ---------- Toast messages ----------
function toast(message, type = 'success') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add('hide'), 3800);
  setTimeout(() => el.remove(), 4300);
}

// ---------- Dialogs ----------
const Modal = {
  open(html, { wide = false } = {}) {
    this.close();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) this.close(); });
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');
    const first = wrap.querySelector('input, textarea, select, button');
    if (first) setTimeout(() => first.focus(), 30);
    return wrap.querySelector('.modal');
  },
  close() {
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
    document.body.classList.remove('modal-open');
  },
  // Resolves true / false.
  confirm(message, { title = 'Are you sure?', okText = 'Yes', danger = false } = {}) {
    return new Promise((resolve) => {
      const m = this.open(`
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="no">Back</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(okText)}</button>
        </div>`);
      m.querySelector('[data-act=no]').onclick = () => { this.close(); resolve(false); };
      m.querySelector('[data-act=yes]').onclick = () => { this.close(); resolve(true); };
    });
  },
  // Resolves to the typed text ('' allowed) or null if cancelled.
  prompt(message, { title = 'Add a note', okText = 'Confirm', placeholder = 'Optional', danger = false } = {}) {
    return new Promise((resolve) => {
      const m = this.open(`
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <textarea class="input" rows="3" maxlength="255" placeholder="${esc(placeholder)}"></textarea>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="no">Back</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(okText)}</button>
        </div>`);
      m.querySelector('[data-act=no]').onclick = () => { this.close(); resolve(null); };
      m.querySelector('[data-act=yes]').onclick = () => { const v = m.querySelector('textarea').value; this.close(); resolve(v); };
    });
  },
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Modal.close(); });

// Disables a button while an async action runs, so it can't be clicked twice.
async function busy(button, fn) {
  if (button) { button.disabled = true; button.classList.add('is-busy'); }
  try { return await fn(); } finally { if (button) { button.disabled = false; button.classList.remove('is-busy'); } }
}

// Reads a form into a plain object using each field's name attribute.
function formData(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { if (!(v instanceof File)) out[k] = v; });
  return out;
}
