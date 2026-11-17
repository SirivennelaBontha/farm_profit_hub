/* Farm Profit Hub v2 - Team 9 prototype
   Flow: Staff record harvest -> stock becomes available -> customers order only from available stock (within limits)
   -> staff fulfil -> stock goes down and a sale record is created -> dashboard updates profitability and operational KPIs.
   Browser storage stands in for the Neon PostgreSQL database in the Enterprise Architecture. */
(function () {
'use strict';
const CROPS = ['Lettuce', 'Basil', 'Kale', 'Arugula', 'Spinach', 'Microgreens'];
const CAT = ['Leafy Green', 'Herb', 'Leafy Green', 'Leafy Green', 'Leafy Green', 'Specialty Green'];
const CID = ['C001', 'C002', 'C003', 'C004', 'C005', 'C006'];
const EMOJI = ['\u{1F96C}', '\u{1F33F}', '\u{1F966}', '\u{1F957}', '\u{1F343}', '\u{1F331}'];
const TINT = ['linear-gradient(135deg,#6bbf59,#3f9a3a)', 'linear-gradient(135deg,#3fa36b,#1f7a4d)', 'linear-gradient(135deg,#4f8f6f,#2d6a4f)', 'linear-gradient(135deg,#8cc152,#5d9c2c)', 'linear-gradient(135deg,#43a5a0,#27736f)', 'linear-gradient(135deg,#b6d36b,#7ea73a)'];
const IMGS = ['lettuce', 'basil', 'kale', 'arugula', 'spinach', 'microgreens'].map(n => 'assets/img/crop-' + n + '.svg');
const img = (i, cls = '') => `<img class="${cls}" src="${IMGS[i]}" alt="${CROPS[i]}" loading="lazy">`;
const scene = (n, cls = '') => `<img class="${cls}" src="assets/img/scene-${n}.svg" alt="" loading="lazy">`;
const SOLID = ['#4fa84a', '#2c8c5c', '#3c7c5f', '#74ab40', '#358c88', '#98bd52'];
const CH = ['Restaurant', 'Subscription Box'];
const RATE_KWH = 0.14, RATE_LABOR = 18.5, OTHER_PER_KG = 1.38, WASTE_ALERT = 6, KEY = 'farmProfitHub_v2';
const PER_KG = { kwh: [6.81, 8.38, 7.36, 6.48, 6.9, 10.18], hrs: [0.061, 0.092, 0.071, 0.074, 0.071, 0.126],
  seed: [0.26, 0.424, 0.326, 0.35, 0.365, 1.279], nut: [0.402, 0.527, 0.434, 0.414, 0.455, 0.322] };
const PACK_PER_KG = [0.48, 0.92], DIST_PER_KG = [0.63, 1.17];
// Purchase limits per crop line
const LIMITS = { 0: { min: 2, max: 25, step: 1 }, 1: { min: 0.5, max: 3, step: 0.5 } };
const BOX = { sizes: [['Small', 2], ['Medium', 3.5], ['Large', 5]], minCrops: 2, maxCrops: 4 };
const ACCOUNTS = {
  customer: [{ id: 'rest', name: 'Green Fork Bistro', type: 'Restaurant account', ch: 0 }, { id: 'home', name: 'The Patel Family', type: 'Household subscriber', ch: 1 }],
  staff: [{ id: 'staff', name: 'Alex Rivera', type: 'Production staff' }],
  manager: [{ id: 'mgr', name: 'Farm Owner', type: 'Management' }]
};

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const r2 = v => Math.round(v * 100) / 100;
const money = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyK = v => Math.abs(v) >= 1000 ? (v < 0 ? '-' : '') + '$' + (Math.abs(v) / 1000).toFixed(1) + 'K' : money(v);
const pct = v => (isFinite(v) ? v.toFixed(1) : '0.0') + '%';
const kg = v => (Math.round(v * 10) / 10).toLocaleString() + ' kg';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function toast(msg) { const t = $('#toast'); t.innerHTML = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3800); }

/* ---------- central farm database ---------- */
const historical = (window.SEED_RECORDS || []).map(a => ({ id: a[0], date: a[1], crop: a[2], ch: a[3], batch: a[4], h: a[5], s: a[6], w: a[7], price: a[8], rev: a[9],
  kwh: a[10], elec: a[11], hrs: a[12], lab: a[13], seed: a[14], nut: a[15], pack: a[16], dist: a[17], tc: a[18], gp: a[19], src: 'Dataset 1' }));
const OPENING = [140, 45, 70, 40, 50, 18];
function poolFrom(crop, s) { const r = (window.SEED_POOL_RATES || {})[crop]; const p = { s }; ['h', 'w', 'kwh', 'hrs', 'seed', 'nut', 'other'].forEach(k => p[k] = r2(s * r[k])); return p; }
function freshState() {
  const d0 = today();
  return {
    inv: CROPS.map((_, i) => poolFrom(i, OPENING[i])),
    harvests: [], records: [], prices: Object.assign({}, window.SEED_PRICES || {}), priceLog: [],
    orders: [
      { id: 'ORD-1001', date: addDays(d0, -1), cust: 'rest', custName: 'Green Fork Bistro', ch: 0, deliver: addDays(d0, 2), status: 'Placed', items: [{ crop: 0, kg: 18, price: 7.07 }, { crop: 1, kg: 6, price: 12.65 }] },
      { id: 'ORD-1002', date: addDays(d0, -1), cust: 'home', custName: 'The Patel Family', ch: 1, deliver: addDays(d0, 1), status: 'Packed', fromSub: 'SUB-201', items: [{ crop: 5, kg: 1.17, price: 22.19 }, { crop: 4, kg: 1.17, price: 10.25 }, { crop: 3, kg: 1.16, price: 11.07 }] },
      { id: 'ORD-1003', date: d0, cust: 'other', custName: 'Mila Cafe', ch: 0, deliver: addDays(d0, 3), status: 'Placed', items: [{ crop: 2, kg: 10, price: 8.09 }] }
    ],
    subs: [{ id: 'SUB-201', cust: 'home', custName: 'The Patel Family', size: 'Medium', kg: 3.5, freq: 'Weekly', crops: [5, 4, 3], price: 50.28, start: addDays(d0, -30), status: 'Active' }],
    log: [], seq: { order: 1004, sub: 202, rec: 1201, batch: 401, hv: 1 }, session: null, target: 35, flash: null
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || freshState(); } catch (e) { S = freshState(); }
if (!S.inv) S = freshState();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* in-memory only */ } }
const allRecords = () => historical.concat(S.records);
const priceOf = (c, ch) => S.prices[c + '-' + ch];
const orderTotal = o => o.items.reduce((a, it) => a + it.kg * it.price, 0);
const reserved = c => S.orders.filter(o => o.status !== 'Delivered').reduce((a, o) => a + o.items.filter(i => i.crop === c).reduce((x, i) => x + i.kg, 0), 0);
const onHand = c => S.inv[c].s;
const available = c => Math.max(0, r2(onHand(c) - reserved(c)));

/* business rules */
function calcHarvest(i) {
  const s = r2(i.h - i.w), elec = r2(i.kwh * RATE_KWH), lab = r2(i.hrs * RATE_LABOR), other = r2(i.h * OTHER_PER_KG);
  const prod = r2(elec + lab + i.seed + i.nut + other);
  return { s, elec, lab, other, prod, costKg: s > 0 ? prod / s : 0, wr: i.h ? i.w / i.h * 100 : 0, lp: i.hrs > 0 ? s / i.hrs : 0 };
}

