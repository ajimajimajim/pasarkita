// PixelMap: draws an event's stall map (background + lots + facilities).
// View mode: lots are clickable.  Edit mode: drag to move, drag the corner to resize.
// All positions are percentages of the map, so it looks the same on any screen.

const LOT_STATE_LABELS = {
  available: 'Available', pending: 'Has applicants', taken: 'Taken', mine: 'Your lot',
  minepending: 'You applied', closed: 'Not open', edit: 'Free',
};

function defaultLotState(lot) {
  if (lot.vendor_id) return 'taken';
  if (lot.pending_count > 0) return 'pending';
  return 'available';
}

class PixelMap {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = {
      editable: false,
      lotState: defaultLotState, // (lot) => state name
      onLotClick: null,          // (lot) => {}
      onSelect: null,            // edit mode: (item | null) => {}
      onChange: null,            // edit mode: () => {}
      showPendingBadge: false,
      snap: 0.5,
      ...opts,
    };
    this.items = [];
    this.selectedKey = null;
    this.highlightKey = null;
    this.dirty = false;
    this._keyCounter = 0;
    if (this.opts.editable) this._bindKeys();
  }

  // ---------- data ----------
  setData({ event, lots = [], facilities = [] }) {
    this.event = event;
    this.items = [
      ...facilities.map((f) => ({
        kind: 'facility', key: `f${f.facility_id || ++this._keyCounter}`, type: f.type, label: f.label || '',
        x: +f.pos_x, y: +f.pos_y, w: +f.width, h: +f.height,
      })),
      ...lots.map((l) => ({
        ...l, kind: 'lot', key: `l${l.lot_id}`, x: +l.pos_x, y: +l.pos_y, w: +l.width, h: +l.height,
      })),
    ];
    this.selectedKey = null;
    this.dirty = false;
    this.render();
  }

  lots() { return this.items.filter((i) => i.kind === 'lot'); }

  getLayout() {
    const box = (i) => ({ pos_x: i.x, pos_y: i.y, width: i.w, height: i.h });
    return {
      lots: this.lots().map((l) => ({
        lot_id: l.lot_id || null, lot_number: l.lot_number, size_label: l.size_label || '', zone: l.zone || '',
        price: Number(l.price || 0), ...box(l),
      })),
      facilities: this.items.filter((i) => i.kind === 'facility').map((f) => ({ type: f.type, label: f.label, ...box(f) })),
    };
  }

  // ---------- drawing ----------
  render() {
    const ev = this.event || {};
    const bg = ev.map_image_url
      ? `<img class="pmap-img" src="${esc(ev.map_image_url)}" alt="Map of ${esc(ev.name || 'event')}" draggable="false">`
      : '<div class="pmap-grass"></div>';
    this.el.innerHTML = `
      <div class="pmap ${this.opts.editable ? 'is-edit' : ''}">
        <div class="pmap-stage">${bg}<div class="pmap-layer"></div></div>
      </div>`;
    this.stage = this.el.querySelector('.pmap-stage');
    this.layer = this.el.querySelector('.pmap-layer');

    const img = this.el.querySelector('.pmap-img');
    if (img) {
      const fit = () => {
        if (!img.naturalWidth) return;
        this.stage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        // Small images (pixel art) are scaled up without blurring.
        img.classList.toggle('pixelated', img.naturalWidth < 800);
      };
      if (img.complete) fit(); else img.addEventListener('load', fit);
      img.addEventListener('error', () => { img.replaceWith(Object.assign(document.createElement('div'), { className: 'pmap-grass' })); });
    }

    this.items.forEach((item) => this.layer.appendChild(this._makeElement(item)));
    if (!this.lots().length && !this.opts.editable) {
      this.layer.insertAdjacentHTML('beforeend', '<div class="pmap-empty">No lots on this map yet</div>');
    }
    if (this.opts.editable) {
      this.layer.addEventListener('pointerdown', (e) => { if (e.target === this.layer) this.select(null); });
    }
  }

  _makeElement(item) {
    const el = document.createElement(item.kind === 'lot' && !this.opts.editable ? 'button' : 'div');
    el.dataset.key = item.key;
    this._paint(el, item);
    if (this.opts.editable) {
      el.addEventListener('pointerdown', (e) => this._startDrag(e, item, e.target.classList.contains('pm-handle') ? 'resize' : 'move'));
    } else if (item.kind === 'lot') {
      el.type = 'button';
      el.addEventListener('click', () => this.opts.onLotClick && this.opts.onLotClick(item));
    }
    return el;
  }

  _paint(el, item) {
    Object.assign(el.style, { left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` });
    const selected = item.key === this.selectedKey || item.key === this.highlightKey;
    const handle = this.opts.editable ? '<span class="pm-handle" title="Drag to resize"></span>' : '';
    if (item.kind === 'lot') {
      const state = this.opts.editable
        ? (item.vendor_id ? 'taken' : item.pending_count > 0 ? 'pending' : 'edit')
        : this.opts.lotState(item);
      el.className = `pm-lot st-${state} ${selected ? 'is-selected' : ''}`;
      const pending = this.opts.showPendingBadge && !item.vendor_id && item.pending_count > 0
        ? `<span class="pm-badge" title="${item.pending_count} applicant(s)">${item.pending_count}</span>` : '';
      const star = state === 'mine' ? '<span class="pm-star">★</span>' : '';
      el.innerHTML = `<span class="pm-num">${esc(item.lot_number)}</span>${pending}${star}${handle}`;
      el.title = [item.lot_number, item.size_label, item.zone, LOT_STATE_LABELS[state]].filter(Boolean).join(' · ');
      el.setAttribute('aria-label', el.title);
    } else {
      el.className = `pm-fac fac-${item.type} ${selected ? 'is-selected' : ''}`;
      el.innerHTML = `${Sprites.svg(item.type, 'pm-icon')}<span class="pm-label">${esc(item.label)}</span>${handle}`;
      el.title = item.label || item.type;
    }
  }

  _repaint(item) {
    const el = this.layer && this.layer.querySelector(`[data-key="${item.key}"]`);
    if (el) this._paint(el, item);
  }

  highlightLot(lotId) {
    const prev = this.items.find((i) => i.key === this.highlightKey);
    this.highlightKey = lotId ? `l${lotId}` : null;
    if (prev) this._repaint(prev);
    const now = this.items.find((i) => i.key === this.highlightKey);
    if (now) this._repaint(now);
  }

  // ---------- editing ----------
  select(key) {
    const prev = this.items.find((i) => i.key === this.selectedKey);
    this.selectedKey = key;
    if (prev) this._repaint(prev);
    const item = this.items.find((i) => i.key === key) || null;
    if (item) this._repaint(item);
    if (this.opts.onSelect) this.opts.onSelect(item);
  }

  selected() { return this.items.find((i) => i.key === this.selectedKey) || null; }

  _changed() {
    this.dirty = true;
    if (this.opts.onChange) this.opts.onChange();
  }

  _snap(v) { const s = this.opts.snap; return Math.round(v / s) * s; }

  _startDrag(e, item, mode) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    this.select(item.key);
    const rect = this.layer.getBoundingClientRect();
    const start = { px: e.clientX, py: e.clientY, x: item.x, y: item.y, w: item.w, h: item.h };
    let moved = false;
    el.classList.add('is-dragging');

    const onMove = (ev) => {
      const dx = ((ev.clientX - start.px) / rect.width) * 100;
      const dy = ((ev.clientY - start.py) / rect.height) * 100;
      if (!moved && Math.abs(ev.clientX - start.px) + Math.abs(ev.clientY - start.py) < 3) return;
      moved = true;
      if (mode === 'move') {
        item.x = this._clamp(this._snap(start.x + dx), 0, 100 - item.w);
        item.y = this._clamp(this._snap(start.y + dy), 0, 100 - item.h);
      } else {
        item.w = this._clamp(this._snap(start.w + dx), 2, 100 - item.x);
        item.h = this._clamp(this._snap(start.h + dy), 2, 100 - item.y);
      }
      this._paint(el, item);
      if (this.opts.onSelect) this.opts.onSelect(item);
    };
    const onUp = () => {
      el.classList.remove('is-dragging');
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      if (moved) this._changed();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  _clamp(v, min, max) { return Math.round(Math.min(Math.max(v, min), max) * 100) / 100; }

  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      const item = this.selected();
      if (!item || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      const step = e.shiftKey ? 2 : this.opts.snap;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        item.x = this._clamp(item.x + moves[e.key][0], 0, 100 - item.w);
        item.y = this._clamp(item.y + moves[e.key][1], 0, 100 - item.h);
        this._repaint(item);
        if (this.opts.onSelect) this.opts.onSelect(item);
        this._changed();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        this.deleteSelected();
      }
    });
  }

  _freePosition(w, h) {
    // Start in the middle and step diagonally until the spot isn't exactly on top of another item.
    let x = this._snap(50 - w / 2);
    let y = this._snap(50 - h / 2);
    for (let i = 0; i < 20 && this.items.some((it) => Math.abs(it.x - x) < 1 && Math.abs(it.y - y) < 1); i += 1) {
      x = this._clamp(x + 2, 0, 100 - w);
      y = this._clamp(y + 2, 0, 100 - h);
    }
    return { x, y };
  }

  nextLotNumber() {
    const taken = new Set(this.lots().map((l) => String(l.lot_number).toUpperCase()));
    let n = this.lots().length + 1;
    while (taken.has(`L${n}`)) n += 1;
    return `L${n}`;
  }

  addLot() {
    const w = 9; const h = 11;
    const item = { kind: 'lot', key: `new${++this._keyCounter}`, lot_id: null, lot_number: this.nextLotNumber(),
      size_label: '10ft x 10ft', zone: '', price: 0, vendor_id: null, pending_count: 0, w, h, ...this._freePosition(w, h) };
    this.items.push(item);
    this.layer.appendChild(this._makeElement(item));
    this.select(item.key);
    this._changed();
    return item;
  }

  addFacility(type, label) {
    const w = 8; const h = 11;
    const item = { kind: 'facility', key: `new${++this._keyCounter}`, type, label, w, h, ...this._freePosition(w, h) };
    // Facilities sit under lots, so insert before the first lot element.
    const firstLot = this.layer.querySelector('.pm-lot');
    this.items.unshift(item);
    this.layer.insertBefore(this._makeElement(item), firstLot);
    this.select(item.key);
    this._changed();
    return item;
  }

  updateSelected(patch) {
    const item = this.selected();
    if (!item) return;
    Object.assign(item, patch);
    item.w = this._clamp(item.w, 2, 100);
    item.h = this._clamp(item.h, 2, 100);
    item.x = this._clamp(item.x, 0, 100 - item.w);
    item.y = this._clamp(item.y, 0, 100 - item.h);
    this._repaint(item);
    this._changed();
  }

  deleteSelected() {
    const item = this.selected();
    if (!item) return null;
    if (item.kind === 'lot' && (item.vendor_id || item.pending_count > 0)) {
      toast(`Lot ${item.lot_number} has a vendor or applicants, so it can't be deleted. Handle them in Requests first.`, 'error');
      return null;
    }
    this.items = this.items.filter((i) => i !== item);
    this.layer.querySelector(`[data-key="${item.key}"]`)?.remove();
    this.select(null);
    this._changed();
    return item;
  }

  // Replace everything with a copy of another event's layout (new lots, no ids).
  copyFrom({ lots = [], facilities = [] }) {
    const kept = this.lots().filter((l) => l.vendor_id || l.pending_count > 0);
    this.items = [
      ...facilities.map((f) => ({ kind: 'facility', key: `new${++this._keyCounter}`, type: f.type, label: f.label,
        x: +f.pos_x, y: +f.pos_y, w: +f.width, h: +f.height })),
      ...kept,
      ...lots.filter((l) => !kept.some((k) => String(k.lot_number).toUpperCase() === String(l.lot_number).toUpperCase()))
        .map((l) => ({ kind: 'lot', key: `new${++this._keyCounter}`, lot_id: null, lot_number: l.lot_number,
          size_label: l.size_label, zone: l.zone, price: l.price, vendor_id: null, pending_count: 0,
          x: +l.pos_x, y: +l.pos_y, w: +l.width, h: +l.height })),
    ];
    this.selectedKey = null;
    this.render();
    this._changed();
    return kept.length;
  }

  setBackground(url) {
    this.event = { ...this.event, map_image_url: url };
    const sel = this.selectedKey;
    this.render();
    if (sel) this.select(sel);
  }
}

