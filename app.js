/* Farm Profit Hub - Team 9 prototype
   Simulates the architecture: Customer Portal, Staff Portal, Management Dashboard
   -> REST-style API layer -> central farm database (browser storage stands in for Neon PostgreSQL). */
(function () {
'use strict';
const CROPS = ['Lettuce', 'Basil', 'Kale', 'Arugula', 'Spinach', 'Microgreens'];
const CAT = ['Leafy Green', 'Herb', 'Leafy Green', 'Leafy Green', 'Leafy Green', 'Specialty Green'];
const CID = ['C001', 'C002', 'C003', 'C004', 'C005', 'C006'];
const EMOJI = ['\u{1F96C}', '\u{1F33F}', '\u{1F96C}', '\u{1F331}', '\u{1F343}', '\u{1F331}'];
const CH = ['Restaurant', 'Subscription Box'];
const RATE_KWH = 0.14, RATE_LABOR = 18.5, OTHER_PER_KG = 1.38, WASTE_ALERT = 6, KEY = 'farmProfitHub_v1';
// Typical inputs per harvested kg (from Dataset 1) - used to pre-fill the staff form
const PER_KG = { kwh: [6.81, 8.38, 7.36, 6.48, 6.9, 10.18], hrs: [0.061, 0.092, 0.071, 0.074, 0.071, 0.126],
  seed: [0.26, 0.424, 0.326, 0.35, 0.365, 1.279], nut: [0.402, 0.527, 0.434, 0.414, 0.455, 0.322] };
const PACK_PER_KG = [0.48, 0.92], DIST_PER_KG = [0.63, 1.17];
const ACCOUNTS = {
  customer: [{ id: 'rest', name: 'Green Fork Bistro', type: 'Restaurant account', ch: 0 },
             { id: 'home', name: 'The Patel Family', type: 'Household subscriber', ch: 1 }],
  staff: [{ id: 'staff', name: 'Alex Rivera', type: 'Production staff' }],
  manager: [{ id: 'mgr', name: 'Farm Owner', type: 'Management' }]
};

/* ---------------- helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const r2 = v => Math.round(v * 100) / 100;
const money = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyK = v => Math.abs(v) >= 1000 ? (v < 0 ? '-' : '') + '$' + (Math.abs(v) / 1000).toFixed(1) + 'K' : money(v);
const pct = v => (isFinite(v) ? v.toFixed(1) : '0.0') + '%';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function toast(msg) { const t = $('#toast'); t.innerHTML = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3800); }

/* ---------------- central farm database ---------------- */
const historical = (window.SEED_RECORDS || []).map(a => ({
  id: a[0], date: a[1], crop: a[2], ch: a[3], batch: a[4], h: a[5], s: a[6], w: a[7], price: a[8], rev: a[9],
  kwh: a[10], elec: a[11], hrs: a[12], lab: a[13], seed: a[14], nut: a[15], pack: a[16], dist: a[17], tc: a[18], gp: a[19], src: 'Dataset 1'
}));
function freshState() {
  const d0 = today();
  return {
    records: [], prices: Object.assign({}, window.SEED_PRICES || {}), priceLog: [],
    orders: [
      { id: 'ORD-1001', date: addDays(d0, -1), cust: 'rest', custName: 'Green Fork Bistro', ch: 0, deliver: addDays(d0, 2), status: 'Placed', items: [{ crop: 0, kg: 18, price: 7.07 }, { crop: 1, kg: 6, price: 12.65 }] },
      { id: 'ORD-1002', date: addDays(d0, -1), cust: 'home', custName: 'The Patel Family', ch: 1, deliver: addDays(d0, 1), status: 'Packed', items: [{ crop: 5, kg: 1, price: 22.19 }, { crop: 4, kg: 1.5, price: 10.25 }, { crop: 3, kg: 1, price: 11.07 }] },
      { id: 'ORD-1003', date: d0, cust: 'other', custName: 'Mila Cafe', ch: 0, deliver: addDays(d0, 3), status: 'Placed', items: [{ crop: 2, kg: 10, price: 8.09 }] }
    ],
    subs: [{ id: 'SUB-201', cust: 'home', custName: 'The Patel Family', size: 'Medium', kg: 3.5, freq: 'Weekly', crops: [5, 4, 3], price: 50.28, start: addDays(d0, -30), status: 'Active' }],
    log: [], seq: { order: 1004, sub: 202, rec: 1201, batch: 401 }, session: null, target: 35
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || freshState(); } catch (e) { S = freshState(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: keep in memory */ } }
const allRecords = () => historical.concat(S.records);

/* Business rules (the same formulas used to build Dataset 1) */
function calcRecord(i) {
  const s = r2(i.h - i.w), elec = r2(i.kwh * RATE_KWH), lab = r2(i.hrs * RATE_LABOR);
  const other = r2(i.h * OTHER_PER_KG); // water and facility allocated per harvested kg (Dataset 1 average)
  const tc = r2(elec + lab + i.seed + i.nut + i.pack + i.dist + other), rev = r2(s * i.price), gp = r2(rev - tc);
  return { s, elec, lab, other, tc, rev, gp, gm: rev ? gp / rev * 100 : 0, wr: i.h ? i.w / i.h * 100 : 0, costKg: s ? tc / s : 0, breakeven: s ? tc / s : 0 };
}

/* REST-style API layer: every portal goes through these calls, which are logged on the Data Flow page */
function logCall(method, path, body) { S.log.unshift({ t: nowTime(), method, path, body: body ? JSON.stringify(body).slice(0, 160) : '' }); S.log = S.log.slice(0, 60); }
const api = {
  placeOrder(o) { o.id = 'ORD-' + (S.seq.order++); o.status = 'Placed'; o.date = today(); S.orders.unshift(o); logCall('POST', '/api/orders', { id: o.id, customer: o.custName, items: o.items.length, total: r2(orderTotal(o)) }); save(); return o; },
  updateOrder(id, status) { const o = S.orders.find(x => x.id === id); if (o) { o.status = status; logCall('PATCH', '/api/orders/' + id, { status }); save(); } return o; },
  subscribe(sb) { sb.id = 'SUB-' + (S.seq.sub++); sb.status = 'Active'; sb.start = today(); S.subs.unshift(sb); logCall('POST', '/api/subscriptions', { id: sb.id, size: sb.size, freq: sb.freq, price: sb.price }); save(); return sb; },
  cancelSub(id) { const sb = S.subs.find(x => x.id === id); if (sb) { sb.status = 'Cancelled'; logCall('PATCH', '/api/subscriptions/' + id, { status: 'Cancelled' }); save(); } },
  addRecord(inp) {
    const c = calcRecord(inp);
    const rec = Object.assign({}, inp, { id: 'VF' + String(S.seq.rec++).padStart(4, '0'), batch: inp.batch || ('B' + String(S.seq.batch++).padStart(4, '0')),
      s: c.s, elec: c.elec, lab: c.lab, tc: c.tc, rev: c.rev, gp: c.gp, src: 'Staff Portal' });
    S.records.push(rec); logCall('POST', '/api/records', { id: rec.id, crop: CROPS[rec.crop], channel: CH[rec.ch], revenue: rec.rev, total_cost: rec.tc, gross_profit: rec.gp }); save(); return rec;
  },
  deleteRecord(id) { S.records = S.records.filter(r => r.id !== id); logCall('DELETE', '/api/records/' + id); save(); },
  setPrice(crop, ch, price, reason) {
    const k = crop + '-' + ch, old = S.prices[k]; S.prices[k] = r2(price);
    S.priceLog.unshift({ t: today() + ' ' + nowTime(), crop, ch, old, price: r2(price), reason });
    logCall('PUT', '/api/prices/' + CID[crop] + '/' + (ch ? 'CH02' : 'CH01'), { old, new: r2(price) }); save();
  },
  getKpis(q) { logCall('GET', '/api/kpis' + q); }
};
const orderTotal = o => o.items.reduce((a, it) => a + it.kg * it.price, 0);
const priceOf = (crop, ch) => S.prices[crop + '-' + ch];

/* Aggregation used by management views */
function aggregate(recs) {
  const a = { n: recs.length, h: 0, s: 0, w: 0, rev: 0, tc: 0, gp: 0, elec: 0, lab: 0, seed: 0, nut: 0, pack: 0, dist: 0 };
  recs.forEach(r => { a.h += r.h; a.s += r.s; a.w += r.w; a.rev += r.rev; a.tc += r.tc; a.gp += r.gp; a.elec += r.elec; a.lab += r.lab; a.seed += r.seed; a.nut += r.nut; a.pack += r.pack; a.dist += r.dist; });
  a.other = a.tc - (a.elec + a.lab + a.seed + a.nut + a.pack + a.dist);
  a.gm = a.rev ? a.gp / a.rev * 100 : 0; a.wr = a.h ? a.w / a.h * 100 : 0; a.costKg = a.s ? a.tc / a.s : 0;
  return a;
}

/* ---------------- session / routing ---------------- */
function login(role, accId) {
  const pref = S.session && S.session.pref;
  const acc = ACCOUNTS[role].find(a => a.id === accId) || ACCOUNTS[role][0];
  S.session = { role, acc: acc.id, pref: role === 'customer' ? acc.id : pref }; logCall('POST', '/api/session', { role, user: acc.name, password: 'not required (prototype)' }); save();
}
function account() { if (!S.session) return null; return ACCOUNTS[S.session.role].find(a => a.id === S.session.acc); }
function ensureRole(role) { if (!S.session || S.session.role !== role) login(role, role === 'customer' && S.session && S.session.pref ? S.session.pref : undefined); }

const charts = {};
function chart(id, cfg) { if (charts[id]) charts[id].destroy(); const el = document.getElementById(id); if (el && window.Chart) charts[id] = new Chart(el, cfg); }
function killCharts() { Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; }); }
if (window.Chart) { Chart.defaults.font.family = '"Segoe UI",system-ui,Roboto,Arial,sans-serif'; Chart.defaults.color = '#5f716c'; Chart.defaults.plugins.legend.labels.boxWidth = 12; }

function parseRoute() { const h = location.hash.replace(/^#\/?/, '') || 'login'; const [page, tab] = h.split('/'); return { page, tab }; }
const views = {};
function render() {
  killCharts();
  const { page, tab } = parseRoute();
  const v = views[page] || views.login;
  if (page === 'customer' || page === 'staff' || page === 'manager') ensureRole(page);
  renderNav(page, tab);
  $('#app').innerHTML = '';
  v(tab);
  renderTour();
  window.scrollTo(0, 0);
}
function renderNav(page) {
  const acc = account();
  const portal = { customer: 'Customer Portal', staff: 'Staff Portal', manager: 'Management Dashboard' };
  let h = '';
  if (S.session && portal[page]) h += `<span class="rolechip">${portal[page]} · ${esc(acc.name)}</span>`;
  h += `<a href="#/login" class="${page === 'login' ? 'active' : ''}">Switch role</a>`;
  h += `<a href="#/data" class="${page === 'data' ? 'active' : ''}">Data flow</a>`;
  h += `<a href="#/tutorial" class="${page === 'tutorial' ? 'active' : ''}">Tutorial</a>`;
  h += `<button id="resetBtn" title="Restore the original demo data">Reset demo</button>`;
  $('#topnav').innerHTML = h;
  $('#resetBtn').onclick = () => { if (confirmReset()) { const tour = S.tour; S = freshState(); S.tour = tour; save(); toast('Demo data restored to the starting state.'); render(); } };
}
function confirmReset() { return window.confirm ? window.confirm('Reset all orders, new records and prices to the starting demo data?') : true; }

/* ---------------- LOGIN / LANDING ---------------- */
views.login = function () {
  const recs = allRecords(), a = aggregate(recs);
  $('#app').innerHTML = `
  <section class="hero">
    <div class="pill" style="background:rgba(255,255,255,.18);color:#fff">Team 9 · App prototype (MVP draft)</div>
    <h1 style="margin-top:10px">Farm Profit Hub</h1>
    <p>One system for the urban vertical farm. Customers order, staff record harvests and costs, and management sees the true profit of every crop and sales channel. All three use the same central farm database.</p>
    <div class="flex" style="margin-top:16px">
      <a class="btn ghost" href="#/tutorial">Watch how it works (tutorial)</a>
      <button class="btn" id="startTour" style="background:#fff;color:#0f4f31">Start guided tour</button>
    </div>
  </section>
  <h2>Choose how you sign in</h2>
  <p class="lead">No password needed. Each role opens its own interface. The live numbers below come from the central database: ${recs.length.toLocaleString()} production and sales records, ${S.orders.length} customer orders, gross margin ${pct(a.gm)}.</p>
  <div class="roles">
    <div class="role c"><div class="ic">\u{1F6D2}</div><h3>Customer Portal</h3>
      <ul><li>Browse crops at current prices</li><li>Place restaurant orders</li><li>Build a household subscription box</li><li>Track order status</li></ul>
      <div class="acc">${ACCOUNTS.customer.map(c => `<button class="btn blue" data-login="customer" data-acc="${c.id}">Continue as ${esc(c.name)} <small style="font-weight:400">(${c.type})</small></button>`).join('')}</div></div>
    <div class="role s"><div class="ic">\u{1F9D1}‍\u{1F33E}</div><h3>Staff Portal</h3>
      <ul><li>See orders to pack and deliver</li><li>Record harvest, waste, energy, labor and costs</li><li>Live profit check and waste alerts</li><li>Harvest planner based on orders</li></ul>
      <div class="acc"><button class="btn warn" data-login="staff" data-acc="staff">Continue as Alex Rivera (Production staff)</button></div></div>
    <div class="role"><div class="ic">\u{1F4CA}</div><h3>Management Dashboard</h3>
      <ul><li>Profit, cost and waste KPIs</li><li>Margin by crop and channel, with alerts</li><li>Cost per kg breakdown</li><li>Pricing tool: break-even and recommended prices</li></ul>
      <div class="acc"><button class="btn" data-login="manager" data-acc="mgr">Continue as Farm Owner (Management)</button></div></div>
  </div>
  <p class="note" style="margin-top:16px">Prototype note: login is simulated so the professor can open every interface without credentials. In the final build, roles would be checked with JWT authorization, as shown in the Enterprise Architecture.</p>`;
  document.querySelectorAll('[data-login]').forEach(b => b.onclick = () => {
    login(b.dataset.login, b.dataset.acc); if (b.dataset.login === 'customer') { S.session.pref = b.dataset.acc; save(); }
    location.hash = '#/' + b.dataset.login;
  });
  $('#startTour').onclick = startTour;
};

/* ---------------- CUSTOMER PORTAL ---------------- */
views.customer = function (tab) {
  const acc = account(), ch = acc.ch, isHome = ch === 1;
  tab = tab || 'shop';
  const tabs = [['shop', 'Shop and order'], isHome ? ['box', 'Subscription box'] : null, ['orders', 'My orders']].filter(Boolean);
  $('#app').innerHTML = `
    <div class="flex"><div><h1>Welcome, ${esc(acc.name)}</h1><p class="lead">${acc.type} · prices shown are your ${CH[ch].toLowerCase()} prices, set by farm management.</p></div>
    <div class="right flex"><span class="note">Switch account:</span>${ACCOUNTS.customer.map(c => `<button class="btn sm ${c.id === acc.id ? '' : 'ghost'}" data-acc="${c.id}">${esc(c.name)}</button>`).join('')}</div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="pane"></div>`;
  document.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { login('customer', b.dataset.acc); S.session.pref = b.dataset.acc; save(); location.hash = '#/customer/shop'; render(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { location.hash = '#/customer/' + b.dataset.tab; });
  const pane = $('#pane');
  if (tab === 'shop') {
    const recent = S.priceLog.filter(p => p.ch === ch).slice(0, 1)[0];
    pane.innerHTML = `
      ${recent ? `<div class="alert g">Price update: ${CROPS[recent.crop]} is now ${money(recent.price)} per kg (was ${money(recent.old)}).</div>` : ''}
      <div class="prod">${CROPS.map((c, i) => `
        <div class="pc"><div class="flex"><span class="em">${EMOJI[i]}</span><div><b>${c}</b><div class="note">${CAT[i]}</div></div></div>
        <div class="flex" style="margin-top:8px"><span class="pr">${money(priceOf(i, ch))}</span><span class="note">per kg</span>
        <label class="right note">kg <input type="number" min="0" step="0.5" value="0" data-q="${i}"></label></div></div>`).join('')}</div>
      <div class="card" style="margin-top:16px"><div class="flex">
        <label class="f">Delivery date <input type="date" id="deliv" value="${addDays(today(), isHome ? 2 : 3)}"></label>
        <div class="right" style="text-align:right"><div class="note">Order total</div><div class="pr" id="otot" style="font-size:22px;font-weight:700">$0.00</div></div>
        <button class="btn blue" id="placeBtn" disabled>Place order</button></div>
        <p class="note">Your order goes straight to the farm's Staff Portal and is used to plan the next harvest, so less produce is wasted.</p></div>`;
    const qs = () => [...pane.querySelectorAll('[data-q]')].map(x => ({ crop: +x.dataset.q, kg: Math.max(0, +x.value || 0) })).filter(x => x.kg > 0);
    const upd = () => { const it = qs(); const t = it.reduce((a, x) => a + x.kg * priceOf(x.crop, ch), 0); $('#otot').textContent = money(t); $('#placeBtn').disabled = !it.length; };
    pane.querySelectorAll('[data-q]').forEach(x => x.oninput = upd);
    $('#placeBtn').onclick = () => {
      const items = qs().map(x => ({ crop: x.crop, kg: x.kg, price: priceOf(x.crop, ch) }));
      const o = api.placeOrder({ cust: acc.id, custName: acc.name, ch, deliver: $('#deliv').value || addDays(today(), 3), items });
      toast(`Order ${o.id} placed (${money(orderTotal(o))}). Staff can see it now.`); tourAdvanceFrom('customer-order');
      location.hash = '#/customer/orders';
    };
  } else if (tab === 'box') {
    const sizes = [['Small', 2], ['Medium', 3.5], ['Large', 5]];
    const mine = S.subs.filter(s => s.cust === acc.id);
    pane.innerHTML = `<div class="grid g2"><div class="card"><h3>Build your box</h3>
      <label class="f">Box size <select id="bsize">${sizes.map(([n, k]) => `<option value="${k}" ${n === 'Medium' ? 'selected' : ''}>${n} (${k} kg)</option>`).join('')}</select></label>
      <label class="f">Delivery frequency <select id="bfreq"><option>Weekly</option><option>Every 2 weeks</option></select></label>
      <div class="note" style="margin-bottom:6px">Choose 2 or more crops</div>
      <div class="flex">${CROPS.map((c, i) => `<label class="pill" style="cursor:pointer"><input type="checkbox" data-bc="${i}" ${[5, 4, 1].includes(i) ? 'checked' : ''}> ${c} ${money(priceOf(i, 1))}/kg</label>`).join('')}</div>
      <div class="preview" style="margin-top:14px"><div class="row"><span>Price per box</span><span class="big" id="bprice"></span></div><div class="row"><span>Split</span><span id="bsplit" class="note"></span></div></div>
      <button class="btn blue" id="subBtn" style="margin-top:12px">Subscribe</button></div>
      <div class="card"><h3>My subscriptions</h3>${mine.length ? `<table><tr><th>ID</th><th>Box</th><th>Crops</th><th class="n">Price</th><th>Status</th><th></th></tr>${mine.map(s => `<tr><td>${s.id}</td><td>${s.size}, ${s.freq}</td><td>${s.crops.map(c => CROPS[c]).join(', ')}</td><td class="n">${money(s.price)}</td><td><span class="pill ${s.status === 'Active' ? 'g' : ''}">${s.status}</span></td><td>${s.status === 'Active' ? `<button class="btn sm ghost" data-cancel="${s.id}">Cancel</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="note">No subscriptions yet.</p>'}</div></div>`;
    const sel = () => [...pane.querySelectorAll('[data-bc]:checked')].map(x => +x.dataset.bc);
    const upd = () => { const c = sel(), kg = +$('#bsize').value; const p = c.length ? kg * c.reduce((a, i) => a + priceOf(i, 1), 0) / c.length : 0; $('#bprice').textContent = money(p); $('#bsplit').textContent = c.length ? c.map(i => CROPS[i] + ' ' + r2(kg / c.length) + ' kg').join(' · ') : 'Pick crops'; $('#subBtn').disabled = c.length < 2; return p; };
    pane.querySelectorAll('input,select').forEach(x => x.onchange = upd); upd();
    $('#subBtn').onclick = () => {
      const c = sel(), kg = +$('#bsize').value, p = upd(), size = sizes.find(s => s[1] === kg)[0];
      const sb = api.subscribe({ cust: acc.id, custName: acc.name, size, kg, freq: $('#bfreq').value, crops: c, price: r2(p) });
      api.placeOrder({ cust: acc.id, custName: acc.name, ch: 1, deliver: addDays(today(), 2), items: c.map(i => ({ crop: i, kg: r2(kg / c.length), price: priceOf(i, 1) })), fromSub: sb.id });
      toast(`Subscription ${sb.id} started. First box is in the staff order queue.`); render();
    };
    pane.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => { api.cancelSub(b.dataset.cancel); render(); });
  } else {
    const mine = S.orders.filter(o => o.cust === acc.id);
    const stage = { Placed: 1, Packed: 2, Delivered: 3 };
    pane.innerHTML = `<div class="card tw"><h3>My orders</h3>${mine.length ? `<table><tr><th>Order</th><th>Placed</th><th>Delivery</th><th>Items</th><th class="n">Total</th><th>Status</th></tr>
      ${mine.map(o => `<tr><td><b>${o.id}</b>${o.fromSub ? ` <span class="pill c">box</span>` : ''}</td><td>${o.date}</td><td>${o.deliver}</td><td>${o.items.map(i => `${CROPS[i.crop]} ${i.kg} kg`).join(', ')}</td><td class="n">${money(orderTotal(o))}</td>
      <td><span class="pill ${o.status === 'Delivered' ? 'g' : o.status === 'Packed' ? 'w' : 'c'}">${o.status}</span> <span class="note">${'●'.repeat(stage[o.status])}${'○'.repeat(3 - stage[o.status])}</span></td></tr>`).join('')}</table>` : '<p class="note">No orders yet. Go to Shop and order.</p>'}
      <p class="note">Status is updated by farm staff in the Staff Portal: Placed, then Packed, then Delivered.</p></div>`;
  }
};

/* ---------------- STAFF PORTAL ---------------- */
let pendingItems = [];
views.staff = function (tab) {
  tab = tab || 'orders';
  const open = S.orders.filter(o => o.status !== 'Delivered');
  const tabs = [['orders', `Orders to fulfil (${open.length})`], ['record', 'Record harvest and sale'], ['plan', 'Harvest planner'], ['mine', 'My entries']];
  $('#app').innerHTML = `<h1>Staff Portal</h1><p class="lead">Record what happens on the farm. Every entry is saved to the central farm database and shows up on the Management Dashboard straight away.</p>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="pane"></div>`;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { location.hash = '#/staff/' + b.dataset.tab; });
  const pane = $('#pane');
  if (tab === 'orders') {
    pane.innerHTML = `<div class="card tw"><h3>Open customer orders</h3>${open.length ? `<table><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Deliver by</th><th>Items</th><th class="n">Value</th><th>Status</th><th>Action</th></tr>
      ${open.map(o => `<tr><td><b>${o.id}</b></td><td>${esc(o.custName)}</td><td>${CH[o.ch]}</td><td>${o.deliver}</td><td>${o.items.map(i => `${CROPS[i.crop]} ${i.kg} kg`).join(', ')}</td><td class="n">${money(orderTotal(o))}</td>
      <td><span class="pill ${o.status === 'Packed' ? 'w' : 'c'}">${o.status}</span></td>
      <td class="flex">${o.status === 'Placed' ? `<button class="btn sm ghost" data-pack="${o.id}">Mark packed</button>` : ''}<button class="btn sm" data-deliver="${o.id}">Deliver and record sale</button></td></tr>`).join('')}</table>` : '<p class="note">All orders are delivered.</p>'}
      <p class="note">"Deliver and record sale" marks the order delivered and opens the record form pre-filled with the crop, channel, quantity and price from the order.</p></div>`;
    pane.querySelectorAll('[data-pack]').forEach(b => b.onclick = () => { api.updateOrder(b.dataset.pack, 'Packed'); toast(b.dataset.pack + ' marked packed. The customer sees the new status.'); render(); });
    pane.querySelectorAll('[data-deliver]').forEach(b => b.onclick = () => {
      const o = api.updateOrder(b.dataset.deliver, 'Delivered');
      pendingItems = o.items.map(it => ({ crop: it.crop, ch: o.ch, kg: it.kg, price: it.price, order: o.id }));
      toast(`${o.id} delivered. Record ${pendingItems.length} sale line${pendingItems.length > 1 ? 's' : ''}.`); tourAdvanceFrom('staff-deliver');
      location.hash = '#/staff/record';
    });
  } else if (tab === 'record') {
    renderRecordForm(pane);
  } else if (tab === 'plan') {
    const demand = CROPS.map(() => 0);
    S.orders.filter(o => o.status !== 'Delivered').forEach(o => o.items.forEach(i => demand[i.crop] += i.kg));
    const subWeekly = CROPS.map(() => 0);
    S.subs.filter(s => s.status === 'Active').forEach(s => s.crops.forEach(c => subWeekly[c] += (s.kg / s.crops.length) / (s.freq === 'Weekly' ? 1 : 2)));
    const recs = allRecords();
    const wr = CROPS.map((_, i) => { const r = recs.filter(x => x.crop === i).slice(-60); const a = aggregate(r); return a.wr; });
    const need = CROPS.map((_, i) => demand[i] + subWeekly[i]);
    const harvest = need.map((n, i) => n / (1 - wr[i] / 100));
    pane.innerHTML = `<div class="grid g2"><div class="card tw"><h3>What to harvest next</h3>
      <p class="note">Planned from real orders instead of guesswork: open orders plus one week of subscription boxes, grossed up by each crop's recent waste rate.</p>
      <table><tr><th>Crop</th><th class="n">Open orders</th><th class="n">Subs / week</th><th class="n">Recent waste</th><th class="n">Harvest (kg)</th></tr>
      ${CROPS.map((c, i) => `<tr><td>${EMOJI[i]} ${c}</td><td class="n">${r2(demand[i])} kg</td><td class="n">${r2(subWeekly[i])} kg</td><td class="n">${wr[i] > WASTE_ALERT ? `<span class="pill w">${pct(wr[i])}</span>` : pct(wr[i])}</td><td class="n"><b>${harvest[i].toFixed(1)}</b></td></tr>`).join('')}</table>
      <p class="formula">Harvest = (open order kg + weekly subscription kg) / (1 - recent waste rate). Recent waste rate = last 60 records of that crop.</p></div>
      <div class="card"><h3>Demand vs planned harvest</h3><div class="cbox"><canvas id="cPlan"></canvas></div></div></div>`;
    chart('cPlan', { type: 'bar', data: { labels: CROPS, datasets: [{ label: 'Customer demand (kg)', data: need.map(r2), backgroundColor: '#2f6fae', borderRadius: 4 }, { label: 'Planned harvest (kg)', data: harvest.map(r2), backgroundColor: '#1f7a4d', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false } });
  } else {
    const mine = S.records.slice().reverse();
    pane.innerHTML = `<div class="card tw"><h3>Records entered in this app (${mine.length})</h3>${mine.length ? `<table><tr><th>ID</th><th>Date</th><th>Batch</th><th>Crop</th><th>Channel</th><th class="n">Harvest</th><th class="n">Waste</th><th class="n">Revenue</th><th class="n">Total cost</th><th class="n">Profit</th><th class="n">Margin</th><th></th></tr>
      ${mine.map(r => { const m = r.rev ? r.gp / r.rev * 100 : 0; return `<tr><td>${r.id}</td><td>${r.date}</td><td>${r.batch}</td><td>${CROPS[r.crop]}</td><td>${CH[r.ch]}</td><td class="n">${r.h} kg</td><td class="n">${pct(r.w / r.h * 100)}</td><td class="n">${money(r.rev)}</td><td class="n">${money(r.tc)}</td><td class="n">${money(r.gp)}</td><td class="n"><span class="pill ${m < 0 ? 'b' : m < S.target ? 'w' : 'g'}">${pct(m)}</span></td><td><button class="btn sm ghost" data-del="${r.id}">Delete</button></td></tr>`; }).join('')}</table>` : '<p class="note">No records yet. Use "Record harvest and sale".</p>'}
      <p class="note">The 1,200 historical records from Dataset 1 (Jan-Aug 2026) are also in the database and are used by the Management Dashboard.</p></div>`;
    pane.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { api.deleteRecord(b.dataset.del); toast('Record deleted.'); render(); });
  }
};

function renderRecordForm(pane) {
  const pre = pendingItems[0];
  const crop = pre ? pre.crop : 0, ch = pre ? pre.ch : 0;
  const h = pre ? r2(pre.kg / 0.95) : 60;
  const defaults = c => ({ kwh: r2(h * PER_KG.kwh[c]), hrs: r2(h * PER_KG.hrs[c]), seed: r2(h * PER_KG.seed[c]), nut: r2(h * PER_KG.nut[c]) });
  const d = defaults(crop);
  const w = r2(h - (pre ? pre.kg : r2(h * 0.95)));
  const sell = h - w;
  pane.innerHTML = `${pre ? `<div class="alert g">Recording sale for <b>${pre.order}</b>: ${CROPS[pre.crop]} ${pre.kg} kg to ${CH[pre.ch]}. ${pendingItems.length > 1 ? (pendingItems.length - 1) + ' more line(s) after this one.' : ''}</div>` : ''}
  <div class="grid g2"><div class="card"><h3>Harvest batch and sale</h3>
    <div class="fgrid">
      <label class="f">Crop <select id="f_crop">${CROPS.map((c, i) => `<option value="${i}" ${i === crop ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="f">Sales channel <select id="f_ch">${CH.map((c, i) => `<option value="${i}" ${i === ch ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="f">Date <input type="date" id="f_date" value="${today()}"></label>
      <label class="f">Harvest weight (kg) <input type="number" step="0.01" id="f_h" value="${h}"></label>
      <label class="f">Waste (kg) <input type="number" step="0.01" id="f_w" value="${w}"></label>
      <label class="f">Selling price ($/kg) <input type="number" step="0.01" id="f_price" value="${pre ? pre.price : priceOf(crop, ch)}"></label>
      <label class="f">Electricity (kWh) <input type="number" step="0.01" id="f_kwh" value="${d.kwh}"></label>
      <label class="f">Labor hours <input type="number" step="0.01" id="f_hrs" value="${d.hrs}"></label>
      <label class="f">Seed cost ($) <input type="number" step="0.01" id="f_seed" value="${d.seed}"></label>
      <label class="f">Nutrient cost ($) <input type="number" step="0.01" id="f_nut" value="${d.nut}"></label>
      <label class="f">Packaging cost ($) <input type="number" step="0.01" id="f_pack" value="${r2(sell * PACK_PER_KG[ch])}"></label>
      <label class="f">Distribution cost ($) <input type="number" step="0.01" id="f_dist" value="${r2(sell * DIST_PER_KG[ch])}"></label>
    </div>
    <div id="ferr" class="alert b hidden"></div>
    <div class="flex"><button class="btn" id="saveRec">Save to farm database</button><button class="btn ghost" id="fillTyp">Fill typical values for this crop</button></div>
  </div>
  <div class="card"><h3>Live profit check</h3><div class="preview" id="prev"></div><div id="walert" style="margin-top:10px"></div>
    <p class="formula">Electricity cost = kWh x $${RATE_KWH}. Labor cost = hours x $${RATE_LABOR.toFixed(2)}. Water and facility = $${OTHER_PER_KG} per harvested kg (Dataset 1 average). Gross profit = revenue - total cost.</p></div></div>`;
  const ids = ['h', 'w', 'price', 'kwh', 'hrs', 'seed', 'nut', 'pack', 'dist'];
  const read = () => { const o = { crop: +$('#f_crop').value, ch: +$('#f_ch').value, date: $('#f_date').value || today() }; ids.forEach(k => o[k] = parseFloat($('#f_' + k).value)); return o; };
  const validate = o => {
    const errs = []; ids.forEach(k => { const el = $('#f_' + k); const bad = !isFinite(o[k]) || o[k] < 0; el.classList.toggle('err', bad); if (bad) errs.push(el.parentElement.firstChild.textContent.trim() + ' must be a number of 0 or more'); });
    if (isFinite(o.h) && o.h <= 0) { errs.push('Harvest weight must be above 0'); $('#f_h').classList.add('err'); }
    if (isFinite(o.w) && isFinite(o.h) && o.w > o.h) { errs.push('Waste cannot be more than the harvest'); $('#f_w').classList.add('err'); }
    return errs;
  };
  const upd = () => {
    const o = read(), errs = validate(o);
    $('#ferr').classList.toggle('hidden', !errs.length); $('#ferr').innerHTML = errs.join('<br>');
    if (errs.length) { $('#prev').innerHTML = '<p class="note">Fix the highlighted fields to see the calculation.</p>'; $('#walert').innerHTML = ''; return null; }
    const c = calcRecord(o), cp = priceOf(o.crop, o.ch);
    $('#prev').innerHTML = [['Sellable weight', c.s.toFixed(2) + ' kg'], ['Waste rate', pct(c.wr)], ['Revenue', money(c.rev)], ['Electricity cost', money(c.elec)], ['Labor cost', money(c.lab)],
      ['Seed + nutrients', money(o.seed + o.nut)], ['Packaging + distribution', money(o.pack + o.dist)], ['Water and facility (allocated)', money(c.other)], ['Total cost', '<b>' + money(c.tc) + '</b>'],
      ['Cost per sellable kg (break-even price)', money(c.costKg)], ['Gross profit', `<span class="big" style="color:${c.gp < 0 ? 'var(--bad)' : 'var(--g)'}">${money(c.gp)}</span>`], ['Gross margin', `<span class="big">${pct(c.gm)}</span>`]]
      .map(([l, v]) => `<div class="row"><span>${l}</span><span>${v}</span></div>`).join('');
    let al = '';
    if (c.wr > WASTE_ALERT) al += `<div class="alert w">Waste alert: ${pct(c.wr)} is above the ${WASTE_ALERT}% limit. Check the harvest plan for ${CROPS[o.crop]}.</div>`;
    if (c.gm < 0) al += `<div class="alert b">This batch loses money. The price is below the break-even price of ${money(c.costKg)} per kg.</div>`;
    else if (c.gm < S.target) al += `<div class="alert w">Margin ${pct(c.gm)} is below the ${S.target}% target. Management will see this crop in the alerts.</div>`;
    else al += `<div class="alert g">Margin ${pct(c.gm)} meets the ${S.target}% target.</div>`;
    if (Math.abs(o.price - cp) > 0.009) al += `<div class="alert w">Price differs from the current catalog price (${money(cp)}).</div>`;
    $('#walert').innerHTML = al; return o;
  };
  pane.querySelectorAll('input,select').forEach(x => x.oninput = upd);
  $('#f_crop').onchange = $('#f_ch').onchange = () => { $('#f_price').value = priceOf(+$('#f_crop').value, +$('#f_ch').value); upd(); };
  $('#fillTyp').onclick = () => { const c = +$('#f_crop').value, ch2 = +$('#f_ch').value, hh = parseFloat($('#f_h').value) || 60, w2 = parseFloat($('#f_w').value) || 0; $('#f_kwh').value = r2(hh * PER_KG.kwh[c]); $('#f_hrs').value = r2(hh * PER_KG.hrs[c]); $('#f_seed').value = r2(hh * PER_KG.seed[c]); $('#f_nut').value = r2(hh * PER_KG.nut[c]); $('#f_pack').value = r2((hh - w2) * PACK_PER_KG[ch2]); $('#f_dist').value = r2((hh - w2) * DIST_PER_KG[ch2]); upd(); };
  $('#saveRec').onclick = () => {
    const o = upd(); if (!o) { toast('Please fix the highlighted fields.'); return; }
    const rec = api.addRecord(o);
    pendingItems.shift();
    toast(`Saved ${rec.id}: profit ${money(rec.gp)}. Management Dashboard updated.`); tourAdvanceFrom('staff-record');
    if (pendingItems.length) render(); else location.hash = '#/staff/mine';
  };
  upd();
}

/* ---------------- MANAGEMENT DASHBOARD ---------------- */
let mf = { crop: -1, ch: -1, period: 'all' };
views.manager = function (tab) {
  tab = tab || 'overview';
  const tabs = [['overview', 'Overview'], ['profit', 'Crop and channel profit'], ['pricing', 'Pricing tool']];
  const months = [...new Set(allRecords().map(r => r.date.slice(0, 7)))].sort();
  $('#app').innerHTML = `<div class="flex"><div><h1>Management Dashboard</h1><p class="lead">True profit by crop and sales channel, calculated from every record in the central farm database.</p></div>
    <label class="right note">Target margin <input type="number" id="tgt" value="${S.target}" min="0" max="90" style="width:70px">%</label></div>
    <div class="card flex" style="padding:12px 16px">
      <label class="note">Crop <select id="mcrop"><option value="-1">All crops</option>${CROPS.map((c, i) => `<option value="${i}" ${mf.crop === i ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="note">Channel <select id="mch"><option value="-1">All channels</option>${CH.map((c, i) => `<option value="${i}" ${mf.ch === i ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="note">Period <select id="mper"><option value="all">All data</option><option value="app" ${mf.period === 'app' ? 'selected' : ''}>Only entries made in this app</option>${months.map(m => `<option value="${m}" ${mf.period === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <button class="btn sm ghost" id="mreset">Reset</button>
      <button class="btn sm right" id="exportCsv">Export records (CSV)</button>
    </div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="pane"></div>`;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { location.hash = '#/manager/' + b.dataset.tab; });
  $('#mcrop').onchange = e => { mf.crop = +e.target.value; render(); };
  $('#mch').onchange = e => { mf.ch = +e.target.value; render(); };
  $('#mper').onchange = e => { mf.period = e.target.value; render(); };
  $('#mreset').onclick = () => { mf = { crop: -1, ch: -1, period: 'all' }; render(); };
  $('#tgt').onchange = e => { const v = +e.target.value; if (isFinite(v) && v >= 0 && v < 90) { S.target = v; save(); render(); } };
  $('#exportCsv').onclick = exportCsv;
  const recs = allRecords().filter(r => (mf.crop < 0 || r.crop === mf.crop) && (mf.ch < 0 || r.ch === mf.ch) && (mf.period === 'all' || (mf.period === 'app' ? r.src !== 'Dataset 1' : r.date.startsWith(mf.period))));
  api.getKpis(`?crop=${mf.crop < 0 ? 'all' : CID[mf.crop]}&channel=${mf.ch < 0 ? 'all' : (mf.ch ? 'CH02' : 'CH01')}&period=${mf.period}`); save();
  const pane = $('#pane');
  if (!recs.length) { pane.innerHTML = '<div class="card"><p>No records match these filters yet. Record a harvest in the Staff Portal, or reset the filters.</p></div>'; return; }
  const a = aggregate(recs);
  const byCrop = CROPS.map((_, i) => aggregate(recs.filter(r => r.crop === i)));
  const byCh = CH.map((_, i) => aggregate(recs.filter(r => r.ch === i)));
  const cropIdx = CROPS.map((_, i) => i).filter(i => byCrop[i].n);
  const kpis = `<div class="kpis">${[['Revenue', moneyK(a.rev), a.n.toLocaleString() + ' records'], ['Total cost', moneyK(a.tc), money(a.costKg) + ' per sellable kg'], ['Gross profit', moneyK(a.gp), 'revenue - total cost'],
    ['Gross margin', pct(a.gm), 'target ' + S.target + '%'], ['Waste rate', pct(a.wr), Math.round(a.w).toLocaleString() + ' kg wasted'], ['Sellable output', Math.round(a.s).toLocaleString() + ' kg', Math.round(a.h).toLocaleString() + ' kg harvested']]
    .map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('')}</div>`;

  if (tab === 'overview') {
    const alerts = [];
    CROPS.forEach((c, i) => CH.forEach((h, j) => { const g = aggregate(recs.filter(r => r.crop === i && r.ch === j)); if (g.n && g.gm < S.target) alerts.push(`<div class="alert w"><div><b>${c} via ${h}</b>: margin ${pct(g.gm)} is below the ${S.target}% target. Break-even price ${money(g.costKg)}/kg, current price ${money(priceOf(i, j))}/kg. <a href="#/manager/pricing">Open pricing tool</a></div></div>`); }));
    CROPS.forEach((c, i) => { if (byCrop[i].n && byCrop[i].wr > 9) alerts.push(`<div class="alert w"><div><b>${c}</b>: waste rate ${pct(byCrop[i].wr)} is high. Plan harvests from orders in the Staff Portal planner.</div></div>`); });
    S.records.filter(r => r.gp < 0).forEach(r => alerts.push(`<div class="alert b"><div><b>${r.id}</b> (${CROPS[r.crop]}, ${r.date}) lost ${money(-r.gp)}.</div></div>`));
    const openOrders = S.orders.filter(o => o.status !== 'Delivered');
    pane.innerHTML = kpis + `<div class="grid g2">
      <div class="card"><h3>Gross margin by crop</h3><p class="note">Bars below the target line are shown in amber.</p><div class="cbox"><canvas id="cMargin"></canvas></div></div>
      <div class="card"><h3>Alerts and actions (${alerts.length})</h3><div style="max-height:300px;overflow:auto">${alerts.join('') || '<div class="alert g">All crops and channels meet the target margin.</div>'}</div>
        <div class="alert g" style="margin-top:8px">${openOrders.length} open customer order(s) worth ${money(openOrders.reduce((x, o) => x + orderTotal(o), 0))}. ${S.subs.filter(s => s.status === 'Active').length} active subscription(s).</div></div>
      <div class="card"><h3>Revenue and profit by channel</h3><div class="cbox"><canvas id="cCh"></canvas></div></div>
      <div class="card"><h3>Monthly gross profit</h3><div class="cbox"><canvas id="cMon"></canvas></div></div></div>`;
    chart('cMargin', { type: 'bar', data: { labels: cropIdx.map(i => CROPS[i]), datasets: [{ label: 'Gross margin %', data: cropIdx.map(i => r2(byCrop[i].gm)), backgroundColor: cropIdx.map(i => byCrop[i].gm >= S.target ? '#1f7a4d' : '#d99a2b'), borderRadius: 4 }, { type: 'line', label: 'Target', data: cropIdx.map(() => S.target), borderColor: '#b4442f', borderDash: [6, 4], pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: v => v + '%' } } } } });
    const chIdx = [0, 1].filter(i => byCh[i].n);
    chart('cCh', { type: 'bar', data: { labels: chIdx.map(i => CH[i]), datasets: [{ label: 'Revenue', data: chIdx.map(i => r2(byCh[i].rev)), backgroundColor: '#8cc5a5', borderRadius: 4 }, { label: 'Gross profit', data: chIdx.map(i => r2(byCh[i].gp)), backgroundColor: '#1f7a4d', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => moneyK(v) } } } } });
    const mons = [...new Set(recs.map(r => r.date.slice(0, 7)))].sort();
    chart('cMon', { type: 'line', data: { labels: mons, datasets: [{ label: 'Gross profit', data: mons.map(m => r2(aggregate(recs.filter(r => r.date.startsWith(m))).gp)), borderColor: '#1f7a4d', backgroundColor: '#1f7a4d', tension: .3 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => moneyK(v) } } } } });
  } else if (tab === 'profit') {
    const rows = [];
    CROPS.forEach((c, i) => CH.forEach((h, j) => { const g = aggregate(recs.filter(r => r.crop === i && r.ch === j)); if (g.n) rows.push({ c, h, g }); }));
    rows.sort((x, y) => y.g.gm - x.g.gm);
    const comp = [['Electricity', 'elec', '#2f5d8a'], ['Labor', 'lab', '#e0a43a'], ['Seed', 'seed', '#7a9e3b'], ['Nutrients', 'nut', '#4fa3a5'], ['Packaging', 'pack', '#b06b8a'], ['Distribution', 'dist', '#8a6d4f'], ['Water and facility', 'other', '#c5ccd3']];
    pane.innerHTML = kpis + `<div class="card"><h3>Cost per sellable kg by crop</h3><p class="note">Where each dollar of cost goes. Total height = break-even price per kg.</p><div class="cbox" style="height:300px"><canvas id="cCost"></canvas></div></div>
      <div class="card tw"><h3>Profitability ranking: crop x channel</h3><table><tr><th>#</th><th>Crop</th><th>Channel</th><th class="n">Records</th><th class="n">Revenue</th><th class="n">Total cost</th><th class="n">Gross profit</th><th class="n">Margin</th><th class="n">Cost/kg</th><th class="n">Waste</th></tr>
      ${rows.map((x, k) => `<tr><td>${k + 1}</td><td>${x.c}</td><td>${x.h}</td><td class="n">${x.g.n}</td><td class="n">${money(x.g.rev)}</td><td class="n">${money(x.g.tc)}</td><td class="n">${money(x.g.gp)}</td><td class="n"><span class="pill ${x.g.gm < 0 ? 'b' : x.g.gm < S.target ? 'w' : 'g'}">${pct(x.g.gm)}</span></td><td class="n">${money(x.g.costKg)}</td><td class="n">${pct(x.g.wr)}</td></tr>`).join('')}</table></div>`;
    chart('cCost', { type: 'bar', data: { labels: cropIdx.map(i => CROPS[i]), datasets: comp.map(([l, k, col]) => ({ label: l, data: cropIdx.map(i => r2(byCrop[i][k] / byCrop[i].s)), backgroundColor: col })) },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => '$' + v } } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ': $' + c.raw.toFixed(2) + '/kg' } } } } });
  } else {
    const rows = [];
    CROPS.forEach((c, i) => CH.forEach((h, j) => { const g = aggregate(allRecords().filter(r => r.crop === i && r.ch === j)); if (g.n) rows.push({ i, j, g }); }));
    const t = S.target / 100;
    pane.innerHTML = `<div class="card tw"><h3>Pricing tool</h3><p class="note">Break-even price = total cost / sellable kg (all records for that crop and channel). Recommended price = break-even / (1 - target margin). "Apply" updates the price list that customers see in the Customer Portal.</p>
      <table><tr><th>Crop</th><th>Channel</th><th class="n">Break-even $/kg</th><th class="n">Current price</th><th class="n">Projected margin</th><th class="n">Recommended (${S.target}%)</th><th class="n">Change</th><th>Action</th></tr>
      ${rows.map(x => { const cur = priceOf(x.i, x.j), be = x.g.costKg, rec = be / (1 - t), pm = (1 - be / cur) * 100, ch = (rec - cur) / cur * 100; const ok = pm >= S.target - 0.05;
        return `<tr id="pr-${x.i}-${x.j}"><td>${EMOJI[x.i]} ${CROPS[x.i]}</td><td>${CH[x.j]}</td><td class="n">${money(be)}</td><td class="n"><b>${money(cur)}</b></td><td class="n"><span class="pill ${pm < 0 ? 'b' : ok ? 'g' : 'w'}">${pct(pm)}</span></td><td class="n">${money(rec)}</td><td class="n">${ok ? '-' : '+' + ch.toFixed(1) + '%'}</td>
        <td>${ok ? '<span class="note">On target</span>' : `<button class="btn sm" data-apply="${x.i}-${x.j}-${rec.toFixed(2)}">Apply ${money(rec)}</button>`}</td></tr>`; }).join('')}</table></div>
      <div class="card tw"><h3>Price change log</h3>${S.priceLog.length ? `<table><tr><th>When</th><th>Crop</th><th>Channel</th><th class="n">Old</th><th class="n">New</th><th>Reason</th></tr>${S.priceLog.map(p => `<tr><td>${p.t}</td><td>${CROPS[p.crop]}</td><td>${CH[p.ch]}</td><td class="n">${money(p.old)}</td><td class="n">${money(p.price)}</td><td>${esc(p.reason)}</td></tr>`).join('')}</table>` : '<p class="note">No price changes yet.</p>'}</div>`;
    pane.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => {
      const [i, j, p] = b.dataset.apply.split('-'); api.setPrice(+i, +j, +p, `Raise to ${S.target}% target margin`);
      toast(`${CROPS[i]} (${CH[j]}) price set to ${money(+p)}/kg. Customers now see the new price.`); tourAdvanceFrom('mgr-price'); render();
      const row = document.getElementById(`pr-${i}-${j}`); if (row) row.classList.add('hl');
    });
  }
};
function exportCsv() {
  const head = ['Record_ID', 'Date', 'Crop_ID', 'Crop_Name', 'Channel_ID', 'Sales_Channel', 'Batch_ID', 'Harvest_Weight_kg', 'Sellable_Weight_kg', 'Waste_kg', 'Selling_Price_per_kg', 'Revenue', 'Electricity_kWh', 'Electricity_Cost', 'Labor_Hours', 'Labor_Cost', 'Seed_Cost', 'Nutrient_Cost', 'Packaging_Cost', 'Distribution_Cost', 'Total_Cost', 'Gross_Profit', 'Source'];
  const lines = [head.join(',')].concat(allRecords().map(r => [r.id, r.date, CID[r.crop], CROPS[r.crop], r.ch ? 'CH02' : 'CH01', CH[r.ch], r.batch, r.h, r.s, r.w, r.price, r.rev, r.kwh, r.elec, r.hrs, r.lab, r.seed, r.nut, r.pack, r.dist, r.tc, r.gp, r.src].join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'farm_profit_hub_records.csv'; document.body.appendChild(a); a.click(); a.remove();
  logCall('GET', '/api/records/export.csv'); save(); toast('CSV downloaded.');
}

/* ---------------- DATA FLOW ---------------- */
views.data = function () {
  const recs = allRecords();
  $('#app').innerHTML = `<h1>How data flows</h1><p class="lead">This prototype follows the Team 9 Enterprise Architecture. Three interfaces read and write one central farm database through a REST API. Here, browser storage stands in for the Neon PostgreSQL database, and the log below shows each API call as you use the app.</p>
  <div class="card"><div class="flow">
    <div class="node"><b>\u{1F6D2} Customer Portal</b><span class="note">Orders and subscriptions</span><div class="pill c" style="margin-top:6px">${S.orders.length} orders · ${S.subs.length} subscriptions</div></div>
    <div class="arr">⇄</div>
    <div class="node db"><b>\u{1F5C4} Central farm database</b><span class="note">REST API and JSON</span>
      <div style="margin-top:6px" class="flex" ><span class="pill g">${recs.length.toLocaleString()} production and sales records</span><span class="pill g">${historical.length.toLocaleString()} from Dataset 1 + ${S.records.length} new</span><span class="pill g">12 prices</span></div></div>
    <div class="arr">⇄</div>
    <div class="node"><b>\u{1F9D1}‍\u{1F33E} Staff Portal</b><span class="note">Harvest, waste, energy, labor, costs</span><div class="pill w" style="margin-top:6px">${S.records.length} records entered</div></div>
  </div>
  <div style="text-align:center" class="arr">↓</div>
  <div class="node" style="max-width:420px;margin:0 auto"><b>\u{1F4CA} Management Dashboard</b><span class="note">KPIs, alerts, pricing decisions. Price changes flow back to the Customer Portal.</span></div></div>
  <div class="grid g2">
    <div class="card"><h3>Live API log</h3><div class="log">${S.log.length ? S.log.map(l => `<div>[${l.t}] <span class="m">${l.method}</span> ${esc(l.path)} ${l.body ? '<span style="opacity:.7">' + esc(l.body) + '</span>' : ''}</div>`).join('') : '<div>No calls yet. Use any portal and come back.</div>'}</div></div>
    <div class="card tw"><h3>Database tables</h3><table><tr><th>Table</th><th>Key fields</th><th class="n">Rows</th></tr>
      <tr><td>FACT_PRODUCTION_SALES</td><td>Record_ID (PK), Crop_ID (FK), Channel_ID (FK), Date (FK), Batch_ID, weights, costs, revenue, profit</td><td class="n">${recs.length.toLocaleString()}</td></tr>
      <tr><td>DIM_CROP</td><td>Crop_ID (PK), Crop_Name, Crop_Category, Growth_Cycle_Days</td><td class="n">6</td></tr>
      <tr><td>DIM_CHANNEL</td><td>Channel_ID (PK), Sales_Channel</td><td class="n">2</td></tr>
      <tr><td>PRICE_LIST</td><td>Crop_ID (FK), Channel_ID (FK), Price_per_kg</td><td class="n">12</td></tr>
      <tr><td>ORDERS / ORDER_ITEMS</td><td>Order_ID (PK), Customer, Channel_ID (FK), Status, Crop_ID, kg</td><td class="n">${S.orders.length}</td></tr>
      <tr><td>SUBSCRIPTIONS</td><td>Sub_ID (PK), Customer, Box size, Frequency, Crops</td><td class="n">${S.subs.length}</td></tr></table>
      <p class="note">Full-build stack from the architecture: Next.js and React (frontend), Node.js REST API, Neon PostgreSQL, JWT role-based access, SSL/TLS, deployed on Vercel from GitHub. This prototype is a static version of it for GitHub Pages.</p></div></div>`;
};

/* ---------------- TUTORIAL + GUIDED TOUR ---------------- */
const TOUR = [
  { id: 'start', route: '#/login', text: 'Pick a role. There is no password, so each interface opens with one click.' },
  { id: 'customer-order', route: '#/customer/shop', role: ['customer', 'rest'], text: 'You are Green Fork Bistro. Type a quantity (for example 10 kg of Lettuce), then click "Place order".' },
  { id: 'staff-deliver', route: '#/staff/orders', role: ['staff', 'staff'], text: 'Staff see the new order instantly. Click "Deliver and record sale" on it.' },
  { id: 'staff-record', route: '#/staff/record', role: ['staff', 'staff'], text: 'The form is pre-filled from the order. Change the waste kg and watch the live profit check and waste alert, then click "Save to farm database".' },
  { id: 'mgr-overview', route: '#/manager/overview', role: ['manager', 'mgr'], text: 'Management sees KPIs and alerts that already include the new record. Amber bars are below the target margin.' },
  { id: 'mgr-price', route: '#/manager/pricing', role: ['manager', 'mgr'], text: 'Click "Apply" on a crop below target (for example Lettuce, Restaurant) to set the recommended price.' },
  { id: 'customer-see', route: '#/customer/shop', role: ['customer', 'rest'], text: 'Back as the customer: the new price is already in the catalog, with a price update notice.' },
  { id: 'data', route: '#/data', text: 'Every step was an API call into the central database. That is the data integration behind the solution. Tour done!' }
];
function startTour() { S.tour = 0; save(); goTour(); }
function goTour() { const st = TOUR[S.tour]; if (st.role) { login(st.role[0], st.role[1]); S.session.pref = st.role[1]; save(); } if (location.hash === st.route) render(); else location.hash = st.route; }
function tourAdvanceFrom(id) { if (S.tour == null) return; if (TOUR[S.tour] && TOUR[S.tour].id === id && S.tour < TOUR.length - 1) { S.tour++; save(); setTimeout(goTour, 700); } }
function renderTour() {
  const bar = $('#tourbar');
  if (S.tour == null || !TOUR[S.tour]) { bar.classList.add('hidden'); return; }
  const st = TOUR[S.tour];
  bar.innerHTML = `<b>Guided tour ${S.tour + 1}/${TOUR.length}</b><span>${st.text}</span>${S.tour > 0 ? '<button class="btn sm ghost" id="tPrev">Back</button>' : ''}${S.tour < TOUR.length - 1 ? '<button class="btn sm" id="tNext">Next</button>' : ''}<button class="btn sm ghost" id="tEnd">${S.tour < TOUR.length - 1 ? 'Exit tour' : 'Finish'}</button>`;
  bar.classList.remove('hidden');
  if ($('#tNext')) $('#tNext').onclick = () => { S.tour++; save(); goTour(); };
  if ($('#tPrev')) $('#tPrev').onclick = () => { S.tour--; save(); goTour(); };
  $('#tEnd').onclick = () => { S.tour = null; save(); renderTour(); };
}
views.tutorial = function () {
  $('#app').innerHTML = `<h1>Tutorial: how a user works with Farm Profit Hub</h1>
  <p class="lead">The problem: the farm did not know which crops and sales channels make money, because production costs and sales were never connected. This app connects them. Follow the steps, or start the guided tour, which walks you through each screen.</p>
  <div class="flex" style="margin-bottom:16px"><button class="btn" id="tStart">Start guided tour</button><a class="btn ghost" href="#/login">Go to sign-in</a></div>
  <ol class="steps">
    <li><b>Sign in without a password.</b> Choose Customer, Staff or Management on the sign-in page. Each role has its own interface.</li>
    <li><b>Customer places an order.</b> In the Customer Portal, a restaurant orders by the kg, or a household builds a subscription box. Prices come from the farm's price list. <a href="#/customer/shop">Open</a></li>
    <li><b>Staff fulfil the order.</b> The order appears in the Staff Portal. Staff mark it packed, then "Deliver and record sale". The customer sees each status change. <a href="#/staff/orders">Open</a></li>
    <li><b>Staff record the batch.</b> Harvest kg, waste kg, electricity, labor hours and input costs are entered once. The app calculates sellable weight, cost, revenue, profit, margin and break-even price, and raises a waste alert above 6%. <a href="#/staff/record">Open</a></li>
    <li><b>Harvest planner.</b> Staff plan the next harvest from open orders and subscriptions, adjusted for each crop's recent waste rate. This is how waste goes down. <a href="#/staff/plan">Open</a></li>
    <li><b>Management sees true profit.</b> KPIs, margin by crop, channel comparison, monthly trend and alerts, all filtered by crop, channel and period. <a href="#/manager/overview">Open</a></li>
    <li><b>Find the cost drivers.</b> The cost-per-kg chart splits each crop's cost into electricity, labor, seed, nutrients, packaging, distribution and water/facility. The ranking table lists crop and channel pairs from best to worst margin. <a href="#/manager/profit">Open</a></li>
    <li><b>Make the pricing decision.</b> The pricing tool shows break-even and recommended prices for the target margin. "Apply" updates the price list, and customers see it immediately. <a href="#/manager/pricing">Open</a></li>
    <li><b>See the data flow.</b> The Data Flow page shows the live API log and the database tables behind all three interfaces. <a href="#/data">Open</a></li>
  </ol>
  <div class="card" style="margin-top:16px"><h3>How this supports our proposed solution</h3>
  <table><tr><th>Problem from our research</th><th>Feature in the prototype</th><th>KPI it moves</th></tr>
  <tr><td>Costs not calculated per crop and channel</td><td>Staff record form + automatic cost and profit rules</td><td>Production cost per unit</td></tr>
  <tr><td>Prices set by guesswork</td><td>Pricing tool (break-even and target-margin price)</td><td>Profit margin by crop and channel</td></tr>
  <tr><td>Waste not tracked</td><td>Waste alert + harvest planner from orders</td><td>Waste/spoilage rate</td></tr>
  <tr><td>Restaurant and subscription mixed together</td><td>Channel filter, channel comparison, separate prices</td><td>Profit margin by channel</td></tr></table>
  <p class="note">Use "Reset demo" in the top bar to return to the starting data after a demo.</p></div>`;
  $('#tStart').onclick = startTour;
};

window.addEventListener('hashchange', render);
render();
})();