/* REST-style API layer (logged on the Data Flow page) */
function logCall(method, path, body) { S.log.unshift({ t: nowTime(), method, path, body: body ? JSON.stringify(body).slice(0, 170) : '' }); S.log = S.log.slice(0, 80); }
const api = {
  addHarvest(i) {
    const c = calcHarvest(i), p = S.inv[i.crop];
    const hv = Object.assign({}, i, { id: 'HV-' + String(S.seq.hv++).padStart(3, '0'), batch: 'B' + String(S.seq.batch++).padStart(4, '0'), s: c.s, prod: c.prod, costKg: r2(c.costKg), other: c.other });
    p.s = r2(p.s + c.s); p.h = r2(p.h + i.h); p.w = r2(p.w + i.w); p.kwh = r2(p.kwh + i.kwh); p.hrs = r2(p.hrs + i.hrs); p.seed = r2(p.seed + i.seed); p.nut = r2(p.nut + i.nut); p.other = r2(p.other + c.other);
    S.harvests.push(hv); S.flash = i.crop;
    logCall('POST', '/api/harvests', { id: hv.id, crop: CROPS[i.crop], harvest_kg: i.h, waste_kg: i.w, sellable_kg: c.s });
    logCall('PATCH', '/api/inventory/' + CID[i.crop], { add_kg: c.s, on_hand_kg: p.s }); save(); return hv;
  },
  placeOrder(o) {
    for (const it of o.items) if (it.kg > available(it.crop) + 1e-9) throw new Error(CROPS[it.crop] + ' only has ' + kg(available(it.crop)) + ' available');
    o.id = 'ORD-' + (S.seq.order++); o.status = 'Placed'; o.date = today(); S.orders.unshift(o);
    logCall('POST', '/api/orders', { id: o.id, customer: o.custName, lines: o.items.length, total: r2(orderTotal(o)) });
    logCall('PATCH', '/api/inventory/reserve', o.items.map(i => ({ crop: CID[i.crop], kg: i.kg }))); save(); return o;
  },
  setStatus(id, status) { const o = S.orders.find(x => x.id === id); if (o) { o.status = status; logCall('PATCH', '/api/orders/' + id, { status }); save(); } return o; },
  fulfil(id) {
    const o = S.orders.find(x => x.id === id); if (!o || o.status === 'Delivered') return [];
    for (const it of o.items) if (it.kg > onHand(it.crop) + 1e-9) throw new Error('Not enough ' + CROPS[it.crop] + ' on hand. Record a harvest first.');
    const made = [];
    o.items.forEach(it => {
      const p = S.inv[it.crop], f = it.kg / p.s, take = {};
      ['h', 'w', 'kwh', 'hrs', 'seed', 'nut', 'other'].forEach(k => { take[k] = r2(p[k] * f); p[k] = r2(p[k] - take[k]); });
      p.s = r2(p.s - it.kg);
      const elec = r2(take.kwh * RATE_KWH), lab = r2(take.hrs * RATE_LABOR), pack = r2(it.kg * PACK_PER_KG[o.ch]), dist = r2(it.kg * DIST_PER_KG[o.ch]);
      const tc = r2(elec + lab + take.seed + take.nut + take.other + pack + dist), rev = r2(it.kg * it.price);
      const lastHv = S.harvests.filter(h => h.crop === it.crop).slice(-1)[0];
      const rec = { id: 'VF' + String(S.seq.rec++).padStart(4, '0'), date: today(), crop: it.crop, ch: o.ch, batch: lastHv ? lastHv.batch : 'OPENING', h: take.h, s: r2(it.kg), w: take.w, price: it.price, rev,
        kwh: take.kwh, elec, hrs: take.hrs, lab, seed: take.seed, nut: take.nut, pack, dist, tc, gp: r2(rev - tc), src: 'App sale', order: o.id };
      S.records.push(rec); made.push(rec);
    });
    o.status = 'Delivered'; S.flash = o.items[0].crop;
    logCall('PATCH', '/api/orders/' + id, { status: 'Delivered' });
    logCall('PATCH', '/api/inventory/deduct', o.items.map(i => ({ crop: CID[i.crop], kg: i.kg })));
    made.forEach(r => logCall('POST', '/api/records', { id: r.id, crop: CROPS[r.crop], channel: CH[r.ch], kg: r.s, revenue: r.rev, total_cost: r.tc, gross_profit: r.gp }));
    save(); return made;
  },
  subscribe(sb) { sb.id = 'SUB-' + (S.seq.sub++); sb.status = 'Active'; sb.start = today(); S.subs.unshift(sb); logCall('POST', '/api/subscriptions', { id: sb.id, size: sb.size, freq: sb.freq, price: sb.price }); save(); return sb; },
  cancelSub(id) { const sb = S.subs.find(x => x.id === id); if (sb) { sb.status = 'Cancelled'; logCall('PATCH', '/api/subscriptions/' + id, { status: 'Cancelled' }); save(); } },
  setPrice(c, ch, price) { const k = c + '-' + ch, old = S.prices[k]; S.prices[k] = r2(price); S.priceLog.unshift({ t: today() + ' ' + nowTime(), crop: c, ch, old, price: r2(price) }); logCall('PUT', '/api/prices/' + CID[c] + '/' + (ch ? 'CH02' : 'CH01'), { old, new: r2(price) }); save(); },
  getKpis(q) { logCall('GET', '/api/kpis' + q); }
};
function aggregate(recs) {
  const a = { n: recs.length, h: 0, s: 0, w: 0, rev: 0, tc: 0, gp: 0, hrs: 0, gmSum: 0, wrSum: 0 };
  recs.forEach(r => { a.h += r.h; a.s += r.s; a.w += r.w; a.rev += r.rev; a.tc += r.tc; a.gp += r.gp; a.hrs += r.hrs; a.gmSum += r.rev ? r.gp / r.rev * 100 : 0; a.wrSum += r.h ? r.w / r.h * 100 : 0; });
  a.avgGm = a.n ? a.gmSum / a.n : 0; a.avgWr = a.n ? a.wrSum / a.n : 0;
  a.margin = a.rev ? a.gp / a.rev * 100 : 0; a.costKg = a.s ? a.tc / a.s : 0; a.wasteRate = a.h ? a.w / a.h * 100 : 0; a.lp = a.hrs ? a.s / a.hrs : 0;
  return a;
}