// ---------- Legend + zone list (like the side panel on a campsite map) ----------
function renderLegend(el, states) {
  el.innerHTML = states.map((s) => `<span class="legend-item"><i class="legend-swatch st-${s}"></i>${LOT_STATE_LABELS[s]}</span>`).join('');
}

function renderZoneList(el, lots, { stateOf = defaultLotState, onClick, showVendor = false } = {}) {
  if (!lots.length) { el.innerHTML = '<p class="muted small">No lots yet.</p>'; return; }
  const zones = {};
  lots.forEach((l) => { const z = l.zone || 'Other lots'; (zones[z] = zones[z] || []).push(l); });
  const natural = (a, b) => String(a.lot_number).localeCompare(String(b.lot_number), undefined, { numeric: true });
  el.innerHTML = Object.keys(zones).sort().map((zone) => `
    <div class="zone">
      <div class="zone-title">${esc(zone)}</div>
      ${zones[zone].sort(natural).map((l) => {
        const st = stateOf(l);
        return `<button class="zone-row" data-lot="${l.lot_id}">
          <span class="zone-chip st-${st}">${esc(l.lot_number)}</span>
          <span class="zone-size">${esc(l.size_label || '-')}${showVendor && l.vendor_name ? ` · <b>${esc(l.vendor_name)}</b>` : ''}</span>
          <span class="zone-price">${money(l.price)}</span>
        </button>`;
      }).join('')}
    </div>`).join('');
  el.querySelectorAll('.zone-row').forEach((b) => {
    b.onclick = () => onClick && onClick(lots.find((l) => String(l.lot_id) === b.dataset.lot));
  });
}