/* ---------- session / routing ---------- */
function login(role, accId) {
  const pref = S.session && S.session.pref; const acc = ACCOUNTS[role].find(a => a.id === accId) || ACCOUNTS[role][0];
  S.session = { role, acc: acc.id, pref: role === 'customer' ? acc.id : pref };
  logCall('POST', '/api/session', { role, user: acc.name, password: 'not required (prototype)' }); save();
}
const account = () => S.session ? ACCOUNTS[S.session.role].find(a => a.id === S.session.acc) : null;
function ensureRole(role) { if (!S.session || S.session.role !== role) login(role, role === 'customer' && S.session && S.session.pref ? S.session.pref : undefined); }
const charts = {};
function chart(id, cfg) { if (charts[id]) charts[id].destroy(); const el = document.getElementById(id); if (el && window.Chart) charts[id] = new Chart(el, cfg); }
function killCharts() { Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; }); }
if (window.Chart) { Chart.defaults.font.family = '"Segoe UI",system-ui,Roboto,Arial,sans-serif'; Chart.defaults.color = '#5f716c'; Chart.defaults.plugins.legend.labels.boxWidth = 12; }
const parseRoute = () => { const h = location.hash.replace(/^#\/?/, '') || 'login'; const [page, tab] = h.split('/'); return { page, tab }; };
const views = {};
function render() {
  killCharts(); const { page, tab } = parseRoute(); const v = views[page] || views.login;
  if (['customer', 'staff', 'manager'].includes(page)) ensureRole(page);
  renderNav(page); $('#app').innerHTML = ''; v(tab); renderTour(); window.scrollTo(0, 0);
}
function renderNav(page) {
  const acc = account(), portal = { customer: 'Customer Portal', staff: 'Staff Portal', manager: 'Management Dashboard' };
  let h = S.session && portal[page] ? `<span class="rolechip">${portal[page]} · ${esc(acc.name)}</span>` : '';
  h += `<a href="#/login" class="${page === 'login' ? 'active' : ''}">Switch role</a><a href="#/data" class="${page === 'data' ? 'active' : ''}">Data flow</a><a href="#/tutorial" class="${page === 'tutorial' ? 'active' : ''}">Tutorial</a><button id="resetBtn">Reset demo</button>`;
  $('#topnav').innerHTML = h;
  const rb = $('#resetBtn'); rb.onclick = () => { if (!rb.dataset.armed) { rb.dataset.armed = '1'; rb.textContent = 'Click again to reset'; setTimeout(() => { if (rb.isConnected) { delete rb.dataset.armed; rb.textContent = 'Reset demo'; } }, 4000); return; } const t = S.tour; S = freshState(); S.tour = t; save(); toast('Demo data restored.'); render(); };
}
const cropTop = (i, extra = '') => `<div class="photo">${img(i)}<div class="cap"><div class="nm">${CROPS[i]}</div><div class="ct">${CAT[i]}${extra}</div></div></div>`;
function stockBar(c) { const a = available(c), cap = Math.max(onHand(c), 1); const cls = a <= 0.01 ? 'out' : a < 10 ? 'low' : ''; return `<div class="stock ${cls}"><span style="width:${Math.min(100, a / cap * 100)}%"></span></div>`; }
function timeline(status) { const st = ['Placed', 'Packed', 'Delivered'], n = st.indexOf(status); return `<div class="timeline">${st.map((s, i) => `${i ? `<div class="bar2 ${i <= n ? 'on' : ''}"></div>` : ''}<div class="dot ${i <= n ? 'on' : ''}">${i <= n ? '✓' : ''}</div>`).join('')}</div><div class="tlab"><span>Placed</span><span>Packed</span><span>Delivered</span></div>`; }

/* ---------- LANDING ---------- */
const FARM_SVG = `<svg viewBox="0 0 360 260" role="img" aria-label="Vertical farm rack illustration"><rect x="30" y="20" width="300" height="225" rx="14" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.35)"/>
${[0, 1, 2].map(r => { const y = 40 + r * 70; return `<rect x="45" y="${y}" width="270" height="8" rx="4" fill="#ff8fd8" opacity=".85"/><rect x="45" y="${y}" width="270" height="34" fill="url(#glow)" opacity=".5"/><rect x="45" y="${y + 52}" width="270" height="10" rx="3" fill="#cfe8d8"/>` + Array.from({ length: 9 }, (_, k) => { const x = 62 + k * 30, c = ['#5cc46a', '#2f9e5b', '#8fd16a'][(k + r) % 3]; return `<ellipse cx="${x - 7}" cy="${y + 40}" rx="9" ry="6" fill="${c}" transform="rotate(-30 ${x - 7} ${y + 40})"/><ellipse cx="${x + 7}" cy="${y + 40}" rx="9" ry="6" fill="${c}" transform="rotate(30 ${x + 7} ${y + 40})"/><ellipse cx="${x}" cy="${y + 33}" rx="6" ry="10" fill="${c}"/><rect x="${x - 1}" y="${y + 42}" width="2" height="10" fill="#2d6a4f"/>`; }).join(''); }).join('')}
<defs><linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fd8"/><stop offset="1" stop-color="#ff8fd8" stop-opacity="0"/></linearGradient></defs></svg>`;
views.login = function () {
  const a = aggregate(allRecords()), totalAvail = CROPS.reduce((x, _, i) => x + available(i), 0), open = S.orders.filter(o => o.status !== 'Delivered').length;
  const steps = [['harvest', '#e3f2e9', 'Staff', 'Record harvest', `${S.harvests.length} new harvest(s)`], ['stock', '#fdf3e1', 'System', 'Stock available', `${kg(totalAvail)} to sell`],
    ['box', '#e5eef8', 'Customer', 'Order from stock', `${open} open order(s)`], ['van', '#f3e8f5', 'Staff', 'Fulfil, stock goes down', `${S.records.length} sale(s) recorded`], ['dashboard', '#e3f2e9', 'Management', 'Dashboard updates', `Margin ${pct(a.margin)}`]];
  $('#app').innerHTML = `<section class="hero2"><div><span class="pill" style="background:rgba(255,255,255,.18);color:#fff">Team 9 · App prototype</span><h1>Farm Profit Hub</h1>
    <p>One system for the urban vertical farm. Staff record each harvest, customers order only what is in stock, and management sees the true profit of every crop and sales channel.</p>
    <div class="flex" style="margin-top:16px"><button class="btn" id="startTour" style="background:#fff;color:#0f4f31">▶ Start guided tour</button><a class="btn ghost" href="#/tutorial">Read the tutorial</a></div></div><img class="heroimg" src="assets/img/hero-farm.svg" alt="Vertical farm rack with LED grow lights"></section>
  <h2>How it works</h2><div class="flow5">${steps.map(s => `<div class="fstep">${scene(s[0], 'fimg')}<div class="who">${s[2]}</div><b>${s[3]}</b><div class="live">${s[4]}</div></div>`).join('')}</div>
  <h2>Choose how you sign in</h2><p class="lead">No password needed. Each role opens its own interface, all using the same farm database.</p>
  <div class="roles">
    <div class="role s">${scene('harvest', 'rimg')}<h3>Staff Portal</h3><ul><li>Record harvest, waste, energy, labor and costs</li><li>See live stock for every crop</li><li>Harvest planner from customer demand</li><li>Fulfil orders: stock goes down, sale is recorded</li></ul>
      <div class="acc"><button class="btn warn" data-login="staff" data-acc="staff">Continue as Alex Rivera (Staff)</button></div></div>
    <div class="role c">${scene('box', 'rimg')}<h3>Customer Portal</h3><ul><li>See what is in stock right now</li><li>Order within min and max limits</li><li>Build a subscription box from available crops</li><li>Track each order</li></ul>
      <div class="acc">${ACCOUNTS.customer.map(c => `<button class="btn blue" data-login="customer" data-acc="${c.id}">Continue as ${esc(c.name)}</button>`).join('')}</div></div>
    <div class="role">${scene('dashboard', 'rimg')}<h3>Management Dashboard</h3><ul><li>Revenue, cost, profit, margin and waste</li><li>The 4 project KPIs</li><li>Charts by crop, channel and month</li><li>Stock levels and pricing tool</li></ul>
      <div class="acc"><button class="btn" data-login="manager" data-acc="mgr">Continue as Farm Owner</button></div></div></div>
  <p class="note" style="margin-top:14px">Login is simulated so every interface opens without credentials. The final build would check roles with JWT authorization, as in our Enterprise Architecture.</p>`;
  $$('[data-login]').forEach(b => b.onclick = () => { login(b.dataset.login, b.dataset.acc); location.hash = '#/' + b.dataset.login; });
  $('#startTour').onclick = startTour;
};

/* ---------- STAFF PORTAL ---------- */
views.staff = function (tab) {
  tab = tab || 'record';
  const open = S.orders.filter(o => o.status !== 'Delivered');
  const tabs = [['record', '\u{1F33E} Record Harvest & Sale'], ['plan', '\u{1F4C5} Harvest Planner'], ['orders', `\u{1F69A} Orders to Fulfil (${open.length})`], ['mine', '\u{1F4CB} My Entries']];
  $('#app').innerHTML = `<div class="banner"><div><h1>Staff Portal</h1><p class="lead">Record each harvest once. It goes into stock straight away, customers can order it, and every sale updates the Management Dashboard.</p></div>${scene('stock', 'bimg')}</div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="pane"></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { location.hash = '#/staff/' + b.dataset.tab; });
  const pane = $('#pane');
  const invTiles = () => `<div class="invgrid">${CROPS.map((c, i) => `<div class="inv ${S.flash === i ? 'flash' : ''}">${img(i, 'thumb')}<b>${c}</b><div class="kg">${kg(onHand(i))}</div><div class="sub">on hand</div>${stockBar(i)}<div class="sub" style="margin-top:4px">${kg(reserved(i))} reserved · <b style="color:var(--g)">${kg(available(i))} free</b></div></div>`).join('')}</div>`;
  if (tab === 'record') {
    const c0 = 0, h0 = 60, w0 = 3;
    pane.innerHTML = `<div class="sec">Live stock (updates when you save a harvest or fulfil an order)</div>${invTiles()}
    <div class="grid g2" style="margin-top:18px"><div class="card"><h3>\u{1F33E} Record a harvest batch</h3>
      <div class="fgrid">
        <label class="f">Crop <select id="f_crop">${CROPS.map((c, i) => `<option value="${i}">${EMOJI[i]} ${c}</option>`).join('')}</select></label>
        <label class="f">Harvest date <input type="date" id="f_date" value="${today()}"></label>
        <label class="f">Harvest weight (kg) <input type="number" step="0.1" id="f_h" value="${h0}"></label>
        <label class="f">Waste at harvest (kg) <input type="number" step="0.1" id="f_w" value="${w0}"></label>
        <label class="f">Electricity (kWh) <input type="number" step="0.1" id="f_kwh" value="${r2(h0 * PER_KG.kwh[c0])}"></label>
        <label class="f">Labor hours <input type="number" step="0.01" id="f_hrs" value="${r2(h0 * PER_KG.hrs[c0])}"></label>
        <label class="f">Seed cost ($) <input type="number" step="0.01" id="f_seed" value="${r2(h0 * PER_KG.seed[c0])}"></label>
        <label class="f">Nutrient cost ($) <input type="number" step="0.01" id="f_nut" value="${r2(h0 * PER_KG.nut[c0])}"></label>
      </div><div id="ferr" class="alert b hidden"></div>
      <div class="flex"><button class="btn" id="saveHv">Add to stock</button><button class="btn ghost" id="fillTyp">Fill typical values</button></div>
      <p class="note">The <b>sale</b> part is recorded automatically when you fulfil an order in "Orders to Fulfil": stock goes down and revenue, packaging and delivery are added.</p></div>
    <div class="card"><div class="flex"><img id="hvImg" class="hvimg" src="${IMGS[0]}" alt=""><h3>Live production check</h3></div><div class="preview" id="prev"></div><div id="walert" style="margin-top:10px"></div>
      <p class="formula">Sellable = harvest - waste. Electricity = kWh x $${RATE_KWH}. Labor = hours x $${RATE_LABOR.toFixed(2)}. Water and facility = $${OTHER_PER_KG} per harvested kg. Labor productivity (KPI 4) = sellable kg / labor hours.</p></div></div>
    <div class="card tw" style="margin-top:6px"><h3>Recent sales (from fulfilled orders)</h3>${salesTable(S.records.slice(-6).reverse())}</div>`;
    const ids = ['h', 'w', 'kwh', 'hrs', 'seed', 'nut'];
    const read = () => { const o = { crop: +$('#f_crop').value, date: $('#f_date').value || today() }; ids.forEach(k => o[k] = parseFloat($('#f_' + k).value)); return o; };
    const upd = () => {
      const o = read(), errs = [];
      ids.forEach(k => { const el = $('#f_' + k), bad = !isFinite(o[k]) || o[k] < 0; el.classList.toggle('err', bad); if (bad) errs.push(el.parentElement.firstChild.textContent.trim() + ' must be 0 or more'); });
      if (isFinite(o.h) && o.h <= 0) { errs.push('Harvest weight must be above 0'); $('#f_h').classList.add('err'); }
      if (isFinite(o.w) && o.w > o.h) { errs.push('Waste cannot be more than the harvest'); $('#f_w').classList.add('err'); }
      $('#ferr').classList.toggle('hidden', !errs.length); $('#ferr').innerHTML = errs.join('<br>');
      if (errs.length) { $('#prev').innerHTML = '<p class="note">Fix the highlighted fields to see the calculation.</p>'; $('#walert').innerHTML = ''; return null; }
      const c = calcHarvest(o), after = r2(onHand(o.crop) + c.s); $('#hvImg').src = IMGS[o.crop];
      $('#prev').innerHTML = [['Sellable weight added to stock', `<span class="big" style="color:var(--g)">+${kg(c.s)}</span>`], ['Waste rate (KPI 3)', pct(c.wr)], ['Electricity cost', money(c.elec)], ['Labor cost', money(c.lab)], ['Seed + nutrients', money(o.seed + o.nut)], ['Water and facility', money(c.other)],
        ['Production cost', '<b>' + money(c.prod) + '</b>'], ['Production cost per sellable kg (KPI 2)', money(c.costKg)], ['Labor productivity (KPI 4)', c.lp.toFixed(1) + ' kg / hour'], [`${CROPS[o.crop]} stock after saving`, `<span class="big">${kg(after)}</span>`]]
        .map(([l, v]) => `<div class="row"><span>${l}</span><span>${v}</span></div>`).join('');
      $('#walert').innerHTML = c.wr > WASTE_ALERT ? `<div class="alert w">⚠ Waste ${pct(c.wr)} is above the ${WASTE_ALERT}% limit. Check the Harvest Planner before the next ${CROPS[o.crop]} harvest.</div>` : `<div class="alert g">✔ Waste ${pct(c.wr)} is within the ${WASTE_ALERT}% limit.</div>`;
      return o;
    };
    $$('#pane input,#pane select').forEach(x => x.oninput = upd);
    const fill = () => { const c = +$('#f_crop').value, h = parseFloat($('#f_h').value) || 60; $('#f_kwh').value = r2(h * PER_KG.kwh[c]); $('#f_hrs').value = r2(h * PER_KG.hrs[c]); $('#f_seed').value = r2(h * PER_KG.seed[c]); $('#f_nut').value = r2(h * PER_KG.nut[c]); upd(); };
    $('#f_crop').onchange = fill; $('#fillTyp').onclick = fill; $('#f_h').oninput = fill;
    $('#saveHv').onclick = () => { const o = upd(); if (!o) { toast('Please fix the highlighted fields.'); return; } const hv = api.addHarvest(o); toast(`${hv.id}: +${kg(hv.s)} ${CROPS[o.crop]} added to stock. Customers can order it now.`); tourAdvanceFrom('staff-harvest'); render(); };
    upd(); S.flash = null; save();
  } else if (tab === 'plan') {
    const demand = CROPS.map((_, i) => reserved(i));
    const subW = CROPS.map(() => 0); S.subs.filter(s => s.status === 'Active').forEach(s => s.crops.forEach(c => subW[c] += (s.kg / s.crops.length) / (s.freq === 'Weekly' ? 1 : 2)));
    const recs = allRecords();
    const wr = CROPS.map((_, i) => aggregate(recs.filter(x => x.crop === i).slice(-60)).wasteRate);
    const need = CROPS.map((_, i) => demand[i] + subW[i]);
    const gap = CROPS.map((_, i) => Math.max(0, need[i] - onHand(i)));
    const harvest = gap.map((g, i) => g / (1 - wr[i] / 100));
    pane.innerHTML = `<div class="grid g2"><div class="card tw"><h3>What to harvest next</h3><p class="note">Planned from real orders: open orders plus one week of subscription boxes, minus what is already on hand, grossed up by each crop's recent waste rate.</p>
      <table><tr><th>Crop</th><th class="n">Demand</th><th class="n">On hand</th><th class="n">Waste</th><th class="n">Harvest</th></tr>
      ${CROPS.map((c, i) => `<tr><td>${img(i, 'mini')} ${c}</td><td class="n">${kg(need[i])}</td><td class="n">${kg(onHand(i))}</td><td class="n">${pct(wr[i])}</td><td class="n">${harvest[i] > 0 ? `<span class="pill w">${kg(harvest[i])}</span>` : '<span class="pill g">✔ covered</span>'}</td></tr>`).join('')}</table>
      <p class="formula">Harvest = max(0, demand - on hand) / (1 - recent waste rate).</p></div>
      <div class="card"><h3>Demand vs stock on hand</h3><div class="cbox" style="height:300px"><canvas id="cPlan"></canvas></div></div></div>`;
    chart('cPlan', { type: 'bar', data: { labels: CROPS, datasets: [{ label: 'Customer demand (kg)', data: need.map(r2), backgroundColor: '#2f6fae', borderRadius: 4 }, { label: 'On hand (kg)', data: CROPS.map((_, i) => onHand(i)), backgroundColor: '#1f7a4d', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false } });
  } else if (tab === 'orders') {
    pane.innerHTML = `<div class="sec">Open customer orders</div>${open.length ? open.map(o => `<div class="orderc"><div><div class="flex"><b>${o.id}</b><span>${esc(o.custName)}</span><span class="pill ${o.ch ? 'c' : 'g'}">${CH[o.ch]}</span><span class="note">deliver by ${o.deliver}</span></div>
      <div class="items">${o.items.map(i => `<span class="it">${img(i.crop, 'mini')} ${CROPS[i.crop]} ${i.kg} kg <span class="note">(${kg(onHand(i.crop))} on hand)</span></span>`).join('')}</div><div style="margin-top:8px">${timeline(o.status)}</div></div>
      <div style="text-align:right"><div class="total" style="font-size:18px">${money(orderTotal(o))}</div><div class="flex" style="justify-content:flex-end;margin-top:6px">${o.status === 'Placed' ? `<button class="btn sm ghost" data-pack="${o.id}">Mark packed</button>` : ''}<button class="btn sm" data-ful="${o.id}">Fulfil & record sale</button></div></div></div>`).join('') : '<div class="card"><p class="note">All orders are fulfilled.</p></div>'}
      <p class="note">"Fulfil & record sale" takes the kg out of stock, marks the order delivered, and creates a sale record with revenue and full cost.</p>`;
    $$('[data-pack]').forEach(b => b.onclick = () => { api.setStatus(b.dataset.pack, 'Packed'); toast(b.dataset.pack + ' packed. The customer sees the new status.'); render(); });
    $$('[data-ful]').forEach(b => b.onclick = () => { try { const recs = api.fulfil(b.dataset.ful); toast(`${b.dataset.ful} delivered. Stock reduced and ${recs.length} sale record(s) added (profit ${money(recs.reduce((a, r) => a + r.gp, 0))}).`); tourAdvanceFrom('staff-fulfil'); location.hash = '#/staff/record'; } catch (e) { toast(e.message); } });
  } else {
    pane.innerHTML = `<div class="card tw"><h3>Harvests recorded in this app (${S.harvests.length})</h3>${S.harvests.length ? `<table><tr><th>ID</th><th>Date</th><th>Batch</th><th>Crop</th><th class="n">Harvest</th><th class="n">Waste</th><th class="n">Sellable</th><th class="n">Prod. cost</th><th class="n">Cost/kg</th></tr>
      ${S.harvests.slice().reverse().map(h => `<tr><td>${h.id}</td><td>${h.date}</td><td>${h.batch}</td><td>${img(h.crop, 'mini')} ${CROPS[h.crop]}</td><td class="n">${kg(h.h)}</td><td class="n">${pct(h.w / h.h * 100)}</td><td class="n">${kg(h.s)}</td><td class="n">${money(h.prod)}</td><td class="n">${money(h.costKg)}</td></tr>`).join('')}</table>` : '<p class="note">No harvests yet.</p>'}</div>
      <div class="card tw"><h3>Sales recorded from fulfilled orders (${S.records.length})</h3>${salesTable(S.records.slice().reverse())}<p class="note">The 1,200 historical records from Dataset 1 are also in the database and feed the Management Dashboard.</p></div>`;
  }
};
function salesTable(rows) {
  if (!rows.length) return '<p class="note">No sales yet. Fulfil an order to create one.</p>';
  return `<table><tr><th>ID</th><th>Order</th><th>Crop</th><th>Channel</th><th class="n">kg</th><th class="n">Revenue</th><th class="n">Total cost</th><th class="n">Profit</th><th class="n">Margin</th></tr>${rows.map(r => { const m = r.rev ? r.gp / r.rev * 100 : 0; return `<tr><td>${r.id}</td><td>${r.order || ''}</td><td>${img(r.crop, 'mini')} ${CROPS[r.crop]}</td><td>${CH[r.ch]}</td><td class="n">${r.s}</td><td class="n">${money(r.rev)}</td><td class="n">${money(r.tc)}</td><td class="n">${money(r.gp)}</td><td class="n"><span class="pill ${m < 0 ? 'b' : m < S.target ? 'w' : 'g'}">${pct(m)}</span></td></tr>`; }).join('')}</table>`;
}

/* ---------- CUSTOMER PORTAL ---------- */
views.customer = function (tab) {
  const acc = account(), ch = acc.ch, isHome = ch === 1, L = LIMITS[ch];
  tab = tab || (isHome ? 'box' : 'shop');
  const tabs = [isHome ? ['box', '\u{1F4E6} Subscription box'] : null, ['shop', isHome ? '\u{1F6D2} Extra items' : '\u{1F6D2} Shop and order'], ['orders', '\u{1F69A} My orders']].filter(Boolean);
  $('#app').innerHTML = `<div class="banner"><div><h1>Welcome, ${esc(acc.name)}</h1><p class="lead">${acc.type} · you can only order what the farm has in stock right now.</p>
    <div class="flex"><span class="note">Switch account:</span>${ACCOUNTS.customer.map(c => `<button class="btn sm ${c.id === acc.id ? '' : 'ghost'}" data-acc="${c.id}">${esc(c.name)}</button>`).join('')}</div></div>${scene(isHome ? 'box' : 'van', 'bimg')}</div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="pane"></div>`;
  $$('[data-acc]').forEach(b => b.onclick = () => { login('customer', b.dataset.acc); location.hash = '#/customer'; render(); });
  $$('[data-tab]').forEach(b => b.onclick = () => { location.hash = '#/customer/' + b.dataset.tab; });
  const pane = $('#pane');
  if (tab === 'shop') {
    const recent = S.priceLog.filter(p => p.ch === ch)[0];
    pane.innerHTML = `${recent ? `<div class="alert g">\u{1F4B2} Price update: ${CROPS[recent.crop]} is now ${money(recent.price)} per kg (was ${money(recent.old)}).</div>` : ''}
      <div class="shopgrid"><div class="cropgrid">${CROPS.map((c, i) => { const a = available(i), out = a < L.min; return `
        <div class="crop ${out ? 'disabled' : ''}" data-crop="${i}">${cropTop(i)}<div class="body">
          <div class="flex"><span class="pr">${money(priceOf(i, ch))} <small>per kg</small></span><span class="right chip ${out ? 'bad' : a < 10 ? 'warn' : 'ok'}">${out ? 'Out of stock' : kg(a) + ' available'}</span></div>
          ${stockBar(i)}<div class="chips"><span class="chip">Min ${L.min} kg</span><span class="chip">Max ${Math.min(L.max, Math.floor(a / L.step) * L.step)} kg</span></div>
          <div class="flex"><div class="stepper"><button data-dec="${i}" ${out ? 'disabled' : ''}>−</button><input type="number" min="0" step="${L.step}" value="0" data-q="${i}" ${out ? 'disabled' : ''}><button data-inc="${i}" ${out ? 'disabled' : ''}>+</button></div><span class="note">kg</span></div>
          <div class="msg" id="msg${i}"></div></div></div>`; }).join('')}</div>
      <div class="card sumbox"><h3>\u{1F9FE} Your order</h3><div id="lines"><p class="note">Add crops with the + buttons.</p></div>
        <div class="line" style="border:none;margin-top:6px"><span>Total</span><span class="total" id="otot">$0.00</span></div>
        <label class="f">Delivery date <input type="date" id="deliv" value="${addDays(today(), isHome ? 2 : 3)}"></label>
        <button class="btn blue" id="placeBtn" style="width:100%;justify-content:center" disabled>Place order</button>
        <p class="note">Limits for ${CH[ch].toLowerCase()} orders: ${L.min} to ${L.max} kg per crop, never more than what is available.</p></div></div>`;
    const check = () => {
      let ok = true, any = false; const lines = [];
      CROPS.forEach((_, i) => { const el = $(`[data-q="${i}"]`); if (!el || el.disabled) return; const q = +el.value || 0, a = available(i), msg = $('#msg' + i); let m = '';
        if (q > 0) { any = true; if (q < L.min) m = `Minimum is ${L.min} kg`; else if (q > L.max) m = `Maximum is ${L.max} kg per order`; else if (q > a) m = `Only ${kg(a)} available`; }
        if (m) ok = false; msg.innerHTML = m ? `<span style="color:var(--bad)">⚠ ${m}</span>` : q > 0 ? `<span style="color:var(--g)">✔ ${money(q * priceOf(i, ch))}</span>` : '';
        el.classList.toggle('err', !!m); if (q > 0) lines.push([i, q]); });
      $('#lines').innerHTML = lines.length ? lines.map(([i, q]) => `<div class="line"><span>${img(i, 'mini')} ${CROPS[i]} × ${q} kg</span><span>${money(q * priceOf(i, ch))}</span></div>`).join('') : '<p class="note">Add crops with the + buttons.</p>';
      $('#otot').textContent = money(lines.reduce((a, [i, q]) => a + q * priceOf(i, ch), 0)); $('#placeBtn').disabled = !(ok && any); return lines;
    };
    $$('[data-q]').forEach(x => x.oninput = check);
    $$('[data-inc]').forEach(b => b.onclick = () => { const el = $(`[data-q="${b.dataset.inc}"]`), q = +el.value || 0; el.value = q === 0 ? L.min : r2(q + L.step); check(); });
    $$('[data-dec]').forEach(b => b.onclick = () => { const el = $(`[data-q="${b.dataset.dec}"]`), q = +el.value || 0; el.value = q <= L.min ? 0 : r2(q - L.step); check(); });
    $('#placeBtn').onclick = () => { const lines = check(); try { const o = api.placeOrder({ cust: acc.id, custName: acc.name, ch, deliver: $('#deliv').value || addDays(today(), 3), items: lines.map(([i, q]) => ({ crop: i, kg: q, price: priceOf(i, ch) })) });
      toast(`Order ${o.id} placed (${money(orderTotal(o))}). The stock is now reserved for you.`); tourAdvanceFrom('customer-order'); location.hash = '#/customer/orders'; } catch (e) { toast(e.message); } };
  } else if (tab === 'box') {
    let size = 3.5; let sel = [5, 4, 1].filter(i => available(i) >= 0.5);
    const mine = S.subs.filter(s => s.cust === acc.id);
    const draw = () => {
      const share = sel.length ? r2(size / sel.length) : 0, price = sel.length ? r2(sel.reduce((a, i) => a + share * priceOf(i, 1), 0)) : 0;
      const valid = sel.length >= BOX.minCrops && sel.length <= BOX.maxCrops && sel.every(i => available(i) >= share) && share <= L.max;
      pane.innerHTML = `<div class="grid g2"><div class="card"><h3>1. Pick a box size</h3><div class="sizes">${BOX.sizes.map(([n, k]) => `<div class="size ${k === size ? 'on' : ''}" data-size="${k}"><div class="bx">\u{1F4E6}</div><b>${n}</b><div class="note">${k} kg</div></div>`).join('')}</div>
        <h3 style="margin-top:16px">2. Choose ${BOX.minCrops} to ${BOX.maxCrops} crops <span class="note">(${sel.length} selected)</span></h3>
        <div class="pick">${CROPS.map((c, i) => { const a = available(i), off = a < Math.max(0.5, share || 0.5) && !sel.includes(i); return `<div class="pk ${sel.includes(i) ? 'on' : ''} ${off ? 'off' : ''}" data-pk="${i}">${img(i, 'pkimg')}<div><b>${c}</b><div class="note">${money(priceOf(i, 1))}/kg · ${a < 0.5 ? 'out of stock' : kg(a) + ' left'}</div></div></div>`; }).join('')}</div>
        <label class="f" style="margin-top:12px">3. Delivery frequency <select id="bfreq"><option>Weekly</option><option>Every 2 weeks</option></select></label></div>
        <div class="card"><h3>\u{1F4E6} Your box</h3><div class="preview">${sel.map(i => `<div class="row"><span>${img(i, 'mini')} ${CROPS[i]}</span><span>${share} kg · ${money(share * priceOf(i, 1))}</span></div>`).join('') || '<p class="note">Pick crops.</p>'}
          <div class="row"><span>Price per box</span><span class="big">${money(price)}</span></div></div>
          <div style="margin-top:10px">${valid ? '<div class="alert g">✔ All crops in this box are in stock.</div>' : `<div class="alert w">⚠ ${sel.length < BOX.minCrops ? 'Choose at least ' + BOX.minCrops + ' crops' : sel.length > BOX.maxCrops ? 'Choose at most ' + BOX.maxCrops + ' crops' : 'Not enough stock for one of the crops at this size'}</div>`}</div>
          <p class="note">Box limits: ${BOX.sizes[0][1]} to ${BOX.sizes[2][1]} kg per box, ${BOX.minCrops} to ${BOX.maxCrops} crops, and only crops with enough stock for their share.</p>
          <button class="btn blue" id="subBtn" ${valid ? '' : 'disabled'}>Subscribe and reserve first box</button></div></div>
        <div class="card tw"><h3>My subscriptions</h3>${mine.length ? `<table><tr><th>ID</th><th>Box</th><th>Crops</th><th class="n">Price</th><th>Status</th><th></th></tr>${mine.map(s => `<tr><td>${s.id}</td><td>${s.size}, ${s.freq}</td><td>${s.crops.map(c => EMOJI[c] + ' ' + CROPS[c]).join(', ')}</td><td class="n">${money(s.price)}</td><td><span class="pill ${s.status === 'Active' ? 'g' : ''}">${s.status}</span></td><td>${s.status === 'Active' ? `<button class="btn sm ghost" data-cancel="${s.id}">Cancel</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="note">No subscriptions yet.</p>'}</div>`;
      $$('[data-size]').forEach(b => b.onclick = () => { size = +b.dataset.size; draw(); });
      $$('[data-pk]').forEach(b => b.onclick = () => { const i = +b.dataset.pk; if (b.classList.contains('off')) return; sel = sel.includes(i) ? sel.filter(x => x !== i) : sel.length < BOX.maxCrops ? sel.concat(i) : sel; draw(); });
      $$('[data-cancel]').forEach(b => b.onclick = () => { api.cancelSub(b.dataset.cancel); render(); });
      const sb = $('#subBtn'); if (sb) sb.onclick = () => { try { const n = BOX.sizes.find(x => x[1] === size)[0];
        const o = api.placeOrder({ cust: acc.id, custName: acc.name, ch: 1, deliver: addDays(today(), 2), items: sel.map(i => ({ crop: i, kg: share, price: priceOf(i, 1) })) });
        const s = api.subscribe({ cust: acc.id, custName: acc.name, size: n, kg: size, freq: $('#bfreq').value, crops: sel.slice(), price });
        o.fromSub = s.id; save(); toast(`Subscription ${s.id} started. First box (${o.id}) reserved from stock.`); location.hash = '#/customer/orders'; } catch (e) { toast(e.message); } };
    };
    draw();
  } else {
    const mine = S.orders.filter(o => o.cust === acc.id);
    pane.innerHTML = mine.length ? mine.map(o => `<div class="orderc"><div><div class="flex"><b>${o.id}</b>${o.fromSub ? '<span class="pill c">subscription box</span>' : ''}<span class="note">placed ${o.date} · delivery ${o.deliver}</span></div>
      <div class="items">${o.items.map(i => `<span class="it">${img(i.crop, 'mini')} ${CROPS[i.crop]} ${i.kg} kg</span>`).join('')}</div><div style="margin-top:8px">${timeline(o.status)}</div></div><div class="total" style="font-size:18px">${money(orderTotal(o))}</div></div>`).join('')
      + '<p class="note">Staff update the status in the Staff Portal: Placed, then Packed, then Delivered.</p>' : '<div class="card"><p class="note">No orders yet.</p></div>';
  }
};

/* ---------- MANAGEMENT DASHBOARD ---------- */
let mf = { crop: -1, ch: -1, period: 'all' };
views.manager = function (tab) {
  tab = tab || 'dash';
  const months = [...new Set(allRecords().map(r => r.date.slice(0, 7)))].sort();
  $('#app').innerHTML = `<div class="banner"><div><h1>Management Dashboard</h1><p class="lead">Profitability and operations, calculated from every record in the central farm database (Dataset 1 history plus every sale made in the app).</p></div>${scene('dashboard', 'bimg')}</div>
    <div class="tabs"><button class="${tab === 'dash' ? 'on' : ''}" data-tab="dash">\u{1F4CA} Dashboard</button><button class="${tab === 'pricing' ? 'on' : ''}" data-tab="pricing">\u{1F4B2} Pricing tool</button></div><div id="pane"></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { location.hash = '#/manager/' + b.dataset.tab; });
  const pane = $('#pane');
  if (tab === 'pricing') return pricingView(pane);
  pane.innerHTML = `<div class="card flex" style="padding:12px 16px">
      <label class="note">Crop <select id="mcrop"><option value="-1">All crops</option>${CROPS.map((c, i) => `<option value="${i}" ${mf.crop === i ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="note">Sales channel <select id="mch"><option value="-1">All channels</option>${CH.map((c, i) => `<option value="${i}" ${mf.ch === i ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="note">Period <select id="mper"><option value="all">All data</option><option value="app" ${mf.period === 'app' ? 'selected' : ''}>Only sales made in this app</option>${months.map(m => `<option value="${m}" ${mf.period === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <button class="btn sm ghost" id="mreset">Reset filters</button><button class="btn sm right" id="exportCsv">Export records (CSV)</button></div><div id="dash"></div>`;
  $('#mcrop').onchange = e => { mf.crop = +e.target.value; render(); }; $('#mch').onchange = e => { mf.ch = +e.target.value; render(); }; $('#mper').onchange = e => { mf.period = e.target.value; render(); };
  $('#mreset').onclick = () => { mf = { crop: -1, ch: -1, period: 'all' }; render(); }; $('#exportCsv').onclick = exportCsv;
  const recs = allRecords().filter(r => (mf.crop < 0 || r.crop === mf.crop) && (mf.ch < 0 || r.ch === mf.ch) && (mf.period === 'all' || (mf.period === 'app' ? r.src !== 'Dataset 1' : r.date.startsWith(mf.period))));
  api.getKpis(`?crop=${mf.crop < 0 ? 'all' : CID[mf.crop]}&channel=${mf.ch < 0 ? 'all' : (mf.ch ? 'CH02' : 'CH01')}&period=${mf.period}`); save();
  const D = $('#dash');
  if (!recs.length) { D.innerHTML = '<div class="card"><p>No sales match these filters yet. Fulfil an order in the Staff Portal, or reset the filters.</p></div>'; return; }
  const a = aggregate(recs), ci = CROPS.map((_, i) => i).filter(i => recs.some(r => r.crop === i)), by = ci.map(i => aggregate(recs.filter(r => r.crop === i)));
  const card = (l, v, s, tag) => `<div class="kpi ${tag ? 'big' : ''}">${tag ? `<div class="tag">${tag}</div>` : ''}<div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const openO = S.orders.filter(o => o.status !== 'Delivered');
  D.innerHTML = `<div class="sec">Overview</div><div class="kpis">${card('Total revenue', moneyK(a.rev), a.n.toLocaleString() + ' sale records')}${card('Total cost', moneyK(a.tc), 'all production and sales costs')}${card('Gross profit', moneyK(a.gp), 'revenue - total cost')}${card('Avg gross margin', pct(a.avgGm), 'average of records')}${card('Avg waste rate', pct(a.avgWr), Math.round(a.w).toLocaleString() + ' kg wasted')}${card('Sellable weight', Math.round(a.s).toLocaleString() + ' kg', Math.round(a.h).toLocaleString() + ' kg harvested')}</div>
    <div class="sec">Project KPIs</div><div class="kpis k4">${card('Profit margin', pct(a.margin), 'target ' + S.target + '%', 'KPI 1 · profit / revenue')}${card('Production cost per kg', money(a.costKg), 'total cost / sellable kg', 'KPI 2')}${card('Waste / spoilage rate', pct(a.wasteRate), 'waste kg / harvest kg', 'KPI 3')}${card('Labor productivity', a.lp.toFixed(2) + ' kg/hr', 'sellable kg / labor hours', 'KPI 4')}</div>
    <div class="sec">Crop performance</div><div class="grid g2">
      <div class="card"><h3>Gross Profit by Crop</h3><div class="vars">Crop_Name, Gross_Profit</div><div class="cbox"><canvas id="v1"></canvas></div></div>
      <div class="card"><h3>Average Waste Rate by Crop</h3><div class="vars">Crop_Name, Waste_Rate_pct</div><div class="cbox"><canvas id="v2"></canvas></div></div>
      <div class="card"><h3>Average Gross Margin by Crop</h3><div class="vars">Crop_Name, Gross_Margin_pct</div><div class="cbox"><canvas id="v3"></canvas></div></div>
      <div class="card"><h3>Production Cost per kg by Crop</h3><div class="vars">Crop_Name, Total_Cost / Sellable_Weight_kg</div><div class="cbox"><canvas id="v4"></canvas></div></div></div>
    <div class="sec">Trend and channels</div><div class="grid g2">
      <div class="card"><h3>Monthly Revenue and Gross Profit</h3><div class="vars">Month, Revenue, Gross_Profit</div><div class="cbox"><canvas id="v5"></canvas></div><p class="note" id="monNote"></p></div>
      <div class="card"><h3>Sales Channel Performance</h3><div class="vars">Sales_Channel, Revenue, Gross_Profit</div><div class="cbox"><canvas id="v6"></canvas></div></div>
      <div class="card"><h3>Labor Productivity by Crop</h3><div class="vars">Crop_Name, Sellable_Weight_kg / Labor_Hours</div><div class="cbox"><canvas id="v7"></canvas></div></div>
      <div class="card"><h3>Live Stock by Crop</h3><div class="vars">On hand, reserved for open orders, free to sell (${openO.length} open orders)</div><div class="cbox"><canvas id="v8"></canvas></div></div></div>`;
  const lbl = ci.map(i => CROPS[i]), col = ci.map(i => SOLID[i]);
  const hb = (id, data, fmt) => chart(id, { type: 'bar', data: { labels: lbl, datasets: [{ data, backgroundColor: col, borderRadius: 5 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } }, scales: { x: { beginAtZero: true, ticks: { maxTicksLimit: 6, callback: fmt } } } } });
  hb('v1', by.map(x => r2(x.gp)), v => moneyK(v)); hb('v2', by.map(x => r2(x.avgWr)), v => v + '%'); hb('v3', by.map(x => r2(x.avgGm)), v => v + '%'); hb('v4', by.map(x => r2(x.costKg)), v => '$' + v);
  const allM = [...new Set(recs.map(r => r.date.slice(0, 7)))].sort(), mons = allM.filter(m => recs.filter(r => r.date.startsWith(m)).length >= 20), short = allM.filter(m => !mons.includes(m));
  $('#monNote').textContent = short.length ? `Months with fewer than 20 records are left out of the line (${short.join(', ')}: new app sales, included in the KPIs above).` : '';
  chart('v5', { type: 'line', data: { labels: mons, datasets: [{ label: 'Revenue', data: mons.map(m => r2(aggregate(recs.filter(r => r.date.startsWith(m))).rev)), borderColor: '#8cc5a5', backgroundColor: '#8cc5a5', tension: .3 }, { label: 'Gross profit', data: mons.map(m => r2(aggregate(recs.filter(r => r.date.startsWith(m))).gp)), borderColor: '#1f7a4d', backgroundColor: '#1f7a4d', tension: .3, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: v => moneyK(v) } } } } });
  const chi = [0, 1].filter(i => recs.some(r => r.ch === i)), bc = chi.map(i => aggregate(recs.filter(r => r.ch === i)));
  chart('v6', { type: 'bar', data: { labels: chi.map(i => CH[i]), datasets: [{ label: 'Revenue', data: bc.map(x => r2(x.rev)), backgroundColor: '#8cc5a5', borderRadius: 5 }, { label: 'Gross profit', data: bc.map(x => r2(x.gp)), backgroundColor: '#1f7a4d', borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => moneyK(v) } } } } });
  chart('v7', { type: 'bar', data: { labels: lbl, datasets: [{ label: 'kg per labor hour', data: by.map(x => r2(x.lp)), backgroundColor: col, borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
  const ic = mf.crop < 0 ? CROPS.map((_, i) => i) : [mf.crop];
  chart('v8', { type: 'bar', data: { labels: ic.map(i => CROPS[i]), datasets: [{ label: 'Reserved', data: ic.map(i => r2(Math.min(reserved(i), onHand(i)))), backgroundColor: '#d99a2b', borderRadius: 3 }, { label: 'Free to sell', data: ic.map(i => available(i)), backgroundColor: '#1f7a4d', borderRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'kg on hand' } } } } });
};
function pricingView(pane) {
  const rows = []; CROPS.forEach((c, i) => CH.forEach((h, j) => { const g = aggregate(allRecords().filter(r => r.crop === i && r.ch === j)); if (g.n) rows.push({ i, j, g }); }));
  const t = S.target / 100;
  pane.innerHTML = `<div class="card tw"><div class="flex"><h3>Pricing tool</h3><label class="right note">Target margin <input type="number" id="tgt" value="${S.target}" min="0" max="90" style="width:70px">%</label></div>
    <p class="note">Break-even price = total cost / sellable kg. Recommended price = break-even / (1 - target margin). "Apply" updates the price customers see in the Customer Portal.</p>
    <table><tr><th>Crop</th><th>Channel</th><th class="n">Break-even $/kg</th><th class="n">Current price</th><th class="n">Projected margin</th><th class="n">Recommended</th><th>Action</th></tr>
    ${rows.map(x => { const cur = priceOf(x.i, x.j), be = x.g.costKg, rec = be / (1 - t), pm = (1 - be / cur) * 100, ok = pm >= S.target - 0.05;
      return `<tr><td>${img(x.i, 'mini')} ${CROPS[x.i]}</td><td>${CH[x.j]}</td><td class="n">${money(be)}</td><td class="n"><b>${money(cur)}</b></td><td class="n"><span class="pill ${ok ? 'g' : 'w'}">${pct(pm)}</span></td><td class="n">${money(rec)}</td><td>${ok ? '<span class="note">On target</span>' : `<button class="btn sm" data-apply="${x.i}-${x.j}-${rec.toFixed(2)}">Apply ${money(rec)}</button>`}</td></tr>`; }).join('')}</table></div>
    <div class="card tw"><h3>Price change log</h3>${S.priceLog.length ? `<table><tr><th>When</th><th>Crop</th><th>Channel</th><th class="n">Old</th><th class="n">New</th></tr>${S.priceLog.map(p => `<tr><td>${p.t}</td><td>${CROPS[p.crop]}</td><td>${CH[p.ch]}</td><td class="n">${money(p.old)}</td><td class="n">${money(p.price)}</td></tr>`).join('')}</table>` : '<p class="note">No price changes yet.</p>'}</div>`;
  $('#tgt').onchange = e => { const v = +e.target.value; if (isFinite(v) && v >= 0 && v < 90) { S.target = v; save(); render(); } };
  $$('[data-apply]').forEach(b => b.onclick = () => { const [i, j, p] = b.dataset.apply.split('-'); api.setPrice(+i, +j, +p); toast(`${CROPS[i]} (${CH[j]}) set to ${money(+p)}/kg. Customers see it now.`); tourAdvanceFrom('mgr-price'); render(); });
}
function exportCsv() {
  const head = ['Record_ID', 'Date', 'Crop_ID', 'Crop_Name', 'Channel_ID', 'Sales_Channel', 'Batch_ID', 'Harvest_Weight_kg', 'Sellable_Weight_kg', 'Waste_kg', 'Selling_Price_per_kg', 'Revenue', 'Electricity_kWh', 'Electricity_Cost', 'Labor_Hours', 'Labor_Cost', 'Seed_Cost', 'Nutrient_Cost', 'Packaging_Cost', 'Distribution_Cost', 'Total_Cost', 'Gross_Profit', 'Source'];
  const lines = [head.join(',')].concat(allRecords().map(r => [r.id, r.date, CID[r.crop], CROPS[r.crop], r.ch ? 'CH02' : 'CH01', CH[r.ch], r.batch, r.h, r.s, r.w, r.price, r.rev, r.kwh, r.elec, r.hrs, r.lab, r.seed, r.nut, r.pack, r.dist, r.tc, r.gp, r.src].join(',')));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'farm_profit_hub_records.csv'; document.body.appendChild(a); a.click(); a.remove(); logCall('GET', '/api/records/export.csv'); save(); toast('CSV downloaded.');
}

/* ---------- DATA FLOW ---------- */
views.data = function () {
  const recs = allRecords();
  const node = (ic, t, s, pill, cls = '') => `<div class="node ${cls}">${ic}<b>${t}</b><span class="note">${s}</span><div style="margin-top:6px">${pill}</div></div>`;
  $('#app').innerHTML = `<h1>How data flows</h1><p class="lead">The prototype follows our Enterprise Architecture: three interfaces read and write one central farm database through a REST API. Browser storage stands in for Neon PostgreSQL here; the log shows each API call as you use the app.</p>
  <div class="card"><div class="flow5" style="margin:0">
    ${node(scene('harvest', 'nimg'), '1. Staff record harvest', 'POST /api/harvests', `<span class="pill w">${S.harvests.length} harvests</span>`)}
    ${node(scene('stock', 'nimg'), '2. Inventory', 'PATCH /api/inventory', `<span class="pill g">${kg(CROPS.reduce((a, _, i) => a + onHand(i), 0))} on hand</span>`, 'db')}
    ${node(scene('box', 'nimg'), '3. Customer orders', 'POST /api/orders (stock check)', `<span class="pill c">${S.orders.length} orders</span>`)}
    ${node(scene('van', 'nimg'), '4. Staff fulfil', 'stock deducted, POST /api/records', `<span class="pill g">${S.records.length} app sales</span>`)}
    ${node(scene('dashboard', 'nimg'), '5. Dashboard', 'GET /api/kpis', `<span class="pill g">${recs.length.toLocaleString()} records</span>`)}</div></div>
  <div class="grid g2"><div class="card"><h3>Live API log</h3><div class="log">${S.log.length ? S.log.map(l => `<div>[${l.t}] <span class="m">${l.method}</span> ${esc(l.path)} ${l.body ? '<span style="opacity:.7">' + esc(l.body) + '</span>' : ''}</div>`).join('') : '<div>No calls yet. Use any portal and come back.</div>'}</div></div>
  <div class="card tw"><h3>Database tables</h3><table><tr><th>Table</th><th>Key fields</th><th class="n">Rows</th></tr>
    <tr><td>FACT_PRODUCTION_SALES</td><td>Record_ID (PK), Crop_ID (FK), Channel_ID (FK), Date (FK), Batch_ID, weights, costs, revenue, profit</td><td class="n">${recs.length.toLocaleString()}</td></tr>
    <tr><td>HARVEST_BATCHES</td><td>Harvest_ID (PK), Batch_ID, Crop_ID (FK), harvest kg, waste kg, kWh, labor hours, costs</td><td class="n">${S.harvests.length}</td></tr>
    <tr><td>INVENTORY</td><td>Crop_ID (PK, FK), on-hand kg, reserved kg, available kg</td><td class="n">6</td></tr>
    <tr><td>ORDERS / ORDER_ITEMS</td><td>Order_ID (PK), Customer, Channel_ID (FK), Status, Crop_ID, kg</td><td class="n">${S.orders.length}</td></tr>
    <tr><td>SUBSCRIPTIONS</td><td>Sub_ID (PK), Customer, box size, frequency, crops</td><td class="n">${S.subs.length}</td></tr>
    <tr><td>DIM_CROP / DIM_CHANNEL / PRICE_LIST</td><td>Crop and channel details, price per kg and purchase limits</td><td class="n">6 / 2 / 12</td></tr></table>
    <p class="note">Full-build stack from the architecture: Next.js and React, Node.js REST API, Neon PostgreSQL, JWT role-based access, SSL/TLS, deployed on Vercel from GitHub.</p></div></div>`;
};

/* ---------- TUTORIAL + TOUR ---------- */
const TOUR = [
  { id: 'start', route: '#/login', text: 'This is the home page. The 5 boxes show the flow. Click Next to start as a staff member.' },
  { id: 'staff-harvest', route: '#/staff/record', role: ['staff', 'staff'], text: 'Staff record a harvest. Pick a crop (for example Microgreens), watch the live check, then click "Add to stock". The stock tile goes up.' },
  { id: 'customer-order', route: '#/customer/shop', role: ['customer', 'rest'], text: 'Green Fork Bistro sees only what is in stock. Use + to add crops (min 2 kg, max 25 kg), then click "Place order".' },
  { id: 'staff-fulfil', route: '#/staff/orders', role: ['staff', 'staff'], text: 'Staff see the order. Click "Fulfil & record sale" on it: stock goes down and a sale record is created.' },
  { id: 'staff-stock', route: '#/staff/record', role: ['staff', 'staff'], text: 'The stock tiles show the lower on-hand kg, and the sale is listed under Recent sales.' },
  { id: 'mgr-dash', route: '#/manager/dash', role: ['manager', 'mgr'], text: 'The Management Dashboard now includes the new sale in all KPIs and charts. Try "Only sales made in this app" in the Period filter.' },
  { id: 'mgr-price', route: '#/manager/pricing', role: ['manager', 'mgr'], text: 'Pricing tool: click "Apply" on a crop below the target margin.' },
  { id: 'data', route: '#/data', text: 'Every step was an API call into the central database. Tour done!' }
];
function startTour() { S.tour = 0; save(); goTour(); }
function goTour() { const st = TOUR[S.tour]; if (st.role) login(st.role[0], st.role[1]); if (location.hash === st.route) render(); else location.hash = st.route; }
function tourAdvanceFrom(id) { if (S.tour == null) return; if (TOUR[S.tour] && TOUR[S.tour].id === id && S.tour < TOUR.length - 1) { S.tour++; save(); setTimeout(goTour, 900); } }
function renderTour() {
  const bar = $('#tourbar'); if (S.tour == null || !TOUR[S.tour]) { bar.classList.add('hidden'); return; }
  bar.innerHTML = `<b>Guided tour ${S.tour + 1}/${TOUR.length}</b><span>${TOUR[S.tour].text}</span>${S.tour > 0 ? '<button class="btn sm ghost" id="tPrev">Back</button>' : ''}${S.tour < TOUR.length - 1 ? '<button class="btn sm" id="tNext">Next</button>' : ''}<button class="btn sm ghost" id="tEnd">${S.tour < TOUR.length - 1 ? 'Exit tour' : 'Finish'}</button>`;
  bar.classList.remove('hidden');
  if ($('#tNext')) $('#tNext').onclick = () => { S.tour++; save(); goTour(); };
  if ($('#tPrev')) $('#tPrev').onclick = () => { S.tour--; save(); goTour(); };
  $('#tEnd').onclick = () => { S.tour = null; save(); renderTour(); };
}
views.tutorial = function () {
  $('#app').innerHTML = `<h1>Tutorial: how Farm Profit Hub works</h1><p class="lead">The farm could not see which crops and channels make money, because harvests, stock and sales were never connected. This app connects them in one flow.</p>
  <div class="flex" style="margin-bottom:16px"><button class="btn" id="tStart">▶ Start guided tour</button><a class="btn ghost" href="#/login">Go to sign-in</a></div>
  <ol class="steps">
    <li><b>Sign in without a password.</b> Choose Staff, Customer or Management.</li>
    <li><b>Staff record a harvest.</b> Harvest kg, waste, electricity, labor hours, seed and nutrients. The app works out sellable kg, production cost per kg (KPI 2), waste rate (KPI 3) and labor productivity (KPI 4), and adds the sellable kg to stock. <a href="#/staff/record">Open</a></li>
    <li><b>Customers order from stock.</b> Each crop card shows how much is available. Restaurants order 2 to 25 kg per crop, households 0.5 to 3 kg, and never more than is available. Ordered kg are reserved. <a href="#/customer/shop">Open</a></li>
    <li><b>Households build a subscription box.</b> Pick a size (2, 3.5 or 5 kg) and 2 to 4 crops. Crops without enough stock cannot be picked. <a href="#/customer/box">Open</a></li>
    <li><b>Harvest planner.</b> Shows demand against stock on hand and how much to harvest next, so the farm stops over-harvesting. <a href="#/staff/plan">Open</a></li>
    <li><b>Staff fulfil orders.</b> "Fulfil & record sale" removes the kg from stock, marks the order delivered and creates a sale record with revenue and full cost. <a href="#/staff/orders">Open</a></li>
    <li><b>Management dashboard updates.</b> Revenue, cost, profit, margin, waste, the 4 KPIs, charts by crop, channel and month, and live stock. <a href="#/manager/dash">Open</a></li>
    <li><b>Pricing tool.</b> Break-even and recommended prices for the target margin. "Apply" changes what customers see. <a href="#/manager/pricing">Open</a></li>
  </ol>
  <div class="card" style="margin-top:16px"><h3>Problem, feature and KPI</h3><table><tr><th>Problem</th><th>Feature</th><th>KPI</th></tr>
    <tr><td>Prices set by guesswork</td><td>Pricing tool</td><td>KPI 1 Profit margin by crop and channel</td></tr>
    <tr><td>Costs not known per crop</td><td>Harvest form with cost rules</td><td>KPI 2 Production cost per kg</td></tr>
    <tr><td>Over-harvesting and spoilage</td><td>Stock, order-based planning, waste check</td><td>KPI 3 Waste / spoilage rate</td></tr>
    <tr><td>Staff time not tracked</td><td>Labor hours per harvest</td><td>KPI 4 Labor productivity</td></tr></table></div>`;
  $('#tStart').onclick = startTour;
};

window.addEventListener('hashchange', render);
render();
})();