// ---------- Event picker (ongoing + upcoming cards) ----------
function renderEventCards(el, events, selectedId, onPick) {
  if (!events.length) {
    el.innerHTML = '<div class="empty-card">No ongoing or upcoming events yet.</div>';
    return;
  }
  el.innerHTML = events.map((e) => `
    <button class="event-card ${e.event_id === selectedId ? 'active' : ''}" data-id="${e.event_id}">
      <div class="event-card-top">${badge(e.phase, e.phase === 'ongoing' ? 'Happening today' : 'Upcoming')}
        <span class="muted small">${e.taken_lots}/${e.total_lots} lots taken</span></div>
      <div class="event-card-name">${esc(e.name)}</div>
      <div class="event-card-meta">${esc(fmtDate(e.event_date))} · ${fmtTime(e.start_time)}–${fmtTime(e.end_time)}</div>
      <div class="event-card-meta">${esc(e.location)}</div>
    </button>`).join('');
  el.querySelectorAll('.event-card').forEach((c) => { c.onclick = () => onPick(Number(c.dataset.id)); });
}

// Picks which event to show: ?event=ID, else today's event, else the next upcoming one.
function pickDefaultEvent(events) {
  const fromUrl = Number(qs('event'));
  if (fromUrl && events.some((e) => e.event_id === fromUrl)) return fromUrl;
  const ongoing = events.find((e) => e.phase === 'ongoing');
  return (ongoing || events[0] || {}).event_id || null;
}
