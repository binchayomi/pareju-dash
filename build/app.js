/* Dashboard Pareju — mesin hitung. Semua KPI dihitung dari tabel transaksi ringkas D.gt / D.mt / D.mds. */
'use strict';
const D = window.PJ_DATA;
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const Y0 = 2023;
const CLOSE_YM = D.meta.closingYm;
const BENCH = { ecDay: 7, avgEa: 150, eaRo: 0.4, f3: 0.2, nsVar: 10, nsPct: 0.4, hiloPct: 0.5 };
const HILO_MIN = { PAREPARE: 5, MAMUJU: 3 }; // target varian HiLo per cabang (kamus)
const CABNAMA = { PAREPARE: 'Parepare', MAMUJU: 'Mamuju', ALL: 'Gabungan' };

// ---------- format ----------
const nf = (d) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
const F = {
  rp(v) { if (v == null || !isFinite(v)) return 'n.a.'; const a = Math.abs(v), s = v < 0 ? '-Rp ' : 'Rp ';
    if (a >= 1e9) return s + nf(1).format(a / 1e9) + ' M'; if (a >= 1e6) return s + nf(1).format(a / 1e6) + ' jt';
    if (a >= 1e3) return s + nf(1).format(a / 1e3) + ' rb'; return s + nf(0).format(a); },
  rpFull(v) { return v == null || !isFinite(v) ? 'n.a.' : (v < 0 ? '-Rp ' : 'Rp ') + nf(0).format(Math.abs(v)); },
  n(v, d = 0) { return v == null || !isFinite(v) ? 'n.a.' : nf(d).format(v); },
  n1(v) { return F.n(v, 1); }, n2(v) { return F.n(v, 2); },
  pct(v, d = 1) { return v == null || !isFinite(v) ? 'n.a.' : nf(d).format(v * 100) + '%'; },
  g(v) { return v == null || !isFinite(v) ? 'n.a.' : (v > 0 ? '+' : '') + nf(1).format(v * 100) + '%'; },
  date(day) { const d = new Date(Date.UTC(2023, 0, 1 + day)); return d.toISOString().slice(0, 10); },
};
const ymOf = (y, m) => (y - Y0) * 12 + m - 1; // m 1..12
const yOf = (ym) => Y0 + Math.floor(ym / 12);
const mOf = (ym) => (ym % 12) + 1;
const ymLabel = (ym) => BULAN[ym % 12] + ' ' + yOf(ym);
const pop = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const mean = (a) => { const b = a.filter((v) => v != null && isFinite(v)); return b.length ? sum(b) / b.length : null; };
const gr = (v, b) => (v == null || b == null || !isFinite(v) || !isFinite(b) || b <= 0 ? null : v / b - 1);
const div = (a, b) => (b ? a / b : null);

// ---------- dimensi ----------
const ITEM = D.items.map((r, i) => ({ i, ch: r[0], n: r[1], brand: r[2], v: r[3], tea: r[4], school: r[5], jupe: r[6] }));
const OUT = D.outlets.map((r, i) => ({ i, key: r[0], cab: r[1], n: r[2], st: r[3], kab: r[4] || 'BELUM TERPETAKAN', kec: r[5] || 'Belum terpetakan' }));
const SALES = D.sales.map((r, i) => ({ i, n: r[0], cab: r[1] }));
const salesIx = Object.fromEntries(SALES.map((s) => [s.n, s.i]));
const isBrand = (it, b) => b === 'ALL' || it.brand === b;
const HILO = (it) => it.brand === 'HILO';
const NS = (it) => it.brand === 'NUTRISARI';

// ---------- scope: agregat per bulan untuk satu kombinasi filter ----------
const CACHE = new Map();
function scope(table, f) {
  // f: {cab:'PAREPARE'|'MAMUJU'|'ALL', sales:-1|idx, brand:'ALL'|name, outlets:Set|null, items:Set|null, key}
  const k = table + '|' + (f.key || [f.cab, f.sales, f.brand].join('|'));
  if (CACHE.has(k)) return CACHE.get(k);
  const rows = D[table];
  const M = new Map(); // ym -> {net, ret, om: Map(o->mask), lines:Set, dm}
  const first = new Map(); // year -> Map(o -> ym)
  const pfirst = new Map(); // year -> Map(o*2000+i -> ym)
  const oMonths = new Map(); // o -> Set(ym)
  for (const r of rows) {
    const s = r[0], o = r[1], i = r[2], ym = r[3];
    if (f.cab !== 'ALL' && OUT[o].cab !== f.cab) continue;
    if (f.sales >= 0 && s !== f.sales) continue;
    if (f.brand !== 'ALL' && ITEM[i].brand !== f.brand) continue;
    if (f.outlets && !f.outlets.has(o)) continue;
    if (f.items && !f.items.has(i)) continue;
    let x = M.get(ym);
    if (!x) M.set(ym, (x = { net: 0, ret: 0, om: new Map(), lines: new Set(), dm: 0 }));
    x.net += r[4]; x.ret += r[5];
    const mask = r[6];
    if (!mask) continue;
    x.om.set(o, (x.om.get(o) || 0) | mask); x.lines.add(o * 2000 + i); x.dm |= mask;
    const y = yOf(ym);
    let fm = first.get(y); if (!fm) first.set(y, (fm = new Map()));
    if (!(fm.get(o) <= ym)) fm.set(o, ym);
    let pm = pfirst.get(y); if (!pm) pfirst.set(y, (pm = new Map()));
    if (!(pm.get(o * 2000 + i) <= ym)) pm.set(o * 2000 + i, ym);
    let om = oMonths.get(o); if (!om) oMonths.set(o, (om = new Set()));
    om.add(ym);
  }
  const mon = new Map();
  for (const [ym, x] of M) {
    let ec = 0; for (const v of x.om.values()) ec += pop(v);
    mon.set(ym, { net: x.net, ret: x.ret, gross: x.net - x.ret, ea: x.om.size, ec, days: pop(x.dm), line: x.lines.size, outlets: x.om, lines: x.lines });
  }
  const sc = { mon, first, pfirst, oMonths, roC: new Map() };
  CACHE.set(k, sc);
  return sc;
}
const M0 = { net: 0, ret: 0, gross: 0, ea: 0, ec: 0, days: 0, line: 0 };
const mget = (sc, ym) => sc.mon.get(ym) || M0;
function roAt(sc, ym) { // RO YTD, pasangan outlet-item YTD, F3=0 pada bulan ym
  if (sc.roC.has(ym)) return sc.roC.get(ym);
  const y = yOf(ym); let ro = 0, f3 = 0, pr = 0; const f3list = [];
  for (const [o, fm] of sc.first.get(y) || []) {
    if (fm > ym) continue; ro++;
    const om = sc.oMonths.get(o);
    if (!om.has(ym) && !om.has(ym - 1) && !om.has(ym - 2)) { f3++; f3list.push(o); }
  }
  for (const fm of (sc.pfirst.get(y) || new Map()).values()) if (fm <= ym) pr++;
  const v = { ro, pr, f3, f3list }; sc.roC.set(ym, v); return v;
}
function startYm(sc, y, salesMode) { // bulan sebelum sales join tidak dihitung nol
  const y0 = ymOf(y, 1);
  if (!salesMode) return y0;
  for (let k = y0; k < y0 + 12; k++) if (mget(sc, k).ea > 0 || mget(sc, k).net) return k;
  return y0;
}
function ytd(sc, y, m, salesMode) {
  const end = ymOf(y, m), st = startYm(sc, y, salesMode);
  const L = []; for (let k = st; k <= end; k++) L.push(k);
  const mm = L.map((k) => mget(sc, k));
  const total = sum(mm.map((x) => x.net)), n = L.length || 1;
  const avgEa = sum(mm.map((x) => x.ea)) / n;
  const z = roAt(sc, end);
  return {
    total, avg: total / n, n, gross: sum(mm.map((x) => x.gross)), ret: sum(mm.map((x) => x.ret)),
    avgEa, ro: z.ro, eaRo: div(avgEa, z.ro), ecday: div(sum(mm.map((x) => x.ec)), sum(mm.map((x) => x.days))),
    ec: sum(mm.map((x) => x.ec)), lineEa: mean(mm.map((x) => div(x.line, x.ea))), lineRo: div(z.pr, z.ro),
    f3: z.f3, f3pct: div(z.f3, z.ro), f3list: z.f3list,
  };
}
function month(sc, ym) {
  const x = mget(sc, ym), z = roAt(sc, ym);
  return { net: x.net, gross: x.gross, ret: x.ret, ea: x.ea, ec: x.ec, days: x.days, ecday: div(x.ec, x.days), lineEa: div(x.line, x.ea), eaRo: div(x.ea, z.ro), ro: z.ro };
}
const netRange = (sc, a, b) => { let t = 0; for (let k = a; k <= b; k++) t += mget(sc, k).net; return t; };
function growth(sc, y, m, salesMode) {
  const ym = ymOf(y, m), cur = mget(sc, ym).net;
  const ap3 = netRange(sc, ym - 3, ym - 1) / 3, a12 = netRange(sc, ym - 12, ym - 1) / 12;
  const t = ytd(sc, y, m, salesMode), ly = ytd(sc, y - 1, m, false);
  const lyFull = netRange(sc, ymOf(y - 1, 1), ymOf(y - 1, 12)) / 12;
  return {
    ap3m: gr(cur, ap3), ap3m12m: gr(cur, (ap3 + a12) / 2), mom: gr(cur, mget(sc, ym - 1).net),
    avg: y - 1 >= Y0 ? gr(t.avg, lyFull) : null, ytd: y - 1 >= Y0 ? gr(t.total, ly.total) : null,
    ptd: gr(cur, mget(sc, ym - 12).net), yoy: ym - 23 >= 0 ? gr(netRange(sc, ym - 11, ym), netRange(sc, ym - 23, ym - 12)) : null,
  };
}

// ---------- per outlet (untuk Outlet, Action Center, growth outlet) ----------
function outletStats(table, f, y, m) {
  const end = ymOf(y, m), st = ymOf(y, 1), ly0 = ymOf(y - 1, 1), ly1 = ymOf(y - 1, 12);
  const qs = ymOf(y, Math.floor((m - 1) / 3) * 3 + 1);
  const res = new Map();
  const get = (o) => { let x = res.get(o); if (!x) res.set(o, (x = { o, ytd: 0, ly: 0, lyYtd: 0, mon: new Map(), items: new Set(), pa: new Map(), last: -1, sales: new Map(), ns: new Set(), hl: new Set(), nsQ: new Set(), hlQ: new Set(), ord: new Set(), ord12: new Set() })); return x; };
  for (const r of D[table]) {
    const s = r[0], o = r[1], i = r[2], ym = r[3];
    if ((f.cab !== 'ALL' && OUT[o].cab !== f.cab) || (f.sales >= 0 && s !== f.sales)) continue;
    if (f.outlets && !f.outlets.has(o)) continue;
    if (ym > end || ym < ly0 - 12) continue;
    const it = ITEM[i];
    const bOk = f.brand === 'ALL' || it.brand === f.brand;
    if (f.items && !f.items.has(i)) continue;
    const x = get(o);
    if (bOk) {
      if (ym >= st) { x.ytd += r[4]; x.mon.set(ym, (x.mon.get(ym) || 0) + r[4]); }
      if (ym >= ly0 && ym <= ly1) { x.ly += r[4]; if (ym <= ly0 + m - 1) x.lyYtd += r[4]; }
    }
    if (!r[6]) continue;
    if (ym >= end - 11) x.ord12.add(ym);
    if (ym >= end - 2) x.ord.add(ym);
    { const lastDay = ym * 100 + (32 - Math.clz32(r[6])); if (lastDay > x.last) x.last = lastDay; }
    x.sales.set(s, (x.sales.get(s) || 0) + r[4]);
    if (ym >= st && bOk) { x.items.add(i); let p = x.pa.get(ym); if (!p) x.pa.set(ym, (p = new Set())); p.add(i); }
    if (ym >= qs) { if (NS(it)) x.nsQ.add(it.v); if (HILO(it)) x.hlQ.add(it.v); }
  }
  const n = end - st + 1;
  for (const x of res.values()) {
    x.avg = x.ytd / n; x.avgLy = x.ly / 12; x.gAvg = gr(x.avg, x.avgLy); x.gYtd = gr(x.ytd, x.lyYtd);
    x.assort = x.items.size; x.avgPa = sum([...x.pa.values()].map((p) => p.size)) / n; x.pctPa = div(x.avgPa, x.assort);
    x.f3 = x.ord.size; x.f12 = x.ord12.size; x.mainSales = [...x.sales.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  return res;
}
const lastOrderDate = (code) => { if (code < 0) return 'n.a.'; const ym = Math.floor(code / 100), d = code % 100; return yOf(ym) + '-' + String(mOf(ym)).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };

// ---------- kuartal / DPI ----------
function quarter(table, f, y, q, endM) {
  // dari awal kuartal sampai endM (bulan filter) atau akhir kuartal
  const a = ymOf(y, (q - 1) * 3 + 1), b = Math.min(ymOf(y, q * 3), endM == null ? 1e9 : endM, CLOSE_YM);
  if (b < a) return null;
  const o = { net: 0, hilo: 0, tea: 0, eaAll: new Set(), eaNs: new Map(), eaHl: new Map(), eaSchool: new Set(), eaTea: new Set(), pairs: new Set(), lineMon: new Map() };
  for (const r of D[table]) {
    const s = r[0], oi = r[1], i = r[2], ym = r[3];
    if (ym < a || ym > b) continue;
    if ((f.cab !== 'ALL' && OUT[oi].cab !== f.cab) || (f.sales >= 0 && s !== f.sales)) continue;
    const it = ITEM[i];
    o.net += r[4]; if (HILO(it)) o.hilo += r[4]; if (it.tea) o.tea += r[4];
    if (!r[6]) continue;
    o.eaAll.add(oi); o.pairs.add(oi * 2000 + i);
    let lm = o.lineMon.get(ym); if (!lm) o.lineMon.set(ym, (lm = { o: new Set(), l: new Set() })); lm.o.add(oi); lm.l.add(oi * 2000 + i);
    if (NS(it)) { let v = o.eaNs.get(oi); if (!v) o.eaNs.set(oi, (v = new Set())); v.add(it.v); }
    if (HILO(it)) { let v = o.eaHl.get(oi); if (!v) o.eaHl.set(oi, (v = new Set())); v.add(it.v); }
    if (it.school) o.eaSchool.add(oi); if (it.tea) o.eaTea.add(oi);
  }
  const hlMin = (oi) => HILO_MIN[OUT[oi].cab] || 3;
  let ns10 = 0, ns59 = 0, hlT = 0, hlNear = 0;
  for (const v of o.eaNs.values()) { if (v.size >= 10) ns10++; else if (v.size >= 5) ns59++; }
  for (const [oi, v] of o.eaHl) { if (v.size >= hlMin(oi)) hlT++; else hlNear++; }
  const lineEa = mean([...o.lineMon.values()].map((x) => div(x.l.size, x.o.size)));
  return { a, b, net: o.net, hilo: o.hilo, tea: o.tea, ea: o.eaAll.size, eaNs: o.eaNs.size, ns10, ns59, eaHl: o.eaHl.size, hlT, hlNear,
    eaSchool: o.eaSchool.size, eaTea: o.eaTea.size, lineEa, lineRo: div(o.pairs.size, o.eaAll.size), outlets: o.eaAll, nsSets: o.eaNs, hlSets: o.eaHl };
}
const qLabel = (q, a, b) => 'Q' + q + ' ' + BLN[a % 12] + (a === b ? '' : '–' + BLN[b % 12]) + ' ' + yOf(a);

// ---------- master FJP ----------
function fjpEligible(cab, salesIdx) {
  return D.fjp.filter((r) => !r.noo && (cab === 'ALL' || r.cab === cab) && (salesIdx < 0 || (r.o >= 0 && OUT[r.o] && outletOwner(r.o) === salesIdx)));
}
let OWNER = null;
function outletOwner(o) {
  if (!OWNER) { OWNER = new Map(); const acc = new Map();
    for (const r of D.gt) { if (r[3] < CLOSE_YM - 11) continue; const k = r[1]; let m = acc.get(k); if (!m) acc.set(k, (m = new Map())); m.set(r[0], (m.get(r[0]) || 0) + Math.abs(r[4])); }
    for (const [o, m] of acc) OWNER.set(o, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]); }
  return OWNER.get(o);
}

// ---------- unduhan ----------
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function downloadCsv(name, header, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  download(name.replace(/[^\w.-]+/g, '_') + '.csv', txt, 'text/csv;charset=utf-8');
}

/* Grafik SVG ringan: garis multi-seri + target, tooltip, unduh JPG & CSV, perbesar. */
'use strict';
const YEAR_COLOR = { 2023: '#b8c2d1', 2024: '#7d8ba1', 2025: '#f08c2e', 2026: '#4f46e5', 2027: '#0f9d8a' };
const SERIES_COLORS = ['#4f46e5', '#f08c2e', '#0f9d8a', '#c2417a', '#7a5af5', '#7d8ba1', '#d4a514'];
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function niceMax(v) { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

function drawLine(box, cfg) {
  box.replaceChildren();
  const W = Math.max(cfg.minWidth || 0, box.clientWidth || 600), H = cfg.height || 200;
  const vals = cfg.series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v));
  if (cfg.target != null) vals.push(cfg.target);
  const lo = Math.min(0, ...vals), hi = niceMax(Math.max(...vals, 0) * 1.05);
  const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'pj-svg', role: 'img', 'aria-label': cfg.title || '' }, box);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }, svg);
  const fmt = cfg.axisFmt || cfg.fmt;
  const probe = el('text', { class: 'pj-ax' }, svg);
  let lw = 0; for (const t of ticks) { probe.textContent = fmt(t); lw = Math.max(lw, probe.getComputedTextLength ? probe.getComputedTextLength() : 40); }
  probe.remove();
  const mg = { l: Math.ceil(lw) + 12, r: 14, t: 12, b: 28 };
  const n = cfg.labels.length, iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
  const x = (i) => mg.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v) => mg.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  for (const t of ticks) {
    el('line', { x1: mg.l, x2: W - mg.r, y1: y(t), y2: y(t), stroke: '#e6ebf2', 'stroke-width': 1 }, svg);
    const tx = el('text', { x: mg.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'pj-ax' }, svg); tx.textContent = fmt(t);
  }
  const step = Math.max(1, Math.ceil(n / Math.floor(iw / 46)));
  cfg.labels.forEach((l, i) => { if (i % step) return; const t = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'pj-ax' }, svg); t.textContent = l; });
  if (cfg.target != null) {
    el('line', { x1: mg.l, x2: W - mg.r, y1: y(cfg.target), y2: y(cfg.target), stroke: '#f08c2e', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
  }
  cfg.series.forEach((s) => {
    let d = '', pen = false;
    s.values.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; });
    el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.bold ? 2.6 : 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    s.values.forEach((v, i) => { if (v != null && isFinite(v) && n <= 60) el('circle', { cx: x(i), cy: y(v), r: s.bold ? 3 : 2.2, fill: s.color }, svg); });
  });
  // tooltip
  const tip = h('div', 'pj-tip'); tip.hidden = true; box.append(tip);
  const guide = el('line', { y1: mg.t, y2: mg.t + ih, stroke: '#9aa7b8', 'stroke-width': 1, opacity: 0 }, svg);
  const hit = el('rect', { x: mg.l, y: mg.t, width: iw, height: ih, fill: 'transparent' }, svg);
  const show = (ev) => {
    const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - mg.l) / (iw || 1)) * (n - 1))));
    guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1);
    tip.replaceChildren(h('div', 'pj-tip-h', cfg.tipLabels ? cfg.tipLabels[i] : cfg.labels[i]));
    cfg.series.forEach((s) => { const v = s.values[i]; if (v == null) return; const row = h('div'); const sw = h('i', 'pj-sw'); sw.style.background = s.color; row.append(sw, document.createTextNode(s.name + ': ' + (cfg.tipFmt || cfg.fmt)(v))); tip.append(row); });
    if (cfg.target != null) tip.append(h('div', 'pj-tip-t', 'Target: ' + cfg.fmt(cfg.target)));
    tip.hidden = false;
    const bx = box.getBoundingClientRect(); const left = ev.clientX - bx.left + box.scrollLeft + 14;
    tip.style.left = Math.min(left, box.scrollWidth - tip.offsetWidth - 4) + 'px'; tip.style.top = '8px';
  };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerenter', show);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; guide.setAttribute('opacity', 0); });
}

function drawBar(box, cfg) {
  box.replaceChildren();
  const W = Math.max(cfg.minWidth || 0, box.clientWidth || 600), H = cfg.height || 200;
  const vals = cfg.series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v));
  const lo = Math.min(0, ...vals), hi = niceMax(Math.max(...vals, 0) * 1.12);
  const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'pj-svg', role: 'img', 'aria-label': cfg.title || '' }, box);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }, svg);
  const fmt = cfg.axisFmt || cfg.fmt; const probe = el('text', { class: 'pj-ax' }, svg); let lw = 0;
  for (const t of ticks) { probe.textContent = fmt(t); lw = Math.max(lw, probe.getComputedTextLength ? probe.getComputedTextLength() : 40); } probe.remove();
  const mg = { l: Math.ceil(lw) + 12, r: 10, t: 16, b: 28 }, iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
  const n = cfg.labels.length, k = cfg.series.length, band = iw / n, inner = band * 0.78, bw = Math.min(30, inner / k);
  const y = (v) => mg.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  for (const t of ticks) { el('line', { x1: mg.l, x2: W - mg.r, y1: y(t), y2: y(t), stroke: '#e6ebf2' }, svg); const tx = el('text', { x: mg.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'pj-ax' }, svg); tx.textContent = fmt(t); }
  cfg.labels.forEach((l, i) => { const t = el('text', { x: mg.l + band * i + band / 2, y: H - 8, 'text-anchor': 'middle', class: 'pj-ax' }, svg); t.textContent = l; });
  const x0 = (i) => mg.l + band * i + (band - bw * k) / 2;
  cfg.series.forEach((s, j) => s.values.forEach((v, i) => { if (v == null || !isFinite(v)) return; const yy = y(Math.max(v, 0)), hh = Math.abs(y(v) - y(0));
    el('rect', { x: x0(i) + j * bw + 1, y: yy, width: Math.max(1, bw - 2), height: Math.max(hh, 0.5), rx: 3, fill: s.color }, svg); }));
  const tip = h('div', 'pj-tip'); tip.hidden = true; box.append(tip);
  const hit = el('rect', { x: mg.l, y: mg.t, width: iw, height: ih, fill: 'transparent' }, svg);
  const show = (ev) => { const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W; const i = Math.max(0, Math.min(n - 1, Math.floor((px - mg.l) / band)));
    tip.replaceChildren(h('div', 'pj-tip-h', cfg.tipLabels ? cfg.tipLabels[i] : cfg.labels[i]));
    cfg.series.forEach((s) => { const v = s.values[i]; if (v == null) return; const row = h('div'); const sw = h('i', 'pj-sw'); sw.style.background = s.color; row.append(sw, document.createTextNode(s.name + ': ' + (cfg.tipFmt || cfg.fmt)(v))); tip.append(row); });
    tip.hidden = false; const bx = box.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - bx.left + 14, box.clientWidth - tip.offsetWidth - 4) + 'px'; tip.style.top = '8px'; };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', () => { tip.hidden = true; });
}

// kartu grafik dengan judul, legenda, tombol Perbesar / JPG / Excel
function chartCard(parent, cfg) {
  const card = h('article', 'pj-card pj-chart-card');
  const top = h('div', 'pj-card-top');
  const ttl = h('div'); ttl.append(h('p', 'pj-eyebrow', cfg.eyebrow || ''), h('h3', 'pj-card-title', cfg.title));
  const right = h('div', 'pj-card-actions');
  const bdg = cfg.badge || cfg.unit; if (bdg) right.append(h('span', 'pj-badge', bdg));
  const bz = h('button', 'pj-mini', 'Perbesar'), bj = h('button', 'pj-mini', 'JPG'), bx = h('button', 'pj-mini', 'Excel');
  right.append(bz, bj, bx); top.append(ttl, right); card.append(top);
  if (cfg.note) card.append(h('p', 'pj-note', cfg.note));
  const box = h('div', 'pj-chart' + (cfg.scroll ? ' pj-scroll' : '')); card.append(box);
  const leg = h('div', 'pj-legend');
  cfg.series.forEach((s) => { const it = h('span'); const sw = h('i', 'pj-sw'); sw.style.background = s.color; it.append(sw, document.createTextNode(s.name)); leg.append(it); });
  if (cfg.target != null) { const it = h('span'); const sw = h('i', 'pj-sw pj-sw-dash'); it.append(sw, document.createTextNode('Target ' + cfg.fmt(cfg.target))); leg.append(it); }
  card.append(leg); parent.append(card);
  const draw = () => (cfg.type === 'bar' ? drawBar : drawLine)(box, cfg);
  requestAnimationFrame(draw);
  REDRAW.add(draw);
  bx.addEventListener('click', () => downloadCsv(cfg.title, ['Periode', ...cfg.series.map((s) => s.name)], cfg.labels.map((l, i) => [cfg.tipLabels ? cfg.tipLabels[i] : l, ...cfg.series.map((s) => (s.values[i] == null ? '' : String(Math.round(s.values[i] * 10000) / 10000).replace('.', ',')))])));
  bj.addEventListener('click', () => svgToJpg(box.querySelector('svg'), cfg.title));
  bz.addEventListener('click', () => openModal(cfg));
  return card;
}
const REDRAW = new Set();
let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => REDRAW.forEach((f) => { try { f(); } catch (e) { REDRAW.delete(f); } }), 150); });

function svgToJpg(svg, name) {
  if (!svg) return;
  const clone = svg.cloneNode(true);
  const st = document.createElementNS(SVGNS, 'style'); st.textContent = ".pj-ax{font:11px Poppins,Arial,sans-serif;fill:#5b6b80}"; clone.prepend(st);
  const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2 + 60; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#0f2a4a'; g.font = '600 28px Poppins, Arial'; g.fillText(name, 24, 40);
    g.drawImage(img, 0, 60, W * 2, H * 2); URL.revokeObjectURL(url);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name.replace(/[^\w.-]+/g, '_') + '.jpg'; a.click(); }, 'image/jpeg', 0.92); };
  img.src = url;
}
function openModal(cfg) {
  const ov = h('div', 'pj-modal'); const inner = h('div', 'pj-modal-in'); const close = h('button', 'pj-mini', 'Tutup');
  const head = h('div', 'pj-card-top'); head.append(h('h3', 'pj-card-title', cfg.title), close);
  const box = h('div', 'pj-chart'); inner.append(head, box); ov.append(inner); document.body.append(ov);
  const c2 = Object.assign({}, cfg, { height: Math.min(520, window.innerHeight - 160) });
  requestAnimationFrame(() => (c2.type === 'bar' ? drawBar : drawLine)(box, c2));
  const done = () => ov.remove();
  close.addEventListener('click', done); ov.addEventListener('click', (e) => { if (e.target === ov) done(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { done(); document.removeEventListener('keydown', esc); } });
}

/* Komponen UI bersama: kartu KPI, section, tabel dengan cari/urut/unduh. */
'use strict';
function section(parent, eyebrow, title, badge, cls) {
  const s = h('section', 'pj-sec' + (cls ? ' ' + cls : ''));
  const top = h('div', 'pj-sec-top'); const t = h('div');
  t.append(h('p', 'pj-eyebrow', eyebrow), h('h2', 'pj-sec-title', title)); top.append(t);
  if (badge) top.append(h('span', 'pj-pill', badge));
  s.append(top); parent.append(s); return s;
}
// status: 'good' | 'bad' | 'warn' | ''
function kpi(parent, label, value, sub, status, accent) {
  const c = h('div', 'pj-kpi' + (status ? ' pj-' + status : '') + (accent ? ' pj-acc-' + accent : ''));
  c.append(h('p', 'pj-kpi-l', label), h('p', 'pj-kpi-v', value), h('p', 'pj-kpi-s', sub || ''));
  parent.append(c); return c;
}
const grid = (parent, cls) => { const g = h('div', 'pj-grid ' + (cls || '')); parent.append(g); return g; };
const stat = (v, target, lowerBetter) => (v == null || !isFinite(v) ? '' : (lowerBetter ? v < target : v >= target) ? 'good' : 'bad');
const gstat = (v) => (v == null || !isFinite(v) ? '' : v >= 0 ? 'good' : 'bad');

/* table(parent, {title, cols:[{k, l, f, num, cls}], rows:[obj], key, search, sort, top, download, rowClick, note}) */
function table(parent, cfg) {
  const wrap = h('div', 'pj-tbl-wrap');
  const bar = h('div', 'pj-tbl-bar');
  let q = '', sortK = cfg.sort || null, sortDir = cfg.asc ? 1 : -1, topN = cfg.top || 0;
  if (cfg.search) { const inp = h('input', 'pj-input'); inp.type = 'search'; inp.placeholder = cfg.search; inp.addEventListener('input', () => { q = inp.value.toLowerCase(); render(); }); bar.append(inp); }
  if (cfg.topOptions) {
    const sel = h('select', 'pj-select pj-select-sm');
    cfg.topOptions.forEach(([v, l]) => sel.append(new Option(l, v))); sel.value = String(topN);
    sel.addEventListener('change', () => { topN = +sel.value; render(); }); bar.append(sel);
  }
  const info = h('span', 'pj-tbl-info'); bar.append(info);
  if (cfg.download !== false) { const b = h('button', 'pj-mini', 'Excel'); b.addEventListener('click', () => {
    downloadCsv(cfg.download || cfg.title || 'tabel', cfg.cols.map((c) => c.l), view().map((r) => cfg.cols.map((c) => { const v = r[c.k]; return typeof v === 'number' ? String(Math.round(v * 10000) / 10000).replace('.', ',') : v == null ? '' : v; })));
  }); bar.append(b); }
  wrap.append(bar);
  const box = h('div', 'pj-tbl-box' + (cfg.tall ? ' pj-tall' : '')); const t = h('table', 'pj-tbl'); box.append(t); wrap.append(box);
  if (cfg.note) wrap.append(h('p', 'pj-note', cfg.note));
  parent.append(wrap);
  const view = () => {
    let r = cfg.rows;
    if (q) r = r.filter((x) => cfg.cols.some((c) => String(x[c.k] ?? '').toLowerCase().includes(q)));
    if (sortK) r = [...r].sort((a, b) => { const x = a[sortK], y = b[sortK]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sortDir; });
    return r;
  };
  function render() {
    const r = view(); const shown = topN ? r.slice(0, topN) : r;
    info.textContent = shown.length + ' dari ' + cfg.rows.length + ' baris';
    const thead = h('thead'); const tr = h('tr');
    cfg.cols.forEach((c) => { const th = h('th', c.num ? 'pj-num' : ''); const b = h('button', 'pj-th', c.l + (sortK === c.k ? (sortDir < 0 ? ' ▾' : ' ▴') : ''));
      b.addEventListener('click', () => { if (sortK === c.k) sortDir *= -1; else { sortK = c.k; sortDir = c.num ? -1 : 1; } render(); }); th.append(b); tr.append(th); });
    thead.append(tr);
    const tb = h('tbody');
    for (const x of shown) {
      const row = h('tr'); if (cfg.rowClass) row.className = cfg.rowClass(x) || '';
      cfg.cols.forEach((c) => { const td = h('td', (c.num ? 'pj-num ' : '') + (c.cls ? (typeof c.cls === 'function' ? c.cls(x) : c.cls) : '')); td.textContent = c.f ? c.f(x[c.k], x) : x[c.k] ?? ''; row.append(td); });
      if (cfg.rowClick) { row.classList.add('pj-click'); row.addEventListener('click', () => cfg.rowClick(x)); }
      tb.append(row);
    }
    t.replaceChildren(thead, tb);
  }
  render();
  return wrap;
}
const gcls = (v) => (v == null || !isFinite(v) ? '' : v >= 0 ? 'pj-up' : 'pj-down');

/* Halaman General Trade */
'use strict';
const YEARS = []; for (let y = Y0; y <= yOf(CLOSE_YM); y++) YEARS.push(y);
const gtF = () => ({ cab: S.cab, sales: S.sales, brand: S.brand });
const maxM = (y) => (y === yOf(CLOSE_YM) ? mOf(CLOSE_YM) : 12);
const scopeName = () => (S.sales >= 0 ? SALES[S.sales].n : 'Total Cabang ' + CABNAMA[S.cab]);
const brandName = () => (S.brand === 'ALL' ? 'Semua Merek' : S.brand);
const ytdLabel = () => 'Januari–' + BULAN[S.month - 1] + ' ' + S.year;

// deret per tahun: tahun sebelum tahun filter penuh, tahun filter sampai bulan filter
function yearSeries(fn, upToYear = S.year) {
  return YEARS.filter((y) => y <= upToYear).map((y) => ({
    name: String(y), color: YEAR_COLOR[y], bold: y === upToYear,
    values: BLN.map((_, i) => { const ym = ymOf(y, i + 1); if (ym > CLOSE_YM || (y === upToYear && i + 1 > S.month)) return null; return fn(ym); }),
  }));
}

function pageHead(root, title) {
  const hd = h('div', 'pj-page-head');
  const l = h('div'); l.append(h('p', 'pj-eyebrow', CABNAMA[S.cab] + ' · ' + brandName()), h('h1', 'pj-page-title', title + ' · ' + scopeName()));
  hd.append(l, h('p', 'pj-page-meta', 'Filter aktif: ' + BULAN[S.month - 1] + ' ' + S.year + (ymOf(S.year, S.month) === CLOSE_YM ? (D.meta.partial ? ' · data berjalan s.d. ' + D.meta.closing.split('-').reverse().join('-') + ' (belum closing)' : ' · data closing') : '')));
  root.append(hd);
}

function kpiBlocks(root, sc, sm) {
  const y = S.year, m = S.month, t = ytd(sc, y, m, sm);
  const s1 = section(root, 'Performa YTD', ytdLabel(), 'Akumulasi & rata-rata', 'pj-line-blue');
  const g1 = grid(s1, 'pj-g5');
  kpi(g1, 'Total Omzet ' + y, F.rp(t.total), BLN[0] + '–' + BLN[m - 1] + ' · ' + t.n + ' bulan');
  kpi(g1, 'AVG Omzet ' + y, F.rp(t.avg), 'Rata-rata/bulan');
  kpi(g1, 'AVG EA ' + y, F.n1(t.avgEa), 'Target ≥' + BENCH.avgEa, sm ? stat(t.avgEa, BENCH.avgEa) : '');
  kpi(g1, 'EA/RO ' + y, F.pct(t.eaRo), 'Target ≥40%', stat(t.eaRo, BENCH.eaRo));
  kpi(g1, 'RO ' + y, F.n(t.ro), 'Distinct outlet YTD');
  kpi(g1, 'EC/day ' + y, F.n2(t.ecday), 'Target ≥' + BENCH.ecDay, stat(t.ecday, BENCH.ecDay));
  kpi(g1, 'Line/EA ' + y, F.n2(t.lineEa), 'Rata-rata bulanan');
  kpi(g1, 'Line/RO ' + y, F.n2(t.lineRo), 'Distinct SKU/outlet');
  kpi(g1, 'F3=0 ' + y, F.n(t.f3), 'Jumlah outlet');
  kpi(g1, 'F3=0 % ' + y, F.pct(t.f3pct), 'Target <20%', stat(t.f3pct, BENCH.f3, true));
  const ym = ymOf(y, m), mo = month(sc, ym);
  const s2 = section(root, 'Performa bulan terpilih', BULAN[m - 1] + ' ' + y, 'Satu bulan', 'pj-line-orange');
  const g2 = grid(s2, 'pj-g6');
  kpi(g2, 'Omzet ' + BULAN[m - 1], F.rp(mo.net), 'Net DPP');
  kpi(g2, 'EA ' + BULAN[m - 1], F.n(mo.ea), 'Distinct outlet');
  kpi(g2, 'EC ' + BULAN[m - 1], F.n(mo.ec), 'Distinct outlet per hari');
  kpi(g2, 'EC/day ' + BULAN[m - 1], F.n2(mo.ecday), 'Target ≥' + BENCH.ecDay, stat(mo.ecday, BENCH.ecDay));
  kpi(g2, 'Line/EA ' + BULAN[m - 1], F.n2(mo.lineEa), 'Distinct SKU ÷ EA');
  kpi(g2, 'EA/RO ' + BULAN[m - 1], F.pct(mo.eaRo), 'EA bulan ÷ RO YTD', stat(mo.eaRo, BENCH.eaRo));
  return t;
}
function annualAndGrowth(root, sc, sm) {
  const y = S.year, m = S.month;
  const two = grid(root, 'pj-two');
  const a = section(two, 'Perbandingan tahunan', 'Perbandingan YTD s.d. ' + BULAN[m - 1], 'Periode sebanding');
  const rows = YEARS.filter((yy) => yy <= y).map((yy) => { const t = ytd(sc, yy, m, sm); return { tahun: String(yy), total: t.total, avg: t.avg, avgEa: t.avgEa, eaRo: t.eaRo, ro: t.ro, ecday: t.ecday, lineEa: t.lineEa, lineRo: t.lineRo, f3: t.f3pct }; });
  table(a, { download: 'Perbandingan tahunan', cols: [
    { k: 'tahun', l: 'Tahun' }, { k: 'total', l: 'Total omzet', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rp, num: 1 }, { k: 'avgEa', l: 'AVG EA', f: F.n1, num: 1 },
    { k: 'eaRo', l: 'EA/RO', f: (v) => F.pct(v), num: 1 }, { k: 'ro', l: 'RO', f: (v) => F.n(v), num: 1 }, { k: 'ecday', l: 'EC/day', f: F.n2, num: 1 },
    { k: 'lineEa', l: 'Line/EA', f: F.n2, num: 1 }, { k: 'lineRo', l: 'Line/RO', f: F.n2, num: 1 }, { k: 'f3', l: 'F3=0', f: (v) => F.pct(v), num: 1 }], rows });
  const gsec = section(two, 'Omzet', 'Growth monitor', BLN[m - 1] + ' ' + y);
  const g = growth(sc, y, m, sm); const gg = grid(gsec, 'pj-g2');
  kpi(gg, 'Growth ' + BULAN[m - 1] + ' vs AP3M', F.g(g.ap3m), 'vs rata-rata 3 bulan sebelumnya', gstat(g.ap3m));
  kpi(gg, 'Growth ' + BULAN[m - 1] + ' vs AP3M12M', F.g(g.ap3m12m), '(AP3M + AVG 12 bulan) ÷ 2', gstat(g.ap3m12m));
  kpi(gg, 'Growth AVG', F.g(g.avg), 'AVG YTD vs AVG ' + (y - 1) + ' penuh', gstat(g.avg));
  kpi(gg, 'Growth YTD', F.g(g.ytd), 'vs periode sama ' + (y - 1), gstat(g.ytd));
  kpi(gg, 'Growth PTD vs ' + BULAN[m - 1] + ' ' + (y - 1), F.g(g.ptd), 'Bulan sama tahun lalu', gstat(g.ptd));
  kpi(gg, 'Growth YoY', F.g(g.yoy), 'Rolling 12 bulan', gstat(g.yoy));
}
function monthlyCharts(root, sc) {
  const cg = grid(root, 'pj-charts');
  chartCard(cg, { eyebrow: 'Aktivasi outlet', title: 'EA per bulan', badge: 'Target ' + BENCH.avgEa, target: S.sales >= 0 ? BENCH.avgEa : null, labels: BLN, tipLabels: BULAN, fmt: F.n1, axisFmt: (v) => F.n(v), series: yearSeries((ym) => mget(sc, ym).ea) });
  chartCard(cg, { eyebrow: 'Distribusi item', title: 'Line/EA per bulan', badge: 's.d. bulan filter', labels: BLN, tipLabels: BULAN, fmt: F.n2, series: yearSeries((ym) => div(mget(sc, ym).line, mget(sc, ym).ea)) });
  chartCard(cg, { eyebrow: 'Produktivitas', title: 'EC/day per bulan', badge: 'Target ' + BENCH.ecDay, target: BENCH.ecDay, labels: BLN, tipLabels: BULAN, fmt: F.n2, axisFmt: F.n1, series: yearSeries((ym) => div(mget(sc, ym).ec, mget(sc, ym).days)) });
  chartCard(cg, { eyebrow: 'Aktivasi outlet', title: 'EA/RO berjalan', badge: 'Target 40%', target: BENCH.eaRo, labels: BLN, tipLabels: BULAN, fmt: (v) => F.pct(v), axisFmt: (v) => F.pct(v, 0), series: yearSeries((ym) => div(mget(sc, ym).ea, roAt(sc, ym).ro)) });
  chartCard(cg, { eyebrow: 'Omzet bulanan', title: 'Tren net DPP', badge: 'Rp juta', labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: yearSeries((ym) => mget(sc, ym).net) });
}
function weeklyChart(root) {
  const f = gtF(); const byKey = new Map();
  for (const r of D.gtDaily) {
    const s = r[0]; if ((f.cab !== 'ALL' && D.cabs[r[4]] !== f.cab) || (f.sales >= 0 && s !== f.sales)) continue;
    if (f.brand !== 'ALL' && D.brands[r[1]] !== f.brand) continue;
    const dt = new Date(Date.UTC(2023, 0, 1 + r[2])); const y = dt.getUTCFullYear(); if (y < S.year - 1 || y > S.year) continue;
    if (dt.getUTCDay() === 0) continue;
    const mo = dt.getUTCMonth(); let w = 1;
    for (let d = 1; d < dt.getUTCDate(); d++) if (new Date(Date.UTC(y, mo, d)).getUTCDay() === 6) w++;
    const k = BLN[mo] + '-W' + w; let o = byKey.get(k); if (!o) byKey.set(k, (o = { mo, w, v: {} })); o.v[y] = (o.v[y] || 0) + r[3];
  }
  const keys = [...byKey.values()].sort((a, b) => a.mo - b.mo || a.w - b.w);
  const labels = keys.map((k) => BLN[k.mo] + '-W' + k.w);
  const series = [S.year - 1, S.year].filter((y) => y >= Y0).map((y) => ({ name: String(y), color: YEAR_COLOR[y], bold: y === S.year, values: keys.map((k) => (y === S.year && k.mo + 1 > S.month ? null : k.v[y] ?? null)) }));
  chartCard(root, { eyebrow: 'Omzet mingguan', title: 'Omzet per workweek', note: 'Minggu kerja Senin–Sabtu, reset setiap awal bulan. Hari Minggu tidak dihitung. Geser grafik untuk melihat periode lain.', labels, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series, scroll: true, minWidth: Math.max(900, labels.length * 18) });
}

function actionCenter(root, sc, sm) {
  const y = S.year, m = S.month, q = Math.floor((m - 1) / 3) + 1;
  const Q = quarter('gt', gtF(), y, q, ymOf(y, m));
  const t = ytd(sc, y, m, sm);
  const os = outletStats('gt', gtF(), y, m);
  const topLimit = S.sales >= 0 ? 20 : 100;
  const top = [...os.values()].filter((x) => x.ytd > 0).sort((a, b) => b.avg - a.avg).slice(0, topLimit);
  const neg = top.filter((x) => x.gAvg != null && x.gAvg < 0);
  const elig = fjpEligible(S.cab, S.sales);
  const belum = elig.filter((r) => r.o < 0 || !Q || !Q.outlets.has(r.o));
  // sales KPI gap
  const actSales = SALES.filter((s) => (S.cab === 'ALL' || s.cab === S.cab) && (S.sales < 0 || s.i === S.sales)).filter((s) => mget(scope('gt', { cab: s.cab, sales: s.i, brand: 'ALL' }), ymOf(y, m)).ea > 0);
  const gap = actSales.filter((s) => { const tt = ytd(scope('gt', { cab: s.cab, sales: s.i, brand: 'ALL' }), y, m, true); return tt.ecday < BENCH.ecDay || tt.avgEa < BENCH.avgEa || tt.eaRo < BENCH.eaRo; });
  const hlLbl = S.cab === 'MAMUJU' ? '≥3' : S.cab === 'PAREPARE' ? '≥5' : '≥5 / ≥3';
  const s = section(root, 'Action center', 'Prioritas ' + CABNAMA[S.cab] + (Q ? ' · ' + qLabel(q, Q.a, Q.b) : ''), 'Dinamis mengikuti filter', 'pj-line-red');
  const g = grid(s, 'pj-g4');
  if (Q) {
    kpi(g, 'NS ≥10 varian', F.n(Q.ns10) + ' / ' + F.n(Q.ea), F.pct(div(Q.ns10, Q.ea)) + ' · target 40%', stat(div(Q.ns10, Q.ea), BENCH.nsPct));
    kpi(g, 'HiLo ' + hlLbl + ' varian', F.n(Q.hlT) + ' / ' + F.n(Q.ea), F.pct(div(Q.hlT, Q.ea)) + ' · target 50%', stat(div(Q.hlT, Q.ea), BENCH.hiloPct));
  }
  kpi(g, 'Growth AVG negatif', F.n(neg.length), 'Dari Top ' + topLimit + ' outlet AVG omzet', neg.length ? 'bad' : 'good');
  kpi(g, 'F3=0', F.n(t.f3), 'RO YTD tanpa transaksi 3 bulan', stat(t.f3pct, BENCH.f3, true));
  kpi(g, 'Belum transaksi Q' + q, F.n(belum.length), 'Dari ' + F.n(elig.length) + ' outlet master FJP eligible', belum.length ? 'warn' : 'good');
  if (Q) { kpi(g, 'NS 5–9 varian', F.n(Q.ns59), 'Dekat target ≥10 varian', 'warn'); kpi(g, 'HiLo di bawah target', F.n(Q.hlNear), 'Sudah beli HiLo, varian < target', 'warn'); }
  kpi(g, 'Sales KPI gap', F.n(gap.length), 'EC/day, AVG EA, atau EA/RO di bawah benchmark', gap.length ? 'bad' : 'good');
  const nb = section(root, 'Next best action', 'Urutan fokus eksekusi', 'Dampak tertinggi lebih dulu');
  const list = h('ol', 'pj-nba');
  const add = (p, t1, t2) => { const li = h('li'); li.append(h('span', 'pj-pill pj-pill-' + (p === 'Coaching' ? 'c' : p.slice(-1)), p), h('b', '', t1), h('span', '', t2)); list.append(li); };
  if (Q) add('Prioritas 1', 'Perluas depth Nutrisari', 'Gap menuju target 40%: ' + F.n(Math.max(0, Math.ceil(Q.ea * BENCH.nsPct) - Q.ns10)) + ' outlet. Mulai dari ' + F.n(Q.ns59) + ' outlet yang sudah 5–9 varian.');
  if (Q) add('Prioritas 1', 'Perluas depth HiLo', 'Gap menuju target 50%: ' + F.n(Math.max(0, Math.ceil(Q.ea * BENCH.hiloPct) - Q.hlT)) + ' outlet.');
  add('Prioritas 2', 'Pulihkan outlet bernilai tinggi', 'Review ' + F.n(neg.length) + ' outlet growth AVG negatif dengan AVG omzet terbesar (tab Outlet Performance).');
  add('Prioritas 2', 'Aktifkan outlet pasif', F.n(belum.length) + ' outlet master belum transaksi pada Q' + q + '; ' + F.n(t.f3) + ' outlet F3=0.');
  add('Coaching', 'Tutup gap produktivitas sales', F.n(gap.length) + ' sales aktif masih di bawah sedikitnya satu benchmark' + (gap.length ? ': ' + gap.map((x) => x.n).join(', ') : '') + '.');
  nb.append(list);
}
function branchComparison(root) {
  const y = S.year, m = S.month;
  const s = section(root, 'Branch comparison', 'Parepare vs Mamuju · ' + BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Merek mengikuti filter');
  const rows = ['PAREPARE', 'MAMUJU', 'ALL'].map((c) => { const sc = scope('gt', { cab: c, sales: -1, brand: S.brand }); const t = ytd(sc, y, m, false); const g = growth(sc, y, m, false);
    return { cab: c === 'ALL' ? 'TOTAL 2 CABANG' : CABNAMA[c], total: t.total, avg: t.avg, gy: g.ytd, avgEa: t.avgEa, ro: t.ro, eaRo: t.eaRo, ecday: t.ecday, lineEa: t.lineEa, lineRo: t.lineRo, f3: t.f3pct }; });
  table(s, { download: 'Branch comparison', cols: [{ k: 'cab', l: 'Cabang' }, { k: 'total', l: 'Total omzet', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rp, num: 1 },
    { k: 'gy', l: 'Growth YTD', f: F.g, num: 1, cls: (x) => gcls(x.gy) }, { k: 'avgEa', l: 'AVG EA', f: F.n1, num: 1 }, { k: 'ro', l: 'RO', f: (v) => F.n(v), num: 1 }, { k: 'eaRo', l: 'EA/RO', f: (v) => F.pct(v), num: 1 },
    { k: 'ecday', l: 'EC/day', f: F.n2, num: 1 }, { k: 'lineEa', l: 'Line/EA', f: F.n2, num: 1 }, { k: 'lineRo', l: 'Line/RO', f: F.n2, num: 1 }, { k: 'f3', l: 'F3=0', f: (v) => F.pct(v), num: 1 }], rows });
}
function dataHealth(root) {
  const s = section(root, 'Data health & freshness', 'Kesiapan data · rekonsiliasi closing', 'Dihitung ulang dari file');
  const g = grid(s, 'pj-g4');
  const rk = D.rekon.filter((r) => S.cab === 'ALL' || r.cab === S.cab);
  kpi(g, 'Tanggal transaksi terakhir', D.meta.closing, D.meta.partial ? 'Update berjalan, belum closing' : 'Sesuai closing', D.meta.partial ? 'warn' : 'good');
  kpi(g, 'Periode sumber', ymLabel(CLOSE_YM), D.meta.partial ? 'Belum closing' : 'Closing');
  kpi(g, 'Baris bulan closing', F.n(sum(rk.map((r) => r.rows))), F.n(sum(rk.map((r) => r.sales_rows))) + ' sales · ' + F.n(sum(rk.map((r) => r.retur_rows))) + ' retur');
  const elig = fjpEligible(S.cab, -1);
  kpi(g, 'Master FJP eligible', F.n(elig.length), 'Tanpa slot NOO · ' + F.n(elig.filter((r) => r.o < 0).length) + ' belum pernah transaksi');
  // rekonsiliasi: hasil dashboard vs kontrol DATABASE
  const rows = [];
  for (const r of rk) { const sc = scope('gt', { cab: r.cab, sales: -1, brand: 'ALL' }); const x = mget(sc, CLOSE_YM);
    for (const [u, dv, kv] of [['Gross Sales GT', x.gross, r.gross], ['Omzet Retur GT', x.ret, r.retur], ['Omzet net GT', x.net, r.net], ['EA GT', x.ea, r.ea]]) {
      const sel = Math.round((dv - kv) * 100) / 100; rows.push({ cab: CABNAMA[r.cab], u, dv, kv, sel, st: Math.abs(sel) < 0.01 ? 'Cocok' : 'Beda' }); } }
  table(s, { title: 'Rekonsiliasi', download: 'Rekonsiliasi closing', note: 'Dashboard = dihitung dari transaksi di file ini. DATABASE = dihitung langsung dari sheet DATABASE saat file dibuat.', cols: [
    { k: 'cab', l: 'Cabang' }, { k: 'u', l: 'Ukuran' }, { k: 'dv', l: 'Dashboard', f: (v, x) => (x.u.startsWith('EA') ? F.n(v) : F.rpFull(v)), num: 1 },
    { k: 'kv', l: 'DATABASE', f: (v, x) => (x.u.startsWith('EA') ? F.n(v) : F.rpFull(v)), num: 1 }, { k: 'sel', l: 'Selisih', f: (v) => F.n(v, 2), num: 1 },
    { k: 'st', l: 'Status', cls: (x) => (x.st === 'Cocok' ? 'pj-up' : 'pj-down') }], rows });
}

// ================= halaman =================
function viewOverview(root) {
  pageHead(root, 'Sales Overview');
  const sm = S.sales >= 0, sc = scope('gt', gtF());
  kpiBlocks(root, sc, sm); annualAndGrowth(root, sc, sm); monthlyCharts(root, sc); weeklyChart(root);
  actionCenter(root, sc, sm); branchComparison(root); dataHealth(root);
}

function viewSalesman(root) {
  pageHead(root, 'Salesman Performance');
  const sm = S.sales >= 0, sc = scope('gt', gtF());
  kpiBlocks(root, sc, sm); annualAndGrowth(root, sc, sm); monthlyCharts(root, sc);
  const y = S.year, m = S.month;
  const s = section(root, 'Team view', 'Ranking sales · ' + BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Klik kolom untuk urutkan');
  const mode = h('div', 'pj-seg'); const bY = h('button', 'pj-seg-b on', 'YTD'), bM = h('button', 'pj-seg-b', 'Bulan terpilih'); mode.append(bY, bM); s.append(mode);
  const box = h('div'); s.append(box);
  const list = SALES.filter((x) => S.cab === 'ALL' || x.cab === S.cab);
  const build = (isY) => list.map((x) => { const sc2 = scope('gt', { cab: x.cab, sales: x.i, brand: S.brand });
    if (isY) { const t = ytd(sc2, y, m, true); return { n: x.n, cab: CABNAMA[x.cab], total: t.total, avg: t.avg, avgEa: t.avgEa, eaRo: t.eaRo, ecday: t.ecday, lineEa: t.lineEa, lineRo: t.lineRo, f3: t.f3pct }; }
    const mo = month(sc2, ymOf(y, m)); const t = ytd(sc2, y, m, true); return { n: x.n, cab: CABNAMA[x.cab], total: mo.net, avg: mo.net, avgEa: mo.ea, eaRo: mo.eaRo, ecday: mo.ecday, lineEa: mo.lineEa, lineRo: t.lineRo, f3: t.f3pct }; })
    .filter((r) => r.total || r.avgEa);
  const draw = (isY) => { box.replaceChildren(); bY.classList.toggle('on', isY); bM.classList.toggle('on', !isY);
    table(box, { download: 'Ranking sales', sort: 'total', cols: [{ k: 'n', l: 'Sales' }, { k: 'cab', l: 'Cabang' }, { k: 'total', l: isY ? 'Total omzet' : 'Omzet bulan', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rp, num: 1 },
      { k: 'avgEa', l: isY ? 'AVG EA' : 'EA', f: F.n1, num: 1, cls: (x) => (x.avgEa < BENCH.avgEa ? 'pj-down' : '') }, { k: 'eaRo', l: 'EA/RO', f: (v) => F.pct(v), num: 1, cls: (x) => (x.eaRo < BENCH.eaRo ? 'pj-down' : '') },
      { k: 'ecday', l: 'EC/day', f: F.n2, num: 1, cls: (x) => (x.ecday < BENCH.ecDay ? 'pj-down' : '') }, { k: 'lineEa', l: 'Line/EA', f: F.n2, num: 1 }, { k: 'lineRo', l: 'Line/RO', f: F.n2, num: 1 },
      { k: 'f3', l: 'F3=0', f: (v) => F.pct(v), num: 1, cls: (x) => (x.f3 >= BENCH.f3 ? 'pj-down' : '') }], rows: build(isY) }); };
  bY.addEventListener('click', () => draw(true)); bM.addEventListener('click', () => draw(false)); draw(true);
  const os = [...outletStats('gt', gtF(), y, m).values()].filter((x) => x.ly > 0 && x.ytd > 0);
  const two = grid(root, 'pj-two');
  const cols = [{ k: 'n', l: 'Outlet' }, { k: 's', l: 'Sales' }, { k: 'avgLy', l: 'AVG ' + (y - 1), f: F.rp, num: 1 }, { k: 'avg', l: 'AVG ' + y, f: F.rp, num: 1 }, { k: 'gAvg', l: '% AVG', f: F.g, num: 1, cls: (x) => gcls(x.gAvg) }];
  const mk = (x) => ({ n: OUT[x.o].n, s: SALES[x.mainSales]?.n || '', avgLy: x.avgLy, avg: x.avg, gAvg: x.gAvg });
  table(section(two, 'Outlet growth', 'Top 10 positif', 'Growth AVG'), { download: 'Outlet growth positif', cols, rows: os.filter((x) => x.gAvg >= 0).sort((a, b) => b.avg - a.avg).slice(0, 10).map(mk) });
  table(section(two, 'Outlet growth', 'Top 10 negatif', 'Growth AVG'), { download: 'Outlet growth negatif', cols, rows: os.filter((x) => x.gAvg < 0).sort((a, b) => b.avg - a.avg).slice(0, 10).map(mk) });
}

function viewDpi(root) {
  pageHead(root, 'DPI Performance');
  const y = S.year, m = S.month, q = Math.floor((m - 1) / 3) + 1, f = { cab: S.cab, sales: S.sales, brand: 'ALL' };
  const Q = quarter('gt', f, y, q, ymOf(y, m)); if (!Q) { root.append(h('p', 'pj-note', 'Tidak ada data kuartal ini.')); return; }
  const lbl = qLabel(q, Q.a, Q.b), hl = S.cab === 'MAMUJU' ? '≥3' : S.cab === 'PAREPARE' ? '≥5' : '≥5/≥3';
  const s = section(root, 'Performa kuartal berjalan', lbl, 'Tidak mengikuti filter merek', 'pj-line-blue'); const g = grid(s, 'pj-g5');
  kpi(g, 'Omzet ' + lbl, F.rp(Q.net), 'Semua merek'); kpi(g, 'Omzet HiLo', F.rp(Q.hilo), 'Merek HiLo'); kpi(g, 'Omzet NS Tea', F.rp(Q.tea), '6 SKU NS Tea: Lemon, Peach, Lychee, Orange, Blackcurrant, Apple');
  kpi(g, 'EA Nutrisari', F.n(Q.eaNs), 'Distinct outlet kuartal');
  kpi(g, 'EA Nutrisari ≥10 varian', F.n(Q.ns10), F.pct(div(Q.ns10, Q.ea)) + ' dari total EA · target 40%', stat(div(Q.ns10, Q.ea), BENCH.nsPct));
  kpi(g, 'EA HiLo', F.n(Q.eaHl), 'Distinct outlet kuartal');
  kpi(g, 'EA HiLo ' + hl + ' varian', F.n(Q.hlT), F.pct(div(Q.hlT, Q.ea)) + ' dari total EA · target 50%', stat(div(Q.hlT, Q.ea), BENCH.hiloPct));
  kpi(g, 'EA HiLo School', F.n(Q.eaSchool), 'Item berawalan HiLo School'); kpi(g, 'EA NS Tea', F.n(Q.eaTea), '6 SKU NS Tea: Lemon, Peach, Lychee, Orange, Blackcurrant, Apple');
  const s2 = section(root, 'Parameter pendukung', 'Distribusi SKU', lbl); const g2 = grid(s2, 'pj-g3');
  kpi(g2, 'Total EA', F.n(Q.ea), 'Pembagi target depth merek'); kpi(g2, 'Line/EA', F.n2(Q.lineEa), 'Rata-rata Line/EA bulanan'); kpi(g2, 'Line/RO', F.n2(Q.lineRo), 'Distinct outlet–SKU kuartal ÷ EA kuartal');
  // grafik per kuartal
  const QS = new Map(); const getQ = (yy, qq) => { const k = yy + '-' + qq; if (!QS.has(k)) QS.set(k, quarter('gt', f, yy, qq, yy === y ? ymOf(y, m) : null)); return QS.get(k); };
  const qser = (fn) => YEARS.filter((yy) => yy <= y).map((yy) => ({ name: String(yy), color: YEAR_COLOR[yy], bold: yy === y, values: [1, 2, 3, 4].map((qq) => { if (yy === y && qq > q) return null; const z = getQ(yy, qq); return z ? fn(z) : null; }) }));
  const cg = grid(root, 'pj-charts'); const L = ['Q1', 'Q2', 'Q3', 'Q4'];
  const specs = [['Omzet per kuartal', (z) => z.net, F.rpFull, (v) => F.n(v / 1e6)], ['Omzet HiLo per kuartal', (z) => z.hilo, F.rpFull, (v) => F.n(v / 1e6)], ['Omzet NS Tea per kuartal', (z) => z.tea, F.rpFull, (v) => F.n(v / 1e6)],
    ['EA Nutrisari per kuartal', (z) => z.eaNs, F.n], ['EA Nutrisari ≥10 varian', (z) => z.ns10, F.n], ['EA HiLo per kuartal', (z) => z.eaHl, F.n], ['EA HiLo ' + hl + ' varian', (z) => z.hlT, F.n],
    ['EA HiLo School per kuartal', (z) => z.eaSchool, F.n], ['EA NS Tea per kuartal', (z) => z.eaTea, F.n], ['Line/EA per kuartal', (z) => z.lineEa, F.n2], ['Line/RO per kuartal', (z) => z.lineRo, F.n2]];
  for (const [t, fn, fm, ax] of specs) chartCard(cg, { type: 'bar', eyebrow: 'DPI performance', title: t, badge: ax ? 'Rp juta' : '', labels: L, tipLabels: ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Okt–Des)'], fmt: fm, axisFmt: ax || fm, series: qser(fn) });
  // daftar aksi
  const s3 = section(root, 'DPI action files', 'Daftar outlet kuartal berjalan', 'Unduh PDF atau Excel');
  pdfDpiPanel(s3, Q);
  const elig = fjpEligible(S.cab, S.sales);
  const name = (r) => ({ k: r.k, n: r.n, cab: CABNAMA[r.cab], sr: r.sr, vd: r.vd || '(kosong)' });
  const tabs = h('div', 'pj-seg'); const box = h('div'); s3.append(tabs, box);
  const lists = {
    'Belum transaksi · semua merek': elig.filter((r) => r.o < 0 || !Q.outlets.has(r.o)).map(name),
    'Belum transaksi · Nutrisari': elig.filter((r) => r.o < 0 || !Q.nsSets.has(r.o)).map(name),
    'Belum transaksi · HiLo': elig.filter((r) => r.o < 0 || !Q.hlSets.has(r.o)).map(name),
    'Outlet Nutrisari 5–9 varian': [...Q.nsSets].filter(([, v]) => v.size >= 5 && v.size < 10).map(([o, v]) => ({ k: OUT[o].st.join(' / '), n: OUT[o].n, cab: CABNAMA[OUT[o].cab], sr: SALES[outletOwner(o)]?.n || '', vd: v.size + ' varian' })),
  };
  const cols = [{ k: 'k', l: 'Kunci / ShipTo' }, { k: 'n', l: 'Outlet' }, { k: 'cab', l: 'Cabang' }, { k: 'sr', l: 'Sales (FJP)' }, { k: 'vd', l: 'VisitDay / varian' }];
  Object.keys(lists).forEach((k, i) => { const b = h('button', 'pj-seg-b' + (i ? '' : ' on'), k + ' (' + lists[k].length + ')');
    b.addEventListener('click', () => { tabs.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); box.replaceChildren(); table(box, { download: k + ' ' + lbl, search: 'Cari outlet', tall: 1, cols, rows: lists[k] }); }); tabs.append(b); });
  table(box, { download: Object.keys(lists)[0] + ' ' + lbl, search: 'Cari outlet', tall: 1, cols, rows: lists[Object.keys(lists)[0]] });
}

function viewOutlet(root) {
  pageHead(root, 'Outlet Performance');
  const y = S.year, m = S.month, q = Math.floor((m - 1) / 3) + 1;
  const os = outletStats('gt', gtF(), y, m);
  const rows = [...os.values()].filter((x) => x.ytd || x.ly).map((x) => { const o = OUT[x.o];
    return { o: x.o, n: o.n, cab: CABNAMA[o.cab], kab: o.kab, s: SALES[x.mainSales]?.n || '', ytd: x.ytd, avg: x.avg, avgLy: x.avgLy, gAvg: x.gAvg, gYtd: x.gYtd,
      mon: x.mon.get(ymOf(y, m)) || 0, assort: x.assort, avgPa: x.avgPa, pctPa: x.pctPa, f3: x.f3, ns: x.nsQ.size, hl: x.hlQ.size, last: lastOrderDate(x.last),
      status: (x.mon.get(ymOf(y, m)) || 0) > 0 ? 'Sudah order' : 'Belum order' }; });
  const sec = section(root, 'Outlet performance', 'Performa outlet s.d. ' + BULAN[m - 1] + ' ' + y, rows.length + ' outlet');
  S.outTab = S.outTab || 'ring';
  const tabs = h('div', 'pj-seg'); sec.append(tabs);
  [['ring', 'Ringkasan outlet'], ['ns', 'Deep dive Nutrisari'], ['hl', 'Deep dive HiLo']].forEach(([k, l]) => { const b = h('button', 'pj-seg-b' + (S.outTab === k ? ' on' : ''), l); b.addEventListener('click', () => { S.outTab = k; render(); }); tabs.append(b); });
  pdfOutletPanel(sec);
  const det = h('div'); sec.append(det);
  const showOutlet = (r) => { det.replaceChildren(); const x = os.get(r.o);
    const card = h('div', 'pj-detail'); card.append(h('h3', 'pj-card-title', r.n), h('p', 'pj-note', r.cab + ' · ' + r.kab + ' · Sales ' + r.s + ' · Terakhir order ' + r.last)); det.append(card);
    const sc = scope('gt', { key: 'o' + r.o + '|' + S.brand, cab: 'ALL', sales: -1, brand: S.brand, outlets: new Set([r.o]) });
    chartCard(card, { eyebrow: 'Outlet terpilih', title: 'Omzet bulanan ' + r.n, labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: yearSeries((ym) => mget(sc, ym).net) });
    const it = new Map(); for (const rr of D.gt) { if (rr[1] !== r.o || rr[3] < ymOf(y, 1) || rr[3] > ymOf(y, m)) continue; const k = ITEM[rr[2]]; if (S.brand !== 'ALL' && k.brand !== S.brand) continue;
      let z = it.get(rr[2]); if (!z) it.set(rr[2], (z = { n: k.n, b: k.brand, v: 0, mo: new Set() })); z.v += rr[4]; if (rr[6]) z.mo.add(rr[3]); }
    table(card, { download: 'Item ' + r.n, sort: 'v', cols: [{ k: 'n', l: 'Item NFI' }, { k: 'b', l: 'Merek' }, { k: 'v', l: 'Omzet YTD', f: F.rp, num: 1 }, { k: 'm', l: 'Bulan order', num: 1 }], rows: [...it.values()].map((z) => ({ n: z.n, b: z.b, v: z.v, m: z.mo.size })) });
    const comp = new Map(); for (const z of it.values()) comp.set(z.b, (comp.get(z.b) || 0) + z.v); const ct = sum([...comp.values()]);
    const cb = h('div', 'pj-bars'); [...comp.entries()].sort((a2, b2) => b2[1] - a2[1]).forEach(([b2, v]) => { const row = h('div', 'pj-bar-row'); const bar = h('div', 'pj-bar'); const fi = h('i'); fi.style.width = Math.max(0, (v / (ct || 1)) * 100) + '%'; bar.append(fi); row.append(h('span', '', b2), bar, h('b', '', F.pct(div(v, ct)) + ' · ' + F.rp(v))); cb.append(row); });
    const cc = h('div', 'pj-card'); cc.append(h('p', 'pj-eyebrow', 'Komposisi merek YTD'), cb); card.insertBefore(cc, card.children[2]);
    det.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  if (S.outTab !== 'ring') { deepDive(sec, os, S.outTab, y, m, q, showOutlet, rows); return; }
  table(sec, { download: 'Outlet performance', search: 'Cari outlet, sales, kabupaten', sort: 'ytd', top: S.sales >= 0 ? 20 : 100, topOptions: [[20, 'Top 20'], [25, 'Top 25'], [50, 'Top 50'], [100, 'Top 100'], [0, 'Semua outlet']], tall: 1,
    note: 'Klik baris untuk melihat grafik outlet. Assortment = distinct SKU YTD; AVG PA = rata-rata SKU per bulan YTD; %PA = AVG PA ÷ assortment. F3 = jumlah bulan order dalam 3 bulan terakhir. Varian NS/HiLo dihitung pada Q' + q + ' berjalan.',
    rowClick: showOutlet, cols: [{ k: 'n', l: 'Outlet' }, { k: 'cab', l: 'Cabang' }, { k: 's', l: 'Sales' }, { k: 'kab', l: 'Kabupaten' }, { k: 'ytd', l: 'Omzet YTD', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG ' + y, f: F.rp, num: 1 },
      { k: 'avgLy', l: 'AVG ' + (y - 1), f: F.rp, num: 1 }, { k: 'gAvg', l: 'Growth AVG', f: F.g, num: 1, cls: (x) => gcls(x.gAvg) }, { k: 'mon', l: BLN[m - 1] + ' ' + y, f: F.rp, num: 1 }, { k: 'status', l: 'Status' },
      { k: 'assort', l: 'Assortment', num: 1 }, { k: 'avgPa', l: 'AVG PA', f: F.n1, num: 1 }, { k: 'pctPa', l: '%PA', f: (v) => F.pct(v), num: 1 }, { k: 'f3', l: 'F3', num: 1 },
      { k: 'ns', l: 'Varian NS Q' + q, num: 1, cls: (x) => (x.ns >= 10 ? 'pj-up' : '') }, { k: 'hl', l: 'Varian HiLo Q' + q, num: 1 }, { k: 'last', l: 'Terakhir order' }], rows });
}

function deepDive(sec, os, mode, y, m, q, showOutlet, baseRows) {
  const isNs = mode === 'ns', brand = isNs ? 'NUTRISARI' : 'HILO';
  const ob = outletStats('gt', { cab: S.cab, sales: S.sales, brand }, y, m);
  const focusVars = new Set(ITEM.filter((i) => i.ch === 'GT' && i.brand === brand && D.focusGT.includes(i.n)).map((i) => i.v));
  const nmVar = new Map(ITEM.filter((i) => i.ch === 'GT').map((i) => [i.v, i.n]));
  const rows = [];
  for (const x of os.values()) { if (!(x.ytd || x.ly)) continue; const b = ob.get(x.o) || { ytd: 0, avg: 0, avgLy: 0, gAvg: null, assort: 0, last: -1 };
    const vq = isNs ? x.nsQ : x.hlQ, tgt = isNs ? 10 : HILO_MIN[OUT[x.o].cab] || 3, n = vq.size;
    const miss = [...focusVars].filter((v) => !vq.has(v));
    rows.push({ o: x.o, n: OUT[x.o].n, cab: CABNAMA[OUT[x.o].cab], s: SALES[x.mainSales]?.n || '', ytd: b.ytd, share: div(b.ytd, x.ytd), avg: b.avg, gAvg: b.gAvg, v: n, tgt,
      st: n >= tgt ? 'Target tercapai' : n === 0 ? 'Belum beli Q' + q : n >= (isNs ? 5 : Math.max(1, tgt - 2)) ? 'Dekat target' : 'Rendah', gap: Math.max(0, tgt - n), miss: miss.length, missN: miss.map((v) => nmVar.get(v)).join(', '), assort: b.assort, kab: OUT[x.o].kab }); }
  const cnt = (st) => rows.filter((r) => r.st === st).length;
  const g = grid(sec, 'pj-g4');
  kpi(g, 'Target tercapai', F.n(cnt('Target tercapai')), isNs ? '≥10 varian Nutrisari Q' + q : 'HiLo ≥5 (Parepare) / ≥3 (Mamuju) Q' + q, 'good');
  kpi(g, 'Dekat target', F.n(cnt('Dekat target')), isNs ? '5–9 varian' : 'Kurang 1–2 varian dari target', 'warn');
  kpi(g, 'Rendah', F.n(cnt('Rendah')), 'Sudah beli, varian masih sedikit', 'bad');
  kpi(g, 'Belum beli ' + (isNs ? 'Nutrisari' : 'HiLo') + ' Q' + q, F.n(cnt('Belum beli Q' + q)), 'Outlet aktif YTD tanpa ' + (isNs ? 'NS' : 'HiLo') + ' di kuartal ini', 'bad');
  table(sec, { download: 'Deep dive ' + (isNs ? 'Nutrisari' : 'HiLo'), search: 'Cari outlet, sales, status', sort: 'ytd', top: S.sales >= 0 ? 20 : 100, topOptions: [[20, 'Top 20'], [50, 'Top 50'], [100, 'Top 100'], [0, 'Semua outlet']], tall: 1,
    rowClick: (r) => showOutlet(baseRows.find((b) => b.o === r.o)),
    note: 'Varian dihitung dari Sales valid sejak awal Q' + q + ' sampai ' + BULAN[m - 1] + '; padanan HiLo 8R/12R dihitung satu varian. Item fokus = daftar ' + D.focusGT.length + ' item fokus GT (dashboard lama) untuk merek ini.',
    rowClass: (r) => (r.st === 'Target tercapai' ? '' : ''),
    cols: [{ k: 'n', l: 'Outlet' }, { k: 'cab', l: 'Cabang' }, { k: 's', l: 'Sales' }, { k: 'kab', l: 'Kabupaten' }, { k: 'ytd', l: 'Omzet ' + brand + ' YTD', f: F.rp, num: 1 }, { k: 'share', l: 'Porsi omzet outlet', f: (v) => F.pct(v), num: 1 },
      { k: 'gAvg', l: 'Growth AVG', f: F.g, num: 1, cls: (x) => gcls(x.gAvg) }, { k: 'v', l: 'Varian Q' + q, num: 1 }, { k: 'tgt', l: 'Target', num: 1 }, { k: 'gap', l: 'Kurang', num: 1, cls: (x) => (x.gap ? 'pj-down' : 'pj-up') },
      { k: 'st', l: 'Status', cls: (x) => (x.st === 'Target tercapai' ? 'pj-up' : x.st === 'Dekat target' ? 'pj-warn-t' : 'pj-down') }, { k: 'miss', l: 'Item fokus belum dibeli', num: 1 }, { k: 'missN', l: 'Daftar item fokus belum dibeli' }], rows });
}

function viewItem(root) {
  pageHead(root, 'Item Performance');
  const y = S.year, m = S.month, f = gtF(), end = ymOf(y, m), st = ymOf(y, 1), n = end - st + 1;
  const A = new Map();
  for (const r of D.gt) {
    const s = r[0]; if ((f.cab !== 'ALL' && OUT[r[1]].cab !== f.cab) || (f.sales >= 0 && s !== f.sales)) continue;
    const it = ITEM[r[2]]; if (f.brand !== 'ALL' && it.brand !== f.brand) continue;
    let a = A.get(r[2]); if (!a) A.set(r[2], (a = { net: new Map(), ret: new Map(), ea: new Map(), ro: new Map() }));
    const ym = r[3]; a.net.set(ym, (a.net.get(ym) || 0) + r[4]); a.ret.set(ym, (a.ret.get(ym) || 0) + r[5]);
    if (r[6]) { let e = a.ea.get(ym); if (!e) a.ea.set(ym, (e = new Set())); e.add(r[1]); const yy = yOf(ym); let ro = a.ro.get(yy); if (!ro) a.ro.set(yy, (ro = new Map())); if (!(ro.get(r[1]) <= ym)) ro.set(r[1], ym); }
  }
  const nr = (a, x, b) => { let t = 0; for (let k = x; k <= b; k++) t += a.get(k) || 0; return t; };
  const eaR = (a, x, b) => { let t = 0; for (let k = x; k <= b; k++) t += a.ea.get(k)?.size || 0; return t; };
  let grand = 0; for (const a of A.values()) grand += nr(a.net, st, end);
  const rows = [...A.entries()].map(([i, a]) => { const tot = nr(a.net, st, end), ret = nr(a.ret, st, end), gross = tot - ret;
    const ro = [...(a.ro.get(y) || new Map()).values()].filter((v) => v <= end).length, avgEa = eaR(a, st, end) / n, avgEaLy = eaR(a, ymOf(y - 1, 1), ymOf(y - 1, 12)) / 12;
    return { i, n: ITEM[i].n, b: ITEM[i].brand, tot, avg: tot / n, kon: div(tot, grand), ptd: gr(a.net.get(end), a.net.get(end - 12)), gy: gr(tot, nr(a.net, ymOf(y - 1, 1), end - 12)),
      ga: gr(tot / n, nr(a.net, ymOf(y - 1, 1), ymOf(y - 1, 12)) / 12), yoy: gr(nr(a.net, end - 11, end), nr(a.net, end - 23, end - 12)), ro, avgEa, eaRo: div(avgEa, ro), gEa: gr(avgEa, avgEaLy), ret, rr: div(Math.abs(ret), gross),
      mon: a.net.get(end) || 0, eaM: a.ea.get(end)?.size || 0 }; }).filter((r) => r.tot || r.ro);
  const s0 = section(root, 'Item performance', 'Performa SKU · ' + BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Klik item untuk tren'); const g = grid(s0, 'pj-g4');
  const tRet = sum(rows.map((r) => r.ret)), tGross = sum(rows.map((r) => r.tot - r.ret));
  kpi(g, 'Item aktif', F.n(rows.filter((r) => r.ro > 0).length) + ' SKU', BLN[0] + '–' + BLN[m - 1] + ' ' + y); kpi(g, 'Net omzet item', F.rp(grand), 'Sales + retur'); kpi(g, 'Omzet retur', F.rp(tRet), 'Retur negatif'); kpi(g, 'Retur terhadap sales', F.pct(div(Math.abs(tRet), tGross)), '|Retur| ÷ sales');
  const det = h('div'); s0.append(det);
  const showItem = (r) => { det.replaceChildren(); const a = A.get(r.i);
    chartCard(det, { eyebrow: r.b, title: 'Tren omzet ' + r.n, labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: yearSeries((ym) => a.net.get(ym) ?? null) });
    chartCard(det, { eyebrow: r.b, title: 'Tren EA ' + r.n, labels: BLN, tipLabels: BULAN, fmt: F.n, series: yearSeries((ym) => a.ea.get(ym)?.size ?? null) }); det.scrollIntoView({ behavior: 'smooth' }); };
  table(s0, { download: 'Item performance', search: 'Cari Item NFI', sort: 'tot', top: 25, topOptions: [[25, 'Top 25'], [50, 'Top 50'], [100, 'Top 100'], [0, 'Semua item']], tall: 1, rowClick: showItem,
    note: 'Omzet SKU memakai Sales + Retur; RO dan EA hanya Sales valid. Growth AVG EA = AVG EA YTD vs AVG EA ' + (y - 1) + ' penuh.',
    cols: [{ k: 'n', l: 'Item NFI' }, { k: 'b', l: 'Merek' }, { k: 'tot', l: 'Total omzet', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rp, num: 1 }, { k: 'kon', l: 'Kontribusi', f: (v) => F.pct(v), num: 1 },
      { k: 'ptd', l: 'Growth PTD', f: F.g, num: 1, cls: (x) => gcls(x.ptd) }, { k: 'gy', l: 'Growth YTD', f: F.g, num: 1, cls: (x) => gcls(x.gy) }, { k: 'ga', l: 'Growth AVG', f: F.g, num: 1, cls: (x) => gcls(x.ga) },
      { k: 'yoy', l: 'Growth YoY', f: F.g, num: 1, cls: (x) => gcls(x.yoy) }, { k: 'ro', l: 'RO', num: 1 }, { k: 'avgEa', l: 'AVG EA', f: F.n1, num: 1 }, { k: 'eaRo', l: 'EA/RO', f: (v) => F.pct(v), num: 1 },
      { k: 'gEa', l: 'Growth AVG EA', f: F.g, num: 1, cls: (x) => gcls(x.gEa) }, { k: 'ret', l: 'Omzet retur', f: F.rp, num: 1 }, { k: 'rr', l: 'Retur/sales', f: (v) => F.pct(v), num: 1 }], rows });
}

const KAB_XY = { PAREPARE: [119.63, -4.01], BARRU: [119.65, -4.42], PINRANG: [119.65, -3.79], SIDRAP: [119.98, -3.92], ENREKANG: [119.78, -3.56], WAJO: [120.03, -4.13],
  PANGKEP: [119.55, -4.84], BANTAENG: [119.95, -5.54], 'POLEWALI MANDAR': [119.33, -3.41], MAJENE: [118.97, -3.54], MAMASA: [119.37, -2.94], MAMUJU: [118.89, -2.68], 'MAMUJU TENGAH': [119.32, -2.05], PASANGKAYU: [119.37, -1.17] };
function drawMap(box, rows, metric) {
  box.replaceChildren();
  const W = Math.max(320, box.clientWidth), H = 480, pts = rows.filter((r) => KAB_XY[r.n]);
  if (!pts.length) return;
  const los = pts.map((r) => KAB_XY[r.n][0]), las = pts.map((r) => KAB_XY[r.n][1]);
  const lo0 = Math.min(...los) - 0.12, lo1 = Math.max(...los) + 0.12, la0 = Math.max(...las) + 0.12, la1 = Math.min(...las) - 0.12;
  const padL = 60, padR = 170, padT = 50, padB = 50;
  const X = (lo) => padL + ((lo - lo0) / (lo1 - lo0 || 1)) * (W - padL - padR), Y = (la) => padT + ((la0 - la) / (la0 - la1 || 1)) * (H - padT - padB);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'pj-svg', role: 'img', 'aria-label': 'Peta performa area' }, box);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: '#f3f7fc', rx: 10 }, svg);
  for (let k = 1; k < 6; k++) { el('line', { x1: 0, x2: W, y1: (H * k) / 6, y2: (H * k) / 6, stroke: '#e5ebf3' }, svg); el('line', { y1: 0, y2: H, x1: (W * k) / 6, x2: (W * k) / 6, stroke: '#e5ebf3' }, svg); }
  const maxT = Math.max(...pts.map((r) => Math.abs(r.total)), 1);
  const val = (r) => r[metric];
  const fmt = { total: F.rp, gy: F.g, avgEa: F.n1, f3: (v) => F.pct(v), eaRo: (v) => F.pct(v) }[metric];
  const vs = pts.map(val).filter((v) => v != null && isFinite(v)); const vmax = Math.max(...vs, 0), vmin = Math.min(...vs, 0);
  const color = (v) => { if (v == null || !isFinite(v)) return '#9aa7b8';
    if (metric === 'gy') return v >= 0 ? '#1f9d5a' : '#d23f3f';
    if (metric === 'f3') return v >= 0.2 ? '#d23f3f' : '#1f9d5a';
    const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : 1; const a = [170, 200, 240], b = [15, 70, 160]; return 'rgb(' + a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',') + ')'; };
  const tip = h('div', 'pj-tip'); tip.hidden = true; box.append(tip);
  const placed = [];
  const nodes = [...pts].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).map((r) => ({ r, x: X(KAB_XY[r.n][0]), y: Y(KAB_XY[r.n][1]), rad: 7 + 30 * Math.sqrt(Math.abs(r.total) / maxT) }));
  const gB = el('g', {}, svg), gL = el('g', {}, svg);
  nodes.forEach((nd) => {
    const c = el('circle', { cx: nd.x, cy: nd.y, r: nd.rad, fill: color(val(nd.r)), 'fill-opacity': 0.82, stroke: '#fff', 'stroke-width': 2 }, gB);
    c.addEventListener('pointerenter', (ev) => { const r = nd.r; tip.replaceChildren(h('div', 'pj-tip-h', r.n), h('div', '', 'Omzet ' + F.rp(r.total) + ' · kontribusi ' + F.pct(r.kon)), h('div', '', 'Growth YTD ' + F.g(r.gy)), h('div', '', 'AVG EA ' + F.n1(r.avgEa) + ' · RO ' + F.n(r.ro)), h('div', '', 'EA/RO ' + F.pct(r.eaRo) + ' · F3=0 ' + F.pct(r.f3)));
      tip.hidden = false; const bx = box.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - bx.left + 12, box.clientWidth - tip.offsetWidth - 4) + 'px'; tip.style.top = Math.max(4, ev.clientY - bx.top - 20) + 'px'; });
    c.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
  nodes.forEach((nd) => { // label di kanan bubble; geser ke bawah jika bertabrakan
    let lx = nd.x + nd.rad + 6, ly = nd.y - 3; const w = 7.2 * Math.max(nd.r.n.length, 9), hgt = 26;
    for (let k = 0; k < 12; k++) { const hit = placed.find((b) => lx < b.x + b.w && lx + w > b.x && ly - 11 < b.y + b.h - 11 && ly - 11 + hgt > b.y - 11); if (!hit) break; ly = hit.y + hit.h + 1; }
    placed.push({ x: lx, y: ly, w, h: hgt });
    if (Math.abs(ly - (nd.y - 3)) > 4) el('line', { x1: nd.x + nd.rad * 0.7, y1: nd.y, x2: lx - 2, y2: ly - 4, stroke: '#9aa7b8', 'stroke-width': 1 }, gL);
    const lb = el('text', { x: lx, y: ly, class: 'pj-map-lbl' }, gL); lb.textContent = nd.r.n;
    const lv = el('text', { x: lx, y: ly + 13, class: 'pj-map-val' }, gL); lv.textContent = fmt(val(nd.r));
  });
}

function viewArea(root) {
  pageHead(root, 'Area Overview');
  const y = S.year, m = S.month;
  const kabs = new Map(); OUT.forEach((o) => { if (S.cab !== 'ALL' && o.cab !== S.cab) return; let s = kabs.get(o.kab); if (!s) kabs.set(o.kab, (s = new Set())); s.add(o.i); });
  const sel = h('select', 'pj-select'); sel.append(new Option('Semua kabupaten/kota', '')); [...kabs.keys()].sort().forEach((k) => sel.append(new Option(k, k))); sel.value = S.kab || '';
  sel.addEventListener('change', () => { S.kab = sel.value; render(); });
  const top = h('div', 'pj-inline'); top.append(h('label', 'pj-lbl', 'Kabupaten/kota'), sel); root.append(top);
  const base = { cab: S.cab, sales: S.sales, brand: S.brand };
  const rowFor = (label, set, key) => { const sc = scope('gt', Object.assign({}, base, { outlets: set, key: key + '|' + [S.cab, S.sales, S.brand].join('|') })); const t = ytd(sc, y, m, false), g = growth(sc, y, m, false);
    return { n: label, total: t.total, avg: t.avg, gy: g.ytd, ga: g.avg, avgEa: t.avgEa, ro: t.ro, eaRo: t.eaRo, ecday: t.ecday, lineEa: t.lineEa, f3: t.f3pct, sc }; };
  const all = rowFor('ALL', S.kab ? kabs.get(S.kab) : null, 'kab' + (S.kab || '*'));
  const s = section(root, 'Performa YTD area', (S.kab || 'Semua kabupaten/kota') + ' · ' + BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Merek & sales mengikuti filter', 'pj-line-blue'); const g = grid(s, 'pj-g5');
  const t = ytd(all.sc, y, m, false);
  kpi(g, 'Total omzet ' + y, F.rp(t.total), BLN[0] + '–' + BLN[m - 1]); kpi(g, 'AVG omzet', F.rp(t.avg), 'Rata-rata/bulan'); kpi(g, 'Growth YTD', F.g(all.gy), 'vs periode sama tahun lalu', gstat(all.gy)); kpi(g, 'Growth AVG', F.g(all.ga), 'vs AVG tahun lalu', gstat(all.ga));
  kpi(g, 'AVG EA', F.n1(t.avgEa), 'Rata-rata EA bulanan'); kpi(g, 'RO', F.n(t.ro), 'Distinct outlet YTD'); kpi(g, 'EA/RO', F.pct(t.eaRo), 'Target 40%', stat(t.eaRo, BENCH.eaRo)); kpi(g, 'EC/day', F.n2(t.ecday), 'Target 7', stat(t.ecday, BENCH.ecDay));
  kpi(g, 'Line/EA', F.n2(t.lineEa), 'Rata-rata bulanan'); kpi(g, 'F3=0', F.n(t.f3), F.pct(t.f3pct) + ' dari RO YTD', stat(t.f3pct, BENCH.f3, true));
  let rows;
  if (!S.kab) rows = [...kabs.entries()].map(([k, set]) => Object.assign(rowFor(k, set, 'kab' + k), { owner: '' }));
  else { const kec = new Map(); kabs.get(S.kab).forEach((o) => { const k = OUT[o].kec; let s2 = kec.get(k); if (!s2) kec.set(k, (s2 = new Set())); s2.add(o); });
    rows = [...kec.entries()].map(([k, set]) => rowFor(k, set, 'kec' + S.kab + k)); }
  const grand = sum(rows.map((r) => r.total)); rows.forEach((r) => { r.kon = div(r.total, grand); });
  // pemilik area: sales dengan omzet YTD terbesar di area
  rows.forEach((r) => { r.owner = ''; });
  if (!S.kab) {
    const ms = section(root, 'Peta performa area', CABNAMA[S.cab] + ' · kabupaten/kota · ' + BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Posisi skematis pusat area');
    const ctl = h('div', 'pj-seg'); const mbox = h('div', 'pj-map'); ms.append(ctl, mbox);
    const METRIC = [['total', 'Total omzet'], ['gy', 'Growth YTD'], ['avgEa', 'AVG EA'], ['eaRo', 'EA/RO'], ['f3', 'F3=0']];
    S.mapMetric = S.mapMetric || 'total';
    METRIC.forEach(([k, l]) => { const b = h('button', 'pj-seg-b' + (S.mapMetric === k ? ' on' : ''), l); b.addEventListener('click', () => { S.mapMetric = k; ctl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); drawMap(mbox, rows, k); }); ctl.append(b); });
    ms.append(h('p', 'pj-note', 'Posisi bubble = perkiraan pusat kabupaten/kota (skematis, bukan peta skala dan bukan titik outlet). Ukuran bubble = total omzet. Warna mengikuti ukuran yang dipilih: hijau/merah untuk growth dan F3=0 (target <20%), biru makin gelap = nilai makin tinggi. Arahkan kursor ke bubble untuk detail.'));
    const draw = () => drawMap(mbox, rows, S.mapMetric); requestAnimationFrame(draw); REDRAW.add(draw);
  }
  const rs = section(root, 'Area ranking', (S.kab ? 'Kecamatan di ' + S.kab : 'Kabupaten/kota') + ' · ' + BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Klik baris kabupaten untuk kecamatan');
  table(rs, { download: 'Area ranking', sort: 'total', rowClick: S.kab ? null : (r) => { S.kab = r.n; render(); },
    note: 'Kabupaten/kota = normalisasi kolom Kota transaksi (cadangan: Kabupaten FJP dan alamat). Kecamatan dari master FJP lewat ShipTo; outlet yang tidak ada di FJP ditandai "Belum terpetakan". Consumption Index belum tersedia karena data penduduk belum dilampirkan.',
    cols: [{ k: 'n', l: S.kab ? 'Kecamatan' : 'Kabupaten/kota' }, { k: 'total', l: 'Omzet', f: F.rp, num: 1 }, { k: 'kon', l: 'Kontribusi', f: (v) => F.pct(v), num: 1 }, { k: 'gy', l: 'Growth YTD', f: F.g, num: 1, cls: (x) => gcls(x.gy) },
      { k: 'ga', l: 'Growth AVG', f: F.g, num: 1, cls: (x) => gcls(x.ga) }, { k: 'avgEa', l: 'AVG EA', f: F.n1, num: 1 }, { k: 'ro', l: 'RO', num: 1 }, { k: 'eaRo', l: 'EA/RO', f: (v) => F.pct(v), num: 1 },
      { k: 'ecday', l: 'EC/day', f: F.n2, num: 1 }, { k: 'lineEa', l: 'Line/EA', f: F.n2, num: 1 }, { k: 'f3', l: 'F3=0', f: (v) => F.pct(v), num: 1 }], rows });
  pdfAreaPanel(rs, rows, S.kab ? kabs.get(S.kab) : null, all.sc);
  const top5 = [...rows].sort((a, b) => b.total - a.total).slice(0, 5);
  const cg = grid(root, 'pj-charts');
  const ser = (fn) => top5.map((r, i) => ({ name: r.n, color: SERIES_COLORS[i], values: BLN.map((_, k) => { const ym = ymOf(y, k + 1); return ym > ymOf(y, m) ? null : fn(r.sc, ym); }) }));
  chartCard(cg, { eyebrow: 'Omzet', title: 'Tren omzet area · top 5 · ' + y, labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: ser((sc, ym) => mget(sc, ym).net) });
  chartCard(cg, { eyebrow: 'Aktivasi', title: 'Tren EA area · top 5 · ' + y, labels: BLN, tipLabels: BULAN, fmt: F.n, series: ser((sc, ym) => mget(sc, ym).ea) });
  chartCard(cg, { eyebrow: 'Distribusi SKU', title: 'Tren Line/EA area · top 5 · ' + y, labels: BLN, tipLabels: BULAN, fmt: F.n2, series: ser((sc, ym) => div(mget(sc, ym).line, mget(sc, ym).ea)) });
  chartCard(cg, { eyebrow: 'Repeat order', title: 'EA/RO & F3=0 · ' + (S.kab || 'semua area'), labels: BLN, tipLabels: BULAN, fmt: (v) => F.pct(v), axisFmt: (v) => F.pct(v, 0),
    series: [{ name: 'EA/RO', color: SERIES_COLORS[0], bold: 1, values: BLN.map((_, k) => { const ym = ymOf(y, k + 1); return ym > ymOf(y, m) ? null : div(mget(all.sc, ym).ea, roAt(all.sc, ym).ro); }) },
      { name: 'F3=0', color: SERIES_COLORS[3], values: BLN.map((_, k) => { const ym = ymOf(y, k + 1); return ym > ymOf(y, m) ? null : div(roAt(all.sc, ym).f3, roAt(all.sc, ym).ro); }) }] });
}

function viewStockist(root) {
  const y = S.year, m = S.month, end = ymOf(y, m);
  const ids = new Set(); const nameSet = new Set(D.stockist); OUT.forEach((o) => { if (nameSet.has(o.n)) ids.add(o.i); });
  const hd = h('div', 'pj-page-head'); const l = h('div'); l.append(h('p', 'pj-eyebrow', 'Parepare & Mamuju · seluruh merek'), h('h1', 'pj-page-title', 'Stockist Performance · ' + (S.stk >= 0 ? OUT[S.stk].n : 'Semua Stockist')));
  hd.append(l, h('p', 'pj-page-meta', 'Filter aktif: ' + BULAN[m - 1] + ' ' + y)); root.append(hd);
  const sel = h('select', 'pj-select'); sel.append(new Option('SEMUA STOCKIST', '-1')); [...ids].forEach((o) => sel.append(new Option(OUT[o].n + ' (' + CABNAMA[OUT[o].cab] + ')', o))); sel.value = String(S.stk ?? -1);
  sel.addEventListener('change', () => { S.stk = +sel.value; render(); });
  const bar = h('div', 'pj-inline'); bar.append(h('label', 'pj-lbl', 'Pilih toko stockist'), sel, h('span', 'pj-note', D.stockist.length + ' stockist aktif · TK Mulya dikeluarkan (bukan stockist lagi, 9 Nov 2026)')); root.append(bar);
  const set = S.stk >= 0 ? new Set([S.stk]) : ids;
  const sc = scope('gt', { key: 'stk' + (S.stk ?? -1), cab: 'ALL', sales: -1, brand: 'ALL', outlets: set });
  const scN = scope('gt', { key: 'stkNS' + (S.stk ?? -1), cab: 'ALL', sales: -1, brand: 'NUTRISARI', outlets: set });
  const scH = scope('gt', { key: 'stkHL' + (S.stk ?? -1), cab: 'ALL', sales: -1, brand: 'HILO', outlets: set });
  const t = ytd(sc, y, m, false), g = growth(sc, y, m, false), tN = ytd(scN, y, m, false), tH = ytd(scH, y, m, false);
  const s1 = section(root, 'Performa YTD stockist', BLN[0] + '–' + BLN[m - 1] + ' ' + y, '', 'pj-line-blue'); const g1 = grid(s1, 'pj-g5');
  kpi(g1, 'Total omzet ' + y, F.rp(t.total), BLN[0] + '–' + BLN[m - 1]); kpi(g1, 'AVG omzet ' + y, F.rp(t.avg), 'Rata-rata per bulan'); kpi(g1, 'Growth YTD', F.g(g.ytd), 'vs periode sama tahun lalu', gstat(g.ytd)); kpi(g1, 'Growth AVG', F.g(g.avg), 'vs AVG tahun lalu', gstat(g.avg));
  kpi(g1, 'Line/EA', F.n2(t.lineEa), 'Rata-rata Line/EA bulanan'); kpi(g1, 'Line/RO', F.n2(t.lineRo), 'Distinct stockist–SKU ÷ RO'); kpi(g1, 'Line/EA Nutrisari', F.n2(tN.lineEa), 'Merek Nutrisari'); kpi(g1, 'Line/RO Nutrisari', F.n2(tN.lineRo), 'Merek Nutrisari');
  kpi(g1, 'Line/EA HiLo', F.n2(tH.lineEa), 'Merek HiLo'); kpi(g1, 'Line/RO HiLo', F.n2(tH.lineRo), 'Merek HiLo');
  const mo = month(sc, end);
  const s2 = section(root, 'Performa bulan terpilih', BULAN[m - 1] + ' ' + y, '', 'pj-line-orange'); const g2 = grid(s2, 'pj-g6');
  kpi(g2, 'Omzet ' + BULAN[m - 1], F.rp(mo.net), 'Bulan terpilih'); kpi(g2, 'Growth PTD', F.g(g.ptd), 'vs ' + BULAN[m - 1] + ' ' + (y - 1), gstat(g.ptd)); kpi(g2, 'Growth vs AP3M', F.g(g.ap3m), '(bulan ÷ AP3M) − 1', gstat(g.ap3m));
  kpi(g2, 'Growth vs AP3M12M', F.g(g.ap3m12m), '(bulan ÷ AP3M12M) − 1', gstat(g.ap3m12m)); kpi(g2, 'Line/EA', F.n2(mo.lineEa), 'Bulan terpilih'); kpi(g2, 'Stockist order', mo.ea + '/' + set.size, 'Distinct stockist yang order', mo.ea === set.size ? 'good' : 'warn');
  const cg = grid(root, 'pj-charts');
  chartCard(cg, { eyebrow: 'Omzet', title: 'Omzet stockist bulanan', labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: yearSeries((ym) => mget(sc, ym).net) });
  chartCard(cg, { eyebrow: 'SKU depth bulanan', title: 'Line/EA seluruh merek', labels: BLN, tipLabels: BULAN, fmt: F.n2, series: yearSeries((ym) => div(mget(sc, ym).line, mget(sc, ym).ea)) });
  chartCard(cg, { eyebrow: 'SKU depth YTD', title: 'Line/RO kumulatif bulanan', labels: BLN, tipLabels: BULAN, fmt: F.n2, series: yearSeries((ym) => div(roAt(sc, ym).pr, roAt(sc, ym).ro)) });
  chartCard(cg, { eyebrow: 'Nutrisari', title: 'Line/EA Nutrisari', labels: BLN, tipLabels: BULAN, fmt: F.n2, series: yearSeries((ym) => div(mget(scN, ym).line, mget(scN, ym).ea)) });
  chartCard(cg, { eyebrow: 'HiLo', title: 'Line/EA HiLo', labels: BLN, tipLabels: BULAN, fmt: F.n2, series: yearSeries((ym) => div(mget(scH, ym).line, mget(scH, ym).ea)) });
  // action center & detail per stockist
  const os = outletStats('gt', { cab: 'ALL', sales: -1, brand: 'ALL', outlets: ids }, y, m);
  const osLy = outletStats('gt', { cab: 'ALL', sales: -1, brand: 'ALL', outlets: ids }, y - 1, 12);
  const curNS = new Map(), curHL = new Map();
  for (const r of D.gt) { if (r[3] !== end || !ids.has(r[1]) || !r[6]) continue; const it = ITEM[r[2]]; const mp = NS(it) ? curNS : HILO(it) ? curHL : null; if (!mp) continue; let s0 = mp.get(r[1]); if (!s0) mp.set(r[1], (s0 = new Set())); s0.add(it.v); }
  const det = [...ids].map((o) => { const x = os.get(o) || { avg: 0, mon: new Map(), assort: 0, avgPa: 0, pctPa: null, f3: 0, f12: 0, last: -1, ytd: 0, lyYtd: 0, avgLy: 0 }; const xl = osLy.get(o) || { assort: 0, avgPa: 0, pctPa: null };
    return { n: OUT[o].n, cab: CABNAMA[OUT[o].cab], kab: OUT[o].kab, s: SALES[outletOwner(o)]?.n || '', avg: x.avg, avgLy: x.avgLy, gy: gr(x.ytd, x.lyYtd), ga: x.gAvg, lro: x.assort, lroLy: xl.assort, lea: x.avgPa, leaLy: xl.avgPa, pa: x.pctPa, paLy: xl.pctPa, f3: x.f3, f12: x.f12, last: lastOrderDate(x.last),
      mon: x.mon.get(end) || 0, ns: curNS.get(o)?.size || 0, hl: curHL.get(o)?.size || 0 }; });
  const ac = section(root, 'Stockist action center', 'Prioritas bulan berjalan', 'Seluruh ' + ids.size + ' stockist', 'pj-line-red'); const ga = grid(ac, 'pj-g4');
  const blk = (lbl, arr, sub) => { const c = kpi(ga, lbl, F.n(arr.length), sub, arr.length ? 'bad' : 'good'); const ul = h('ul', 'pj-mini-list'); arr.forEach((r) => ul.append(h('li', '', r.n))); c.append(ul); };
  blk('Belum order bulan berjalan', det.filter((r) => r.mon <= 0), 'Dari ' + ids.size + ' stockist'); blk('Omzet bulan < Rp3 juta', det.filter((r) => r.mon > 0 && r.mon < 3e6), 'Hanya stockist yang sudah order');
  blk('Varian Nutrisari < 5', det.filter((r) => r.mon > 0 && r.ns < 5), 'Distinct varian bulan berjalan'); blk('Varian HiLo < 3', det.filter((r) => r.mon > 0 && r.hl < 3), 'Distinct varian bulan berjalan');
  const ds = section(root, 'Detail stockist', 'Detail semua stockist · YTD ' + BLN[0] + '–' + BLN[m - 1], ids.size + ' stockist');
  table(ds, { download: 'Detail stockist', search: 'Cari toko', sort: 'avg', cols: [{ k: 'n', l: 'Stockist' }, { k: 'cab', l: 'Cabang' }, { k: 'kab', l: 'Area' }, { k: 's', l: 'Sales PIC' },
    { k: 'avg', l: 'AVG omzet ' + y + ' YTD', f: F.rp, num: 1 }, { k: 'avgLy', l: 'AVG omzet ' + (y - 1) + ' full', f: F.rp, num: 1 }, { k: 'gy', l: 'Growth YTD', f: F.g, num: 1, cls: (x) => gcls(x.gy) }, { k: 'ga', l: 'Growth AVG', f: F.g, num: 1, cls: (x) => gcls(x.ga) },
    { k: 'lro', l: 'Line/RO ' + y, num: 1 }, { k: 'lroLy', l: 'Line/RO ' + (y - 1), num: 1 }, { k: 'lea', l: 'AVG Line/EA ' + y, f: F.n1, num: 1 }, { k: 'leaLy', l: 'AVG Line/EA ' + (y - 1), f: F.n1, num: 1 },
    { k: 'pa', l: '%PA ' + y, f: (v) => F.pct(v), num: 1, cls: (x) => (x.pa >= 0.4 ? 'pj-up' : 'pj-down') }, { k: 'f3', l: 'F3', num: 1 }, { k: 'f12', l: 'F12', num: 1 }, { k: 'last', l: 'Last order' }], rows: det,
    note: 'Line/RO stockist = distinct SKU YTD (assortment); AVG Line/EA = rata-rata SKU per bulan; %PA = AVG Line/EA ÷ Line/RO, hijau ≥40%. F3/F12 = jumlah bulan order dalam 3/12 bulan terakhir.' });
}

/* Halaman Modern Trade dan MDS */
'use strict';
const mtF = () => ({ cab: S.cab, sales: S.sales, brand: S.mtBrand });

function viewMtOverview(root) {
  const y = S.year, m = S.month, end = ymOf(y, m), sm = S.sales >= 0;
  const hd = h('div', 'pj-page-head'); const l = h('div');
  l.append(h('p', 'pj-eyebrow', 'Sales overview · Modern Trade · Group1Barang Modern'), h('h1', 'pj-page-title', CABNAMA[S.cab] + ' · ' + (sm ? SALES[S.sales].n : 'Semua salesman') + ' · ' + (S.mtBrand === 'ALL' ? 'Semua Merek' : S.mtBrand)));
  hd.append(l, h('p', 'pj-page-meta', 'sampai ' + BULAN[m - 1] + ' ' + y)); root.append(hd);
  const sc = scope('mt', mtF()), t = ytd(sc, y, m, sm), g = growth(sc, y, m, sm), mo = month(sc, end);
  const s1 = section(root, 'Performa YTD', BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Akumulasi Januari–bulan dipilih', 'pj-line-blue'); const g1 = grid(s1, 'pj-g5');
  kpi(g1, 'Total omzet ' + y, F.rp(t.total), 'Net DPP YTD'); kpi(g1, 'AVG omzet ' + y, F.rp(t.avg), 'Rata-rata per bulan'); kpi(g1, 'Customer aktif', F.n(t.ro), 'Distinct customer YTD');
  kpi(g1, 'AVG customer aktif', F.n1(t.avgEa), 'Rata-rata distinct/bulan'); kpi(g1, 'EC', F.n(t.ec), 'Distinct customer per TglSO'); kpi(g1, 'Gross sales', F.rp(t.gross), 'Status Sales');
  kpi(g1, 'Omzet retur', F.rp(t.ret), 'Status Retur'); kpi(g1, 'Return rate', F.pct(div(Math.abs(t.ret), t.gross)), '|Retur| ÷ Sales');
  const all = ytd(scope('mt', { cab: S.cab, sales: -1, brand: 'ALL' }), y, m, false); kpi(g1, 'Kontribusi', F.pct(div(t.total, all.total)), 'Terhadap seluruh MT cabang');
  const s2 = section(root, 'Performa bulan terpilih', BULAN[m - 1] + ' ' + y, 'Bulan aktif', 'pj-line-orange'); const g2 = grid(s2, 'pj-g5');
  kpi(g2, 'Omzet ' + BULAN[m - 1], F.rp(mo.net), 'Net DPP'); kpi(g2, 'Customer aktif', F.n(mo.ea), 'Distinct customer'); kpi(g2, 'EC', F.n(mo.ec), 'Distinct customer per TglSO');
  kpi(g2, 'Gross sales', F.rp(mo.gross), 'Status Sales'); kpi(g2, 'Omzet retur', F.rp(mo.ret), 'Return rate ' + F.pct(div(Math.abs(mo.ret), mo.gross)));
  const s3 = section(root, 'Growth monitor', BULAN[m - 1] + ' ' + y + ' dan performa berjalan', 'Pembanding historis bulan penuh'); const g3 = grid(s3, 'pj-g4');
  kpi(g3, 'MoM ' + BULAN[m - 1], F.g(g.mom), 'vs bulan sebelumnya', gstat(g.mom)); kpi(g3, 'vs AP3M', F.g(g.ap3m), 'Rata-rata 3 bulan sebelumnya', gstat(g.ap3m)); kpi(g3, 'vs AP3M12M', F.g(g.ap3m12m), '(AP3M + AVG 12 bulan) ÷ 2', gstat(g.ap3m12m));
  kpi(g3, 'PTD vs ' + BULAN[m - 1] + ' ' + (y - 1), F.g(g.ptd), 'Bulan sama tahun lalu', gstat(g.ptd)); kpi(g3, 'Growth YTD', F.g(g.ytd), 'vs periode sama', gstat(g.ytd)); kpi(g3, 'Growth AVG', F.g(g.avg), 'AVG YTD vs AVG ' + (y - 1) + ' penuh', gstat(g.avg)); kpi(g3, 'Growth YoY', F.g(g.yoy), 'Rolling 12 bulan', gstat(g.yoy));
  const two = grid(root, 'pj-two');
  const a = section(two, 'Perbandingan tahunan', 'Modern Trade per tahun', 'Historis full year');
  table(a, { download: 'MT per tahun', cols: [{ k: 'y', l: 'Tahun' }, { k: 'p', l: 'Periode' }, { k: 'tot', l: 'Total omzet', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rp, num: 1 }, { k: 'ro', l: 'Customer aktif', num: 1 }, { k: 'ae', l: 'AVG customer/bulan', f: F.n1, num: 1 }, { k: 'ec', l: 'EC', num: 1 }, { k: 'ret', l: 'Omzet retur', f: F.rp, num: 1 }, { k: 'rr', l: 'Return rate', f: (v) => F.pct(v), num: 1 }],
    rows: YEARS.filter((yy) => yy <= y).map((yy) => { const mm = yy === y ? m : 12; const z = ytd(sc, yy, mm, sm); return { y: String(yy), p: BLN[0] + '–' + BLN[mm - 1], tot: z.total, avg: z.avg, ro: z.ro, ae: z.avgEa, ec: z.ec, ret: z.ret, rr: div(Math.abs(z.ret), z.gross) }; }) });
  const b = section(two, 'Kontribusi merek', BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Net DPP YTD'); const bars = h('div', 'pj-bars');
  const mtBrands = [...new Set(ITEM.filter((i) => i.ch === 'MT').map((i) => i.brand))];
  const br = mtBrands.map((bb) => ({ b: bb, v: ytd(scope('mt', { cab: S.cab, sales: S.sales, brand: bb }), y, m, sm).total })).sort((p, q) => q.v - p.v); const tot = sum(br.map((x) => x.v));
  br.forEach((x) => { const row = h('div', 'pj-bar-row'); const bar = h('div', 'pj-bar'); const fill = h('i'); fill.style.width = Math.max(0, (x.v / (tot || 1)) * 100) + '%'; bar.append(fill); row.append(h('span', '', x.b), bar, h('b', '', F.pct(div(x.v, tot)))); bars.append(row); });
  b.append(bars);
  const cg = grid(root, 'pj-charts');
  chartCard(cg, { eyebrow: 'Tren omzet', title: 'Net DPP per bulan', labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), badge: 'Rp juta', series: yearSeries((ym) => mget(sc, ym).net) });
  chartCard(cg, { eyebrow: 'Customer aktif', title: 'Distinct customer per bulan', labels: BLN, tipLabels: BULAN, fmt: F.n, series: yearSeries((ym) => mget(sc, ym).ea) });
  chartCard(cg, { eyebrow: 'Return rate', title: '% retur terhadap sales', labels: BLN, tipLabels: BULAN, fmt: (v) => F.pct(v), axisFmt: (v) => F.pct(v, 0), series: yearSeries((ym) => div(Math.abs(mget(sc, ym).ret), mget(sc, ym).gross)) });
}

function viewRetail(root) {
  const y = S.year, m = S.month, end = ymOf(y, m), q = Math.floor((m - 1) / 3) + 1;
  const list = D.retail.filter((r) => (S.cab === 'ALL' || r.cab === S.cab) && r.o >= 0);
  const hd = h('div', 'pj-page-head'); const l = h('div');
  l.append(h('p', 'pj-eyebrow', 'Retail Modern · outlet pilihan'), h('h1', 'pj-page-title', list.length + ' Outlet Retail Modern · ' + CABNAMA[S.cab]));
  hd.append(l, h('p', 'pj-page-meta', BLN[0] + '–' + BLN[m - 1] + ' ' + y)); root.append(hd);
  const ctl = h('div', 'pj-inline');
  const mk = (lbl, opts, key) => { const s = h('select', 'pj-select'); opts.forEach(([v, t]) => s.append(new Option(t, v))); s.value = S[key]; s.addEventListener('change', () => { S[key] = s.value; render(); }); ctl.append(h('label', 'pj-lbl', lbl), s); };
  mk('Outlet', [['ALL', 'Semua outlet Retail Modern'], ...list.map((r) => [String(r.o), r.n])], 'rmOutlet');
  mk('Periode analisis', [['YTD', 'YTD'], ['Q', 'Kuartal'], ['M', 'Bulan']], 'rmPer');
  mk('Cakupan item', [['ALL', 'All Item (MT)'], ['FMT', D.focusMT.length + ' item fokus MT'], ['FGT', D.focusGT.length + ' item fokus GT']], 'rmItem');
  root.append(ctl);
  pdfRetailPanel(root, list);
  const outs = S.rmOutlet === 'ALL' ? new Set(list.map((r) => r.o)) : new Set([+S.rmOutlet]);
  const table0 = S.rmItem === 'FGT' ? 'gt' : 'mt';
  const fl = S.rmItem === 'FMT' ? D.focusMT : S.rmItem === 'FGT' ? D.focusGT : null;
  const items = fl ? new Set(ITEM.filter((i) => i.ch === (table0 === 'gt' ? 'GT' : 'MT') && fl.includes(i.n)).map((i) => i.i)) : null;
  const key = 'rm|' + S.rmOutlet + '|' + S.rmItem + '|' + S.cab;
  const sc = scope(table0, { key, cab: 'ALL', sales: -1, brand: 'ALL', outlets: outs, items });
  const per = S.rmPer === 'M' ? [end, end] : S.rmPer === 'Q' ? [ymOf(y, (q - 1) * 3 + 1), end] : [ymOf(y, 1), end];
  const nM = per[1] - per[0] + 1;
  const assortOf = (a, b) => { const s = new Set(); for (let k = a; k <= b; k++) for (const ln of mget(sc, k).lines || []) s.add(ln % 2000); return s.size; };
  const paOf = (a, b) => { const v = []; for (let k = a; k <= b; k++) { const s = new Set(); for (const ln of mget(sc, k).lines || []) s.add(ln % 2000); v.push(s.size); } return sum(v) / v.length; };
  const tot = netRange(sc, per[0], per[1]), totLy = netRange(sc, per[0] - 12, per[1] - 12), lyFull = netRange(sc, ymOf(y - 1, 1), ymOf(y - 1, 12)) / 12;
  const asr = assortOf(per[0], per[1]), apa = paOf(per[0], per[1]);
  const perLbl = S.rmPer === 'M' ? BULAN[m - 1] + ' ' + y : S.rmPer === 'Q' ? qLabel(q, per[0], per[1]) : BLN[0] + '–' + BLN[m - 1] + ' ' + y;
  const s1 = section(root, 'Performa Retail Modern', perLbl, S.rmItem === 'ALL' ? 'All Item' : S.rmItem === 'FMT' ? 'Item fokus MT' : 'Item fokus GT (transaksi GT)', 'pj-line-blue'); const g1 = grid(s1, 'pj-g4');
  kpi(g1, 'Total omzet', F.rp(tot), 'Net DPP · Sales + Retur'); kpi(g1, 'AVG omzet', F.rp(tot / nM), 'Rata-rata ' + nM + ' bulan');
  kpi(g1, 'Growth AVG', F.g(gr(tot / nM, lyFull)), 'AVG periode vs AVG ' + (y - 1) + ' penuh', gstat(gr(tot / nM, lyFull))); kpi(g1, 'Growth periode', F.g(gr(tot, totLy)), 'vs periode sama tahun lalu', gstat(gr(tot, totLy)));
  kpi(g1, 'Assortment', F.n(asr), 'Distinct Item NFI periode'); kpi(g1, 'AVG PA', F.n1(apa), 'Rata-rata SKU aktif/bulan'); kpi(g1, '%PA', F.pct(div(apa, asr)), 'AVG PA ÷ assortment');
  kpi(g1, 'Outlet sudah order', F.n(new Set([...Array(nM).keys()].flatMap((k) => [...(mget(sc, per[0] + k).outlets?.keys() || [])])).size) + '/' + outs.size, 'Outlet dengan Sales valid di periode');
  const two = grid(root, 'pj-two');
  table(section(two, 'Perbandingan tahunan', 'Performa Retail Modern', 'Historis full year'), { download: 'Retail Modern per tahun', cols: [{ k: 'y', l: 'Tahun' }, { k: 'p', l: 'Periode' }, { k: 'tot', l: 'Total omzet', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rp, num: 1 }, { k: 'as', l: 'Assortment', num: 1 }, { k: 'pa', l: 'AVG PA', f: F.n1, num: 1 }, { k: 'pp', l: '%PA', f: (v) => F.pct(v), num: 1 }],
    rows: YEARS.filter((yy) => yy <= y).map((yy) => { const mm = yy === y ? m : 12, a = ymOf(yy, 1), b = ymOf(yy, mm); const as = assortOf(a, b), pa = paOf(a, b); return { y: String(yy), p: BLN[0] + '–' + BLN[mm - 1], tot: netRange(sc, a, b), avg: netRange(sc, a, b) / mm, as, pa, pp: div(pa, as) }; }) });
  // penetrasi item
  const pen = new Map(); for (let k = per[0]; k <= per[1]; k++) for (const ln of mget(sc, k).lines || []) { const i = ln % 2000, o = Math.floor(ln / 2000); let s = pen.get(i); if (!s) pen.set(i, (s = new Set())); s.add(o); }
  const pr = section(two, 'Penetrasi item', 'Jumlah outlet yang sudah order', 'Top 20 · ' + perLbl); const bars = h('div', 'pj-bars');
  const penRows = (fl ? ITEM.filter((i) => items.has(i.i)) : [...pen.keys()].map((i) => ITEM[i])).map((it) => ({ n: it.n, c: pen.get(it.i)?.size || 0 })).sort((a, b) => b.c - a.c);
  penRows.slice(0, 20).forEach((x) => { const row = h('div', 'pj-bar-row'); const bar = h('div', 'pj-bar'); const fi = h('i'); fi.style.width = (x.c / outs.size) * 100 + '%'; bar.append(fi); row.append(h('span', '', x.n), bar, h('b', '', x.c + '/' + outs.size)); bars.append(row); }); pr.append(bars);
  const cg = grid(root, 'pj-charts');
  chartCard(cg, { eyebrow: 'Tren omzet', title: 'Net DPP bulanan', labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: yearSeries((ym) => mget(sc, ym).net) });
  chartCard(cg, { eyebrow: 'Tren PA', title: 'Rata-rata PA per outlet', note: 'Termasuk outlet belum order · ' + outs.size + ' outlet', labels: BLN, tipLabels: BULAN, fmt: F.n2, series: yearSeries((ym) => div(mget(sc, ym).line, outs.size)) });
  chartCard(cg, { eyebrow: 'Assortment kumulatif', title: 'Perkembangan SKU YTD', labels: BLN, tipLabels: BULAN, fmt: F.n, series: yearSeries((ym) => assortOf(ymOf(yOf(ym), 1), ym)) });
  chartCard(cg, { eyebrow: 'Tren %PA', title: '%PA berjalan', labels: BLN, tipLabels: BULAN, fmt: (v) => F.pct(v), axisFmt: (v) => F.pct(v, 0), series: yearSeries((ym) => div(paOf(ymOf(yOf(ym), 1), ym), assortOf(ymOf(yOf(ym), 1), ym))) });
  // monitoring item fokus
  const fs = section(root, 'Monitoring SKU fokus', 'Item fokus sesuai channel', perLbl);
  const fRows = [];
  for (const [lbl, tb, ch, flist] of [['MT', 'mt', 'MT', D.focusMT], ['GT', 'gt', 'GT', D.focusGT]]) {
    const ids = new Set(ITEM.filter((i) => i.ch === ch && flist.includes(i.n)).map((i) => i.i));
    const agg = new Map();
    for (const r of D[tb]) { if (!outs.has(r[1]) || !ids.has(r[2]) || r[3] < per[0] || r[3] > per[1]) continue; let a = agg.get(r[2]); if (!a) agg.set(r[2], (a = { v: 0, o: new Set() })); a.v += r[4]; if (r[6]) a.o.add(r[1]); }
    flist.forEach((n, k) => { const it = ITEM.find((i) => i.ch === ch && i.n === n); const a = it ? agg.get(it.i) : null; fRows.push({ ch: lbl, no: k + 1, n, o: a ? a.o.size : 0, pen: div(a ? a.o.size : 0, outs.size), v: a ? a.v : 0 }); });
  }
  table(fs, { download: 'Monitoring SKU fokus', note: 'Item fokus: 20 MT dari dashboard lama + 15 GT (11 dari dashboard lama + HiLo School Cokelat Susu, School Strawberry, School Vanilla Susu, 3in1 Coklat Belgia; ditambahkan 11 Nov 2026).', cols: [{ k: 'ch', l: 'Channel' }, { k: 'no', l: 'No', num: 1 }, { k: 'n', l: 'Item NFI' }, { k: 'o', l: 'Outlet order', num: 1 }, { k: 'pen', l: 'Penetrasi', f: (v) => F.pct(v), num: 1, cls: (x) => (x.o ? '' : 'pj-down') }, { k: 'v', l: 'Omzet', f: F.rp, num: 1 }], rows: fRows });
  // detail outlet
  const ds = section(root, 'Detail outlet', outs.size + ' outlet · ' + perLbl, '');
  const rows = list.filter((r) => outs.has(r.o)).map((r) => { const s1o = scope(table0, { key: key + '|o' + r.o, cab: 'ALL', sales: -1, brand: 'ALL', outlets: new Set([r.o]), items });
    const as = (() => { const s = new Set(); for (let k = per[0]; k <= per[1]; k++) for (const ln of mget(s1o, k).lines || []) s.add(ln % 2000); return s.size; })();
    const pa = (() => { const v = []; for (let k = per[0]; k <= per[1]; k++) v.push(mget(s1o, k).line); return sum(v) / v.length; })();
    const t1 = netRange(s1o, per[0], per[1]), ly1 = netRange(s1o, ymOf(y - 1, 1), ymOf(y - 1, 12)) / 12, lyp = netRange(s1o, per[0] - 12, per[1] - 12);
    return { n: r.n, cab: CABNAMA[r.cab], seg: r.seg, s: r.sales, tot: t1, avg: t1 / nM, ga: gr(t1 / nM, ly1), gp: gr(t1, lyp), as, pa, pp: div(pa, as), st: as ? 'Sudah order' : 'Belum order' }; });
  table(ds, { download: 'Detail outlet Retail Modern', search: 'Cari outlet', sort: 'tot', cols: [{ k: 'n', l: 'Outlet' }, { k: 'cab', l: 'Cabang' }, { k: 'seg', l: 'Segmen' }, { k: 's', l: 'Salesman' }, { k: 'tot', l: 'Total omzet', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rp, num: 1 },
    { k: 'ga', l: 'Growth AVG', f: F.g, num: 1, cls: (x) => gcls(x.ga) }, { k: 'gp', l: 'Growth periode', f: F.g, num: 1, cls: (x) => gcls(x.gp) }, { k: 'as', l: 'Assortment', num: 1 }, { k: 'pa', l: 'AVG PA', f: F.n1, num: 1 }, { k: 'pp', l: '%PA', f: (v) => F.pct(v), num: 1 }, { k: 'st', l: 'Status', cls: (x) => (x.as ? 'pj-up' : 'pj-down') }], rows,
    note: 'Daftar Retail Modern = toko non klasifikasi pilihan pengguna (11 Nov 2026): 13 outlet Parepare + 10 outlet Mamuju. Toko klasifikasi (Sejahtera Parepare & Pinrang, Varia Baru Mart, TK Baru Enrekang, Toserba Diana, Sinar Manis Rappang, CV Alam Jaya, Family Mart) tidak termasuk.' });
}

function viewMisi(root) {
  const y = S.year, m = S.month, end = ymOf(y, m), q = Math.floor((m - 1) / 3) + 1, qa = ymOf(y, (q - 1) * 3 + 1);
  const hd = h('div', 'pj-page-head'); const l = h('div');
  l.append(h('p', 'pj-eyebrow', 'Modern Trade · Misi Pasaraya'), h('h1', 'pj-page-title', 'Performance Misi Pasaraya'));
  hd.append(l, h('p', 'pj-page-meta', '4 outlet · ' + y + ' / ' + BLN[m - 1] + ' · Net Sales DPP · GT + MT')); root.append(hd);
  const ctl = h('div', 'pj-inline'); const mk = (lbl, opts, k) => { const s = h('select', 'pj-select'); opts.forEach(([v, t]) => s.append(new Option(t, v))); s.value = S[k]; s.addEventListener('change', () => { S[k] = s.value; render(); }); ctl.append(h('label', 'pj-lbl', lbl), s); };
  const SH = D.misiShip; mk('Outlet Misi', [['ALL', 'Semua outlet'], ...Object.entries(SH).map(([k, v]) => [k, v + ' · ' + k])], 'misiSt'); mk('Product channel', [['ALL', 'GT + MT'], ['GT', 'GT'], ['MT', 'MT']], 'misiCh'); root.append(ctl);
  const tx = D.misiTx.map((r) => { const d = new Date(Date.UTC(2023, 0, 1 + r[1])); return { st: r[0], day: r[1], ym: (d.getUTCFullYear() - Y0) * 12 + d.getUTCMonth(), it: ITEM[r[2]], bc: r[3], va: r[4], v: r[5] }; })
    .filter((r) => (S.misiSt === 'ALL' || r.st === S.misiSt) && (S.misiCh === 'ALL' || r.it.ch === S.misiCh));
  const blk = (a, b) => { const z = tx.filter((r) => r.ym >= a && r.ym <= b); const sl = z.filter((r) => r.va); return { net: sum(z.map((r) => r.v)), ea: new Set(sl.map((r) => r.st)).size, pa: new Set(sl.map((r) => r.it.i)).size, ord: new Set(sl.map((r) => r.st + '|' + r.day)).size, ret: sum(z.filter((r) => !r.va).map((r) => r.v)) }; };
  const Y = blk(ymOf(y, 1), end), LY = blk(ymOf(y - 1, 1), end - 12), Mo = blk(end, end), MLY = blk(end - 12, end - 12);
  const s1 = section(root, 'Sales overview YTD', BLN[0] + '–' + BLN[m - 1] + ' ' + y, '', 'pj-line-blue'); const g1 = grid(s1, 'pj-g6');
  kpi(g1, 'Net sales (DPP)', F.rp(Y.net), 'Sales + retur'); kpi(g1, 'AVG / bulan', F.rp(Y.net / m), m + ' bulan kalender'); kpi(g1, 'Growth vs tahun lalu', F.g(gr(Y.net, LY.net)), LY.net ? 'Periode yang sama' : 'Belum ada histori tahun lalu', gstat(gr(Y.net, LY.net)));
  kpi(g1, 'EA outlet', F.n(Y.ea), 'Outlet dengan transaksi sales'); kpi(g1, 'PA item', F.n(Y.pa), 'Varian GT/MT aktif'); kpi(g1, 'Order', F.n(Y.ord), 'Hari transaksi per outlet');
  const s2 = section(root, 'Bulan terpilih', BULAN[m - 1] + ' ' + y, '', 'pj-line-orange'); const g2 = grid(s2, 'pj-g6');
  kpi(g2, 'Net sales (DPP)', F.rp(Mo.net), 'Sales + retur'); kpi(g2, 'Growth vs tahun lalu', F.g(gr(Mo.net, MLY.net)), 'Bulan sama', gstat(gr(Mo.net, MLY.net))); kpi(g2, 'EA outlet', F.n(Mo.ea), 'Outlet dengan transaksi sales');
  kpi(g2, 'PA item', F.n(Mo.pa), 'Varian aktif'); kpi(g2, 'Order', F.n(Mo.ord), 'Hari transaksi per outlet'); kpi(g2, 'Retur', F.rp(Mo.ret), 'Bulan terpilih');
  const allTx = D.misiTx.map((r) => { const d = new Date(Date.UTC(2023, 0, 1 + r[1])); return { st: r[0], ym: (d.getUTCFullYear() - Y0) * 12 + d.getUTCMonth(), it: ITEM[r[2]], va: r[4], v: r[5], day: r[1] }; });
  const po = Object.entries(SH).filter(([k]) => S.misiSt === 'ALL' || k === S.misiSt).map(([k, n]) => { const z = allTx.filter((r) => r.st === k && r.ym >= ymOf(y, 1) && r.ym <= end);
    return { n: n + ' / ' + k, s: D.retail.find((r) => r.st === k)?.sales || '', ytd: sum(z.map((r) => r.v)), avg: sum(z.map((r) => r.v)) / m, mon: sum(z.filter((r) => r.ym === end).map((r) => r.v)), gt: sum(z.filter((r) => r.it.ch === 'GT').map((r) => r.v)), mt: sum(z.filter((r) => r.it.ch === 'MT').map((r) => r.v)), pa: new Set(z.filter((r) => r.va).map((r) => r.it.i)).size, ret: sum(z.filter((r) => !r.va).map((r) => r.v)) }; });
  table(section(root, 'Performance per outlet', 'YTD ' + y, ''), { download: 'Misi per outlet', cols: [{ k: 'n', l: 'Outlet / ShipTo' }, { k: 's', l: 'Salesman' }, { k: 'ytd', l: 'YTD', f: F.rp, num: 1 }, { k: 'avg', l: 'AVG / bulan', f: F.rp, num: 1 }, { k: 'mon', l: BULAN[m - 1], f: F.rp, num: 1 }, { k: 'gt', l: 'GT YTD', f: F.rp, num: 1 }, { k: 'mt', l: 'MT YTD', f: F.rp, num: 1 }, { k: 'pa', l: 'PA YTD', num: 1 }, { k: 'ret', l: 'Retur YTD', f: F.rp, num: 1 }], rows: po });
  const cg = grid(root, 'pj-charts'); const L = BLN;
  const mon = (ch) => BLN.map((_, i) => { const ym = ymOf(y, i + 1); if (ym > end) return null; return sum(tx.filter((r) => r.ym === ym && (!ch || r.it.ch === ch)).map((r) => r.v)); });
  chartCard(cg, { eyebrow: 'Omzet', title: 'Omzet GT dan MT · ' + y, labels: L, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: [{ name: 'GT', color: SERIES_COLORS[1], values: mon('GT') }, { name: 'MT', color: SERIES_COLORS[0], bold: 1, values: mon('MT') }] });
  chartCard(cg, { eyebrow: 'PA', title: 'Tren PA item · ' + y, labels: L, tipLabels: BULAN, fmt: F.n, series: [{ name: 'PA item', color: SERIES_COLORS[2], bold: 1, values: BLN.map((_, i) => { const ym = ymOf(y, i + 1); return ym > end ? null : new Set(tx.filter((r) => r.ym === ym && r.va).map((r) => r.it.i)).size; }) }] });
  // checklist 135 SKU
  const cs = section(root, 'Checklist item Misi', 'Master ' + D.misi.length + ' SKU aktif · Q' + q + ' ' + y, 'Merah / kuning / putih');
  cs.append(h('p', 'pj-note', 'Merah: belum pernah order sepanjang histori. Kuning: pernah order, belum order pada Q' + q + '. Putih: sudah order pada Q' + q + ' sampai ' + BULAN[m - 1] + '. Penetrasi = barcode unik master yang dibeli ÷ ' + D.misi.length + '. Padanan HiLo Teh Tarik 12R belum dikonfirmasi.'));
  pdfMisiPanel(cs);
  const bcOrd = new Map(); for (const r of D.misiTx) { if (!r[4] || !r[3]) continue; const d = new Date(Date.UTC(2023, 0, 1 + r[1])); const ym = (d.getUTCFullYear() - Y0) * 12 + d.getUTCMonth(); if (ym > end) continue; const ch = ITEM[r[2]].ch; const k = r[0] + '|' + ch + '|' + r[3]; const v = bcOrd.get(k) || { all: false, q: false, ytd: false }; v.all = true; if (ym >= qa) v.q = true; if (ym >= ymOf(y, 1)) v.ytd = true; bcOrd.set(k, v); }
  const stList = Object.keys(SH).filter((k) => S.misiSt === 'ALL' || k === S.misiSt);
  const status = (st, mm) => { const v = bcOrd.get(st + '|' + mm.Channel + '|' + mm.Barcode); return v?.q ? 'PUTIH' : v?.all ? 'KUNING' : 'MERAH'; };
  const sumRows = stList.map((st) => { const ss = D.misi.map((mm) => status(st, mm)); const ytdN = D.misi.filter((mm) => bcOrd.get(st + '|' + mm.Channel + '|' + mm.Barcode)?.ytd).length;
    return { n: SH[st], tot: D.misi.length, merah: ss.filter((x) => x === 'MERAH').length, kuning: ss.filter((x) => x === 'KUNING').length, putih: ss.filter((x) => x === 'PUTIH').length, pen: ytdN / D.misi.length, penQ: ss.filter((x) => x === 'PUTIH').length / D.misi.length }; });
  table(cs, { download: 'Checklist Misi ringkas', cols: [{ k: 'n', l: 'Outlet' }, { k: 'tot', l: 'Total item', num: 1 }, { k: 'merah', l: 'Merah', num: 1, cls: 'pj-down' }, { k: 'kuning', l: 'Kuning', num: 1 }, { k: 'putih', l: 'Putih', num: 1, cls: 'pj-up' }, { k: 'pen', l: 'Penetrasi YTD', f: (v) => F.pct(v), num: 1 }, { k: 'penQ', l: 'Penetrasi Q' + q, f: (v) => F.pct(v), num: 1 }], rows: sumRows });
  const detRows = D.misi.map((mm) => { const r = { no: +mm.No, ch: mm.Channel, bc: mm.Barcode, n: mm['Nama Item'] }; stList.forEach((st) => { r[st] = status(st, mm); }); return r; });
  table(cs, { download: 'Checklist Misi per SKU', search: 'Cari item atau barcode', tall: 1, sort: 'no', asc: 1, cols: [{ k: 'no', l: 'No', num: 1 }, { k: 'ch', l: 'Channel' }, { k: 'bc', l: 'Barcode' }, { k: 'n', l: 'Nama item' },
    ...stList.map((st) => ({ k: st, l: SH[st], cls: (x) => 'pj-chk pj-chk-' + x[st].toLowerCase() }))], rows: detRows });
}

// ====================== MDS ======================
const MD = D.mdsDim;
const mdsItem = MD.item.map((n) => ({ n, jupe: /JERUK PERAS/.test(n), tea: / TEA PLS/.test(n) && /^NS /.test(n) }));
const KLAS = (n) => MD.klas.indexOf(n), TIPE = (n) => MD.tipe.indexOf(n);
function mdsMonths(filter) {
  const M = new Map(); const ro = { all: new Map(), ns: new Map(), hl: new Map() };
  const NSb = MD.brand.indexOf('NUTRISARI'), HLb = MD.brand.indexOf('HILO'), kantin = TIPE('Kantin Sekolah'), retail = KLAS('Retail'), oper = KLAS('Operator'), blankSek = MD.sek.indexOf('');
  for (const r of D.mds) {
    if (!filter(r)) continue;
    const d = new Date(Date.UTC(2023, 0, 1 + r[6])); const ym = (d.getUTCFullYear() - Y0) * 12 + d.getUTCMonth();
    let x = M.get(ym); if (!x) M.set(ym, (x = { net: 0, ns: 0, nsRasa: 0, tea: 0, hl: 0, ea: new Set(), eaNs: new Set(), eaRasa: new Set(), eaHl: new Set(), sek: new Set(), kantin: new Set(), kios: new Set(), oper: new Set() }));
    const it = mdsItem[r[5]];
    if (r[8] === 1) { x.net += r[7]; if (r[4] === NSb) { x.ns += r[7]; if (!it.jupe) x.nsRasa += r[7]; if (it.tea) x.tea += r[7]; } if (r[4] === HLb) x.hl += r[7]; }
    if (r[9] !== 1) continue;
    const c = r[1]; x.ea.add(c); if (r[4] === NSb) { x.eaNs.add(c); if (!it.jupe) x.eaRasa.add(c); } if (r[4] === HLb) x.eaHl.add(c);
    if (r[11] === kantin) { x.kantin.add(c); if (r[12] !== blankSek) x.sek.add(r[12]); } if (r[10] === retail) x.kios.add(c); if (r[10] === oper) x.oper.add(c);
    const y = yOf(ym); for (const [k, ok] of [['all', true], ['ns', r[4] === NSb], ['hl', r[4] === HLb]]) { if (!ok) continue; let mp = ro[k].get(y); if (!mp) ro[k].set(y, (mp = new Map())); if (!(mp.get(c) <= ym)) mp.set(c, ym); }
  }
  return { M, ro, roAt: (k, ym) => [...(ro[k].get(yOf(ym)) || new Map()).values()].filter((v) => v <= ym).length };
}
const MDS_EMPTY = { net: 0, ns: 0, nsRasa: 0, tea: 0, hl: 0, ea: new Set(), eaNs: new Set(), eaRasa: new Set(), eaHl: new Set(), sek: new Set(), kantin: new Set(), kios: new Set(), oper: new Set() };
function mdsFilter(extra) { const mi = S.mds === 'ALL' ? -1 : MD.mds.indexOf(S.mds); return (r) => (mi < 0 || r[0] === mi) && (!extra || extra(r)); }

function viewMdsOverview(root) {
  const y = S.year, m = Math.min(S.month, 12), end = ymOf(y, m), st = ymOf(y, 1), n = end - st + 1;
  const hd = h('div', 'pj-page-head'); const l = h('div');
  l.append(h('p', 'pj-eyebrow', 'MDS overview · monitor pemerataan operator, kedai, dan kantin sekolah'), h('h1', 'pj-page-title', 'MDS Performance · ' + (S.mds === 'ALL' ? 'Semua MDS' : S.mds)));
  hd.append(l, h('p', 'pj-page-meta', 'Data terbaru ' + D.meta.mdsLast + ' · ' + BULAN[m - 1] + ' ' + y)); root.append(hd);
  root.append(h('p', 'pj-note pj-callout', 'Kesinambungan area: histori MDS lama dialihkan ke pemilik area terbaru (kolom MDS_Kesinambungan). 12 transaksi Qty ekstrem Muhlis 29–30 Juli 2026 dan baris duplikat sudah dikeluarkan. Histori MDS 2025 masih parsial.'));
  const R = mdsMonths(mdsFilter()); const g = (k) => R.M.get(k) || MDS_EMPTY; const L = []; for (let k = st; k <= end; k++) L.push(g(k));
  const tot = sum(L.map((x) => x.net));
  const s1 = section(root, 'Performa YTD', BLN[0] + '–' + BLN[m - 1] + ' ' + y, 'Average Januari–bulan terpilih', 'pj-line-blue'); const g1 = grid(s1, 'pj-g5');
  kpi(g1, 'Total omzet', F.rpFull(tot), BLN[0] + '–' + BLN[m - 1] + ' ' + y); kpi(g1, 'AVG omzet', F.rpFull(tot / n), 'Rata-rata per bulan'); kpi(g1, 'AVG omzet Nutrisari', F.rpFull(sum(L.map((x) => x.ns)) / n), 'Rata-rata per bulan'); kpi(g1, 'AVG omzet HiLo', F.rpFull(sum(L.map((x) => x.hl)) / n), 'Rata-rata per bulan');
  kpi(g1, 'RO total', F.n(R.roAt('all', end)), 'Customer unik YTD'); kpi(g1, 'AVG EA', F.n1(sum(L.map((x) => x.ea.size)) / n), 'Rata-rata EA bulanan'); kpi(g1, 'RO Nutrisari', F.n(R.roAt('ns', end)), 'Customer unik YTD');
  kpi(g1, 'AVG EA Nutrisari', F.n1(sum(L.map((x) => x.eaNs.size)) / n), 'Rata-rata EA bulanan'); kpi(g1, 'RO HiLo', F.n(R.roAt('hl', end)), 'Customer unik YTD'); kpi(g1, 'AVG EA HiLo', F.n1(sum(L.map((x) => x.eaHl.size)) / n), 'Rata-rata EA bulanan');
  const x = g(end);
  const s2 = section(root, 'Performa bulan terpilih', BULAN[m - 1] + ' ' + y, 'EA = distinct customer bulan terpilih', 'pj-line-orange'); const g2 = grid(s2, 'pj-g4');
  kpi(g2, 'Omzet Nutrisari all', F.rpFull(x.ns), 'Brand Nutrisari'); kpi(g2, 'Omzet Nutrisari rasa', F.rpFull(x.nsRasa), 'Nutrisari selain Jeruk Peras'); kpi(g2, 'Omzet Nutrisari tea', F.rpFull(x.tea), '6 rasa tea powder'); kpi(g2, 'Omzet HiLo', F.rpFull(x.hl), 'Brand HiLo');
  kpi(g2, 'EA total', F.n(x.ea.size), 'Customer unik'); kpi(g2, 'EA Nutrisari', F.n(x.eaNs.size), 'Customer unik'); kpi(g2, 'EA Nutrisari rasa', F.n(x.eaRasa.size), 'Tanpa Jeruk Peras'); kpi(g2, 'EA HiLo', F.n(x.eaHl.size), 'Customer unik');
  kpi(g2, 'EA operator', F.n(x.oper.size), 'Klasifikasi Operator'); kpi(g2, 'EA kios', F.n(x.kios.size), 'Klasifikasi Retail'); kpi(g2, 'EA sekolah', F.n(x.sek.size), 'Sekolah unik dari kantin sekolah'); kpi(g2, 'EA kantin sekolah', F.n(x.kantin.size), 'Customer tipe Kantin Sekolah');
  const cg = grid(root, 'pj-charts');
  const ser = (fn, fm, ax) => ({ labels: BLN, tipLabels: BULAN, fmt: fm, axisFmt: ax || fm, series: [y - 1, y].filter((yy) => [...R.M.keys()].some((k) => yOf(k) === yy)).map((yy) => ({ name: String(yy), color: YEAR_COLOR[yy], bold: yy === y, values: BLN.map((_, i) => { const k = ymOf(yy, i + 1); if (k > end || !R.M.has(k)) return null; return fn(R.M.get(k)); }) })) });
  const specs = [['Omzet total', (z) => z.net, F.rpFull, (v) => F.n(v / 1e6)], ['Omzet Nutrisari rasa', (z) => z.nsRasa, F.rpFull, (v) => F.n(v / 1e6)], ['Omzet HiLo', (z) => z.hl, F.rpFull, (v) => F.n(v / 1e6)], ['EA total', (z) => z.ea.size, F.n], ['EA Nutrisari', (z) => z.eaNs.size, F.n],
    ['EA Nutrisari rasa', (z) => z.eaRasa.size, F.n], ['EA HiLo', (z) => z.eaHl.size, F.n], ['EA operator', (z) => z.oper.size, F.n], ['EA kios', (z) => z.kios.size, F.n], ['EA sekolah', (z) => z.sek.size, F.n], ['EA kantin sekolah', (z) => z.kantin.size, F.n]];
  for (const [t, fn, fm, ax] of specs) chartCard(cg, Object.assign({ eyebrow: 'Tren bulanan', title: t, badge: ax ? 'Rp juta' : '' }, ser(fn, fm, ax)));
  const rows = []; for (let k = st; k <= end; k++) { const z = g(k); rows.push({ b: BULAN[mOf(k) - 1], net: z.net, rasa: z.nsRasa, hl: z.hl, ea: z.ea.size, ns: z.eaNs.size, er: z.eaRasa.size, eh: z.eaHl.size, op: z.oper.size, kios: z.kios.size, sek: z.sek.size, kan: z.kantin.size }); }
  table(section(root, 'Data grafik', 'Ringkasan per bulan', y), { download: 'MDS ringkasan bulanan', cols: [{ k: 'b', l: 'Bulan' }, { k: 'net', l: 'Omzet total', f: F.rpFull, num: 1 }, { k: 'rasa', l: 'Omzet NS rasa', f: F.rpFull, num: 1 }, { k: 'hl', l: 'Omzet HiLo', f: F.rpFull, num: 1 }, { k: 'ea', l: 'EA total', num: 1 }, { k: 'ns', l: 'EA NS', num: 1 }, { k: 'er', l: 'EA NS rasa', num: 1 }, { k: 'eh', l: 'EA HiLo', num: 1 }, { k: 'op', l: 'EA operator', num: 1 }, { k: 'kios', l: 'EA kios', num: 1 }, { k: 'sek', l: 'EA sekolah', num: 1 }, { k: 'kan', l: 'EA kantin', num: 1 }], rows });
  const per = MD.mds.map((nm, i) => { const Rm = mdsMonths((r) => r[0] === i); const gm = (k) => Rm.M.get(k) || MDS_EMPTY; const LL = []; for (let k = st; k <= end; k++) LL.push(gm(k)); const t = sum(LL.map((z) => z.net));
    return { n: nm, tot: t, avg: t / n, avgEa: sum(LL.map((z) => z.ea.size)) / n, ro: Rm.roAt('all', end), ea: gm(end).ea.size, net: gm(end).net, op: gm(end).oper.size, kios: gm(end).kios.size, sek: gm(end).sek.size, kan: gm(end).kantin.size }; });
  table(section(root, 'Per MDS', 'Performa per MDS · YTD dan ' + BULAN[m - 1], ''), { download: 'MDS per petugas', sort: 'tot', cols: [{ k: 'n', l: 'MDS' }, { k: 'tot', l: 'Omzet YTD', f: F.rpFull, num: 1 }, { k: 'avg', l: 'AVG omzet', f: F.rpFull, num: 1 }, { k: 'avgEa', l: 'AVG EA', f: F.n1, num: 1 }, { k: 'ro', l: 'RO YTD', num: 1 }, { k: 'net', l: 'Omzet ' + BLN[m - 1], f: F.rpFull, num: 1 }, { k: 'ea', l: 'EA ' + BLN[m - 1], num: 1 }, { k: 'op', l: 'Operator', num: 1 }, { k: 'kios', l: 'Kios', num: 1 }, { k: 'sek', l: 'Sekolah', num: 1 }, { k: 'kan', l: 'Kantin', num: 1 }], rows: per });
}

function viewMdsArea(root) {
  const y = S.year, m = S.month, end = ymOf(y, m), st = ymOf(y, 1), n = end - st + 1;
  const hd = h('div', 'pj-page-head'); const l = h('div'); l.append(h('p', 'pj-eyebrow', 'MDS · Area overview'), h('h1', 'pj-page-title', 'Kabupaten & kecamatan · ' + (S.mds === 'ALL' ? 'Semua MDS' : S.mds))); hd.append(l, h('p', 'pj-page-meta', BLN[0] + '–' + BLN[m - 1] + ' ' + y)); root.append(hd);
  const sel = h('select', 'pj-select'); sel.append(new Option('Semua kabupaten', '')); MD.kab.forEach((k) => sel.append(new Option(k, k))); sel.value = S.mdsKab || ''; sel.addEventListener('change', () => { S.mdsKab = sel.value; render(); });
  const bar = h('div', 'pj-inline'); bar.append(h('label', 'pj-lbl', 'Kabupaten'), sel); root.append(bar);
  const ki = S.mdsKab ? MD.kab.indexOf(S.mdsKab) : -1;
  const groups = ki < 0 ? MD.kab.map((k, i) => [k, (r) => r[2] === i]) : [...new Set(D.mds.filter((r) => r[2] === ki).map((r) => r[3]))].map((c) => [MD.kec[c], (r) => r[2] === ki && r[3] === c]);
  let grand = 0;
  const rows = groups.map(([nm, fn]) => { const R = mdsMonths(mdsFilter(fn)); const gm = (k) => R.M.get(k) || MDS_EMPTY; const LL = []; for (let k = st; k <= end; k++) LL.push(gm(k)); const t = sum(LL.map((z) => z.net)); grand += t;
    const ly = []; for (let k = st - 12; k <= end - 12; k++) ly.push(gm(k)); const tl = sum(ly.map((z) => z.net));
    return { n: nm, tot: t, avg: t / n, gy: gr(t, tl), avgEa: sum(LL.map((z) => z.ea.size)) / n, ro: R.roAt('all', end), ea: gm(end).ea.size, op: gm(end).oper.size, kios: gm(end).kios.size, sek: gm(end).sek.size, kan: gm(end).kantin.size, R }; }).filter((r) => r.tot || r.ro);
  rows.forEach((r) => { r.kon = div(r.tot, grand); });
  table(section(root, 'Area ranking', ki < 0 ? 'Per kabupaten' : 'Kecamatan di ' + S.mdsKab, 'Klik kabupaten untuk kecamatan'), { download: 'MDS area', sort: 'tot', rowClick: ki < 0 ? (r) => { S.mdsKab = r.n; render(); } : null,
    note: 'Growth YTD dibanding periode sama tahun lalu; histori MDS 2025 masih parsial sehingga growth bisa tidak sebanding.',
    cols: [{ k: 'n', l: ki < 0 ? 'Kabupaten' : 'Kecamatan' }, { k: 'tot', l: 'Omzet YTD', f: F.rpFull, num: 1 }, { k: 'kon', l: 'Kontribusi', f: (v) => F.pct(v), num: 1 }, { k: 'gy', l: 'Growth YTD', f: F.g, num: 1, cls: (x) => gcls(x.gy) }, { k: 'avg', l: 'AVG omzet', f: F.rpFull, num: 1 }, { k: 'avgEa', l: 'AVG EA', f: F.n1, num: 1 }, { k: 'ro', l: 'RO YTD', num: 1 }, { k: 'ea', l: 'EA ' + BLN[m - 1], num: 1 }, { k: 'op', l: 'Operator', num: 1 }, { k: 'kios', l: 'Kios', num: 1 }, { k: 'sek', l: 'Sekolah', num: 1 }, { k: 'kan', l: 'Kantin', num: 1 }], rows });
  const top5 = [...rows].sort((a, b) => b.tot - a.tot).slice(0, 5); const cg = grid(root, 'pj-charts');
  const ser = (fn) => top5.map((r, i) => ({ name: r.n, color: SERIES_COLORS[i], values: BLN.map((_, k) => { const ym = ymOf(y, k + 1); return ym > end ? null : fn(r.R.M.get(ym) || MDS_EMPTY); }) }));
  chartCard(cg, { eyebrow: 'Omzet', title: 'Tren omzet · top 5 · ' + y, labels: BLN, tipLabels: BULAN, fmt: F.rpFull, axisFmt: (v) => F.n(v / 1e6), unit: 'Rp juta', series: ser((z) => z.net) });
  chartCard(cg, { eyebrow: 'Aktivasi', title: 'Tren EA · top 5 · ' + y, labels: BLN, tipLabels: BULAN, fmt: F.n, series: ser((z) => z.ea.size) });
}

/* Kerangka aplikasi: state, header, filter, navigasi */
'use strict';
/* ====================== PDF unduhan (tanpa library luar) ======================
   pdfTable : daftar toko (A4 landscape), tabel ringkas dengan grup per salesman.
   pdfForm  : form kunjungan per toko (A4 portrait), item berwarna merah/kuning/putih
              + kolom Stok/Order kosong, catatan, tanggal kunjungan, paraf outlet. */
'use strict';
const PDFW = {
  r: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  b: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
};
const PCOL = { ink: [0.075, 0.137, 0.227], muted: [0.357, 0.42, 0.502], line: [0.80, 0.84, 0.89], head: [0.118, 0.106, 0.294], accent: [0.31, 0.275, 0.898],
  band: [0.933, 0.937, 0.992], zebra: [0.968, 0.975, 0.985], white: [1, 1, 1], red: [1, 0.80, 0.80], yellow: [1, 0.945, 0.66], redInk: [0.63, 0.14, 0.14], yelInk: [0.48, 0.35, 0] };
const pclean = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[·•]/g, '|').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ');
const pesc = (s) => pclean(s).replace(/[()\\]/g, (m) => '\\' + m);
const pwidth = (s, size, bold) => { const W = bold ? PDFW.b : PDFW.r; let t = 0; for (const ch of pclean(s)) t += W[ch.charCodeAt(0) - 32] || 556; return (t * size) / 1000; };
function pfit(s, width, size, bold) { s = pclean(s); if (pwidth(s, size, bold) <= width) return s; while (s.length > 1 && pwidth(s + '...', size, bold) > width) s = s.slice(0, -1); return s + '...'; }
function pwrap(s, width, size, bold, maxLines) {
  const words = pclean(s).split(/\s+/).filter(Boolean), lines = []; let line = '';
  for (const w0 of words) { let w = w0;
    while (pwidth(w, size, bold) > width) { let k = w.length; while (k > 1 && pwidth(w.slice(0, k), size, bold) > width) k--; if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, k)); w = w.slice(k); }
    const t = line ? line + ' ' + w : w; if (pwidth(t, size, bold) <= width) line = t; else { lines.push(line); line = w; } }
  if (line || !lines.length) lines.push(line);
  if (maxLines && lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = pfit(cut[maxLines - 1] + ' ' + lines.slice(maxLines).join(' '), width, size, bold); return cut; }
  return lines;
}
function PdfDoc(W, H) {
  const pages = []; let c = null; const col = (a) => a.map((v) => (+v).toFixed(3)).join(' ');
  const d = {
    W, H, pages,
    page() { c = { s: '' }; pages.push(c); return c; },
    text(x, y, s, size = 8, bold = false, color = PCOL.ink) { c.s += 'BT ' + col(color) + ' rg /F' + (bold ? 2 : 1) + ' ' + size + ' Tf 1 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Tm (' + pesc(s) + ') Tj ET\n'; },
    textR(xr, y, s, size, bold, color) { d.text(xr - pwidth(s, size, bold), y, s, size, bold, color); },
    rect(x, y, w, h, fill, stroke, lw = 0.5) { if (fill) c.s += 'q ' + col(fill) + ' rg ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1) + ' re f Q\n';
      if (stroke) c.s += 'q ' + col(stroke) + ' RG ' + lw + ' w ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1) + ' re S Q\n'; },
    line(x1, y1, x2, y2, color = PCOL.line, lw = 0.6) { c.s += 'q ' + col(color) + ' RG ' + lw + ' w ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' m ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' l S Q\n'; },
    blob() {
      const obj = { 1: '<< /Type /Catalog /Pages 2 0 R >>', 3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>' };
      const kids = [];
      pages.forEach((p, i) => { const pid = 5 + i * 2, cid = pid + 1; kids.push(pid + ' 0 R');
        obj[pid] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>';
        obj[cid] = '<< /Length ' + p.s.length + ' >>\nstream\n' + p.s + 'endstream'; });
      obj[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';
      const max = Math.max(...Object.keys(obj).map(Number)); let pdf = '%PDF-1.4\n'; const off = [0];
      for (let i = 1; i <= max; i++) { off[i] = pdf.length; pdf += i + ' 0 obj\n' + obj[i] + '\nendobj\n'; }
      const x = pdf.length; pdf += 'xref\n0 ' + (max + 1) + '\n0000000000 65535 f \n';
      for (let i = 1; i <= max; i++) pdf += String(off[i]).padStart(10, '0') + ' 00000 n \n';
      pdf += 'trailer\n<< /Size ' + (max + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
      return new Blob([pdf], { type: 'application/pdf' });
    },
  };
  return d;
}
const pdfStamp = () => { const t = new Date(); return 'Dashboard Pareju | ' + (D.meta.partial ? 'data s.d. ' : 'closing ') + D.meta.closing.split('-').reverse().join('-') + ' | dicetak ' + t.getDate() + ' ' + BLN[t.getMonth()] + ' ' + t.getFullYear(); };
function pdfSave(blob, file) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_') + '.pdf'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

/* cfg: {title, sub, cols:[{l, w, a:'l'|'r'|'c', v:(row)=>text}], rows, group:(row)=>label, file, note, empty} */
function pdfTable(cfg) {
  const W = 842, H = 595, M = 28, d = PdfDoc(W, H), usable = W - 2 * M, fs = 7.5, lh = 9.2, pad = 4;
  const tw = sum(cfg.cols.map((c) => c.w)); const cw = cfg.cols.map((c) => (c.w / tw) * usable);
  const cells = (vals, bold) => vals.map((v, i) => (cfg.cols[i].a === 'l' || !cfg.cols[i].a ? pwrap(v, cw[i] - 2 * pad, fs, bold, 3) : [pfit(v, cw[i] - 2 * pad, fs, bold)]));
  let y = 0;
  const header = () => {
    d.page();
    d.rect(0, H - 6, W, 6, PCOL.accent);
    d.text(M, H - 34, cfg.title, 15, true, PCOL.head);
    d.text(M, H - 50, cfg.sub || '', 8.5, false, PCOL.muted);
    d.textR(W - M, H - 34, pfit(cfg.count || '', 220, 9, true), 9, true, PCOL.accent);
    y = H - 64;
    const hv = cfg.cols.map((c) => c.l), hl = cells(hv, true), hh = Math.max(...hl.map((l) => l.length)) * lh + 2 * pad;
    let x = M; hl.forEach((ls, i) => { d.rect(x, y - hh, cw[i], hh, PCOL.head); ls.forEach((t, k) => { const ty = y - pad - 7 - k * lh; if (cfg.cols[i].a === 'r') d.textR(x + cw[i] - pad, ty, t, fs, true, PCOL.white); else if (cfg.cols[i].a === 'c') d.text(x + (cw[i] - pwidth(t, fs, true)) / 2, ty, t, fs, true, PCOL.white); else d.text(x + pad, ty, t, fs, true, PCOL.white); }); x += cw[i]; });
    y -= hh;
  };
  const bottom = 34;
  header();
  const rows = cfg.rows.length ? cfg.rows : null;
  if (!rows) { d.text(M + 6, y - 18, cfg.empty || 'Tidak ada outlet untuk filter ini.', 9, false, PCOL.muted); }
  let lastG = null, zi = 0;
  for (const r of rows || []) {
    if (cfg.group) { const g = cfg.group(r); if (g !== lastG) { if (y - 16 - lh - 2 * pad < bottom) header(); d.rect(M, y - 16, usable, 16, PCOL.band, PCOL.line, 0.4); d.text(M + 6, y - 11.5, g + (cfg.groupCount ? '  (' + cfg.groupCount(g) + ')' : ''), 8, true, PCOL.head); y -= 16; lastG = g; zi = 0; } }
    const vals = cfg.cols.map((c) => c.v(r)); const cl = cells(vals, false); const rh = Math.max(...cl.map((l) => l.length)) * lh + 2 * pad - 1;
    if (y - rh < bottom) { header(); if (cfg.group) { d.rect(M, y - 16, usable, 16, PCOL.band, PCOL.line, 0.4); d.text(M + 6, y - 11.5, lastG + ' (lanjutan)', 8, true, PCOL.head); y -= 16; } }
    let x = M; if (zi++ % 2) d.rect(M, y - rh, usable, rh, PCOL.zebra);
    cl.forEach((ls, i) => { d.rect(x, y - rh, cw[i], rh, null, PCOL.line, 0.35); const color = cfg.cols[i].color ? cfg.cols[i].color(r) : PCOL.ink;
      ls.forEach((t, k) => { const ty = y - pad - 6.5 - k * lh; if (cfg.cols[i].a === 'r') d.textR(x + cw[i] - pad, ty, t, fs, false, color); else if (cfg.cols[i].a === 'c') d.text(x + (cw[i] - pwidth(t, fs)) / 2, ty, t, fs, false, color); else d.text(x + pad, ty, t, fs, false, color); }); x += cw[i]; });
    y -= rh;
  }
  if (cfg.note) { const nl = pwrap(cfg.note, usable, 7); if (y - 14 - nl.length * 9 < bottom) header(); nl.forEach((t, k) => d.text(M, y - 14 - k * 9, t, 7, false, PCOL.muted)); }
  const n = d.pages.length; d.pages.forEach((p, i) => { p.s += 'BT ' + PCOL.muted.join(' ') + ' rg /F1 7 Tf 1 0 0 1 ' + M + ' 18 Tm (' + pesc(pdfStamp()) + ') Tj ET\n';
    const t = 'Halaman ' + (i + 1) + ' / ' + n; p.s += 'BT ' + PCOL.muted.join(' ') + ' rg /F1 7 Tf 1 0 0 1 ' + (W - M - pwidth(t, 7)).toFixed(1) + ' 18 Tm (' + pesc(t) + ') Tj ET\n'; });
  pdfSave(d.blob(), cfg.file);
}

/* cfg: {title, file, legend:{red, yellow, ok}, barcode:bool, outlets:[{name, info:[[label, value]], summary, items:[{g, bc, n, st:'red'|'yellow'|'ok', last}]}]} */
function pdfForm(cfg) {
  const W = 595, H = 842, M = 24, d = PdfDoc(W, H), usable = W - 2 * M, fs = 7;
  const defs = [['No', 22, 'c'], ['Grup', 30, 'c'], ...(cfg.barcode ? [['Barcode', 66, 'l']] : []), ['Nama item', 0, 'l'], ['Status', 70, 'l'], ['Terakhir order', 56, 'c'], ['Stok', 38, 'c'], ['Order', 38, 'c']];
  const fixed = sum(defs.map((x) => x[1])); defs.forEach((x) => { if (!x[1]) x[1] = usable - fixed; });
  const fill = (st) => (st === 'red' ? PCOL.red : st === 'yellow' ? PCOL.yellow : PCOL.white);
  const stInk = (st) => (st === 'red' ? PCOL.redInk : st === 'yellow' ? PCOL.yelInk : PCOL.ink);
  const pageNo = [];
  for (const o of cfg.outlets) {
    const items = o.items; let i = 0, part = 0; const first = d.pages.length;
    const infoH = Math.ceil((o.info || []).length / 2) * 11 + 4 + (o.summary ? 20 : 0);
    const rowH = Math.max(11, Math.min(15, Math.floor((H - 62 - infoH - 16 - 15 - 34 - 92) / Math.max(1, items.length))));
    const ty = (y) => y - rowH + (rowH - 5) / 2;
    do {
      d.page(); pageNo.push(o.name); part++;
      d.rect(0, H - 6, W, 6, PCOL.accent);
      d.text(M, H - 30, cfg.title, 13, true, PCOL.head);
      d.textR(W - M, H - 30, pfit(cfg.period || '', 220, 8.5, true), 8.5, true, PCOL.accent);
      d.text(M, H - 47, pfit(o.name + (part > 1 ? ' (lanjutan)' : ''), usable, 10.5, true), 10.5, true, PCOL.ink);
      let y = H - 62;
      if (part === 1) {
        const info = o.info || []; const half = Math.ceil(info.length / 2), colW = usable / 2;
        info.forEach(([l, v], k) => { const x = M + (k < half ? 0 : colW), yy = y - (k % half) * 11; d.text(x, yy, l + ':', 7.5, true, PCOL.muted); d.text(x + 64, yy, pfit(v, colW - 70, 7.5), 7.5, false, PCOL.ink); });
        y -= half * 11 + 4;
        if (o.summary) { d.rect(M, y - 15, usable, 16, PCOL.band); d.text(M + 6, y - 10.5, pfit(o.summary, usable - 12, 8, true), 8, true, PCOL.head); y -= 20; }
      }
      // legenda
      let lx = M; [['red', cfg.legend.red], ['yellow', cfg.legend.yellow], ['ok', cfg.legend.ok]].forEach(([st, t]) => { d.rect(lx, y - 9, 10, 8, fill(st), PCOL.line); d.text(lx + 14, y - 7.5, t, 6.8, false, PCOL.muted); lx += 18 + pwidth(t, 6.8) + 14; });
      y -= 16;
      let x = M; defs.forEach(([l, w]) => { d.rect(x, y - rowH, w, rowH, PCOL.head); d.text(x + (w - pwidth(l, 7, true)) / 2, ty(y), l, 7, true, PCOL.white); x += w; }); y -= rowH;
      const reserve = 92;
      while (i < items.length) {
        const isLast = i === items.length - 1;
        if (y - rowH < (isLast ? 34 + reserve : 34)) break;
        const it = items[i], bg = fill(it.st); x = M;
        const vals = [String(i + 1), it.g || '', ...(cfg.barcode ? [it.bc || '-'] : []), it.n, it.stLbl || '', it.last || '-', '', ''];
        defs.forEach(([, w, a], k) => { d.rect(x, y - rowH, w, rowH, bg, PCOL.line, 0.4); const t = pfit(vals[k], w - 6, fs, false); const color = k === defs.length - 4 ? stInk(it.st) : PCOL.ink;
          if (a === 'c') d.text(x + (w - pwidth(t, fs)) / 2, ty(y), t, fs, false, color); else d.text(x + 3, ty(y), t, fs, k === defs.length - 4 && it.st !== 'ok', color); x += w; });
        y -= rowH; i++;
      }
      if (!items.length) { d.text(M + 6, y - 14, 'Tidak ada item.', 8, false, PCOL.muted); y -= 20; }
      if (i >= items.length) {
        y -= 16; d.text(M, y, 'Catatan salesman:', 7.5, true, PCOL.ink);
        for (let k = 0; k < 3; k++) d.line(M, y - 15 - k * 15, W - M, y - 15 - k * 15);
        y -= 66; d.text(M, y, 'Tanggal kunjungan: ______________________', 7.5, false, PCOL.ink); d.text(W - M - 200, y, 'Paraf outlet: ______________________', 7.5, false, PCOL.ink);
      }
    } while (i < items.length);
    void first;
  }
  if (!cfg.outlets.length) { d.page(); d.text(M, H - 40, cfg.title, 13, true, PCOL.head); d.text(M, H - 60, cfg.empty || 'Tidak ada outlet untuk filter ini.', 9, false, PCOL.muted); }
  const n = d.pages.length; d.pages.forEach((p, k) => { p.s += 'BT ' + PCOL.muted.join(' ') + ' rg /F1 6.8 Tf 1 0 0 1 ' + M + ' 16 Tm (' + pesc(pdfStamp()) + ') Tj ET\n';
    const t = 'Halaman ' + (k + 1) + ' / ' + n; p.s += 'BT ' + PCOL.muted.join(' ') + ' rg /F1 6.8 Tf 1 0 0 1 ' + (W - M - pwidth(t, 6.8)).toFixed(1) + ' 16 Tm (' + pesc(t) + ') Tj ET\n'; });
  pdfSave(d.blob(), cfg.file);
}

/* panel tombol PDF */
function pdfPanel(parent, title, note) {
  const p = h('div', 'pj-pdf'); const top = h('div', 'pj-pdf-top'); top.append(h('p', 'pj-pdf-t', title)); if (note) top.append(h('p', 'pj-pdf-n', note)); p.append(top);
  const g = h('div', 'pj-pdf-grid'); p.append(g); parent.append(p); return { panel: p, grid: g };
}
function pdfButton(grid, label, sub, fn) {
  const b = h('button', 'pj-pdf-b'); b.type = 'button';
  const ic = h('span', 'pj-pdf-ic', 'PDF'); const tx = h('span', 'pj-pdf-tx'); tx.append(h('b', '', label), h('small', '', sub || ''));
  b.append(ic, tx);
  b.addEventListener('click', () => { b.disabled = true; b.classList.add('busy'); setTimeout(() => { try { fn(); } catch (e) { console.error(e); alert('PDF gagal dibuat: ' + e.message); } b.disabled = false; b.classList.remove('busy'); }, 30); });
  grid.append(b); return b;
}

/* ====================== PDF per halaman ====================== */
'use strict';
const FJP_BY_O = (() => { const m = new Map(); for (const r of D.fjp) if (r.o >= 0 && !m.has(r.o)) m.set(r.o, r); return m; })();
const pRp = (v) => (v == null || !isFinite(v) ? '-' : 'Rp ' + nf(0).format(Math.round(v)));
const pG = (v) => (v == null || !isFinite(v) ? '-' : (v > 0 ? '+' : '') + nf(1).format(v * 100) + '%');
const shipOf = (o) => (o >= 0 && OUT[o] ? OUT[o].st.join(' / ') : '-');
const dateLbl = (code) => { if (code == null || code < 0) return '-'; const ym = Math.floor(code / 100), dd = code % 100; return String(dd).padStart(2, '0') + ' ' + BLN[mOf(ym) - 1] + ' ' + yOf(ym); };
const scopeTxt = () => CABNAMA[S.cab] + ' | ' + (S.sales >= 0 ? SALES[S.sales].n : 'Total cabang');
const fileStamp = () => S.year + '-' + String(S.month).padStart(2, '0');
const qInfo = () => { const y = S.year, m = S.month, q = Math.floor((m - 1) / 3) + 1, qa = ymOf(y, (q - 1) * 3 + 1), end = ymOf(y, m); return { y, m, q, qa, end, lbl: qLabel(q, qa, end), short: 'Q' + q + ' ' + y }; };

// terakhir order (kode ym*100+hari) per outlet, opsional per merek
function lastOrders(table, outlets, brand, end) {
  const res = new Map();
  for (const r of D[table]) { if (!r[6] || r[3] > end) continue; if (outlets && !outlets.has(r[1])) continue; if (brand && brand !== 'ALL' && ITEM[r[2]].brand !== brand) continue;
    const c = r[3] * 100 + (32 - Math.clz32(r[6])); if (!(res.get(r[1]) >= c)) res.set(r[1], c); }
  return res;
}
// riwayat item per outlet: Map(o -> Map(item -> kode terakhir order))
function itemLast(table, outlets, end) {
  const res = new Map();
  for (const r of D[table]) { if (!r[6] || r[3] > end || !outlets.has(r[1])) continue; let m = res.get(r[1]); if (!m) res.set(r[1], (m = new Map()));
    const c = r[3] * 100 + (32 - Math.clz32(r[6])); if (!(m.get(r[2]) >= c)) m.set(r[2], c); }
  return res;
}
const stOf = (code, qa) => (code == null ? 'red' : Math.floor(code / 100) >= qa ? 'ok' : 'yellow');
const RANK = { red: 0, yellow: 1, ok: 2 };
const legendOf = (Q) => ({ red: 'Merah: belum pernah order', yellow: 'Kuning: pernah order, belum order ' + Q.short, ok: 'Putih: sudah order ' + Q.lbl });
const stLbl = (st, Q) => (st === 'red' ? 'Belum pernah' : st === 'yellow' ? 'Belum ' + 'Q' + Q.q : 'Sudah Q' + Q.q);
const countSt = (items) => { const c = { red: 0, yellow: 0, ok: 0 }; items.forEach((x) => c[x.st]++); return 'Merah ' + c.red + '  |  Kuning ' + c.yellow + '  |  Putih ' + c.ok + '  |  Total ' + items.length + ' item'; };

// salesman dari filter halaman (atas)
const curSales = () => (S.sales >= 0 ? SALES[S.sales].n : null);

/* ---------- daftar bersama ---------- */
function rowsDormant(Q, brand, filterFjp) {
  const elig = fjpEligible(S.cab, S.sales).filter((r) => !filterFjp || filterFjp(r));
  const z = quarter('gt', { cab: S.cab, sales: S.sales, brand: 'ALL' }, Q.y, Q.q, Q.end);
  const has = brand === 'NUTRISARI' ? z.nsSets : brand === 'HILO' ? z.hlSets : z.outlets;
  const list = elig.filter((r) => r.o < 0 || !has.has(r.o));
  const set = new Set(list.filter((r) => r.o >= 0).map((r) => r.o));
  const os = outletStats('gt', { cab: 'ALL', sales: -1, brand: brand || 'ALL', outlets: set }, Q.y, Q.m);
  const last = lastOrders('gt', set, brand, Q.end);
  return list.map((r) => ({ sr: r.sr || '(tanpa salesman)', k: r.k, n: r.n, vd: r.vd || '-', kec: r.o >= 0 ? OUT[r.o].kec : '-', avg: r.o >= 0 ? os.get(r.o)?.avg || 0 : 0, last: r.o >= 0 ? last.get(r.o) : null }))
    .sort((a, b) => a.sr.localeCompare(b.sr) || b.avg - a.avg || a.n.localeCompare(b.n));
}
function pdfDormant(Q, brand, extra) {
  const bl = brand === 'NUTRISARI' ? 'Nutrisari' : brand === 'HILO' ? 'HiLo' : 'Semua Merek';
  const rows = rowsDormant(Q, brand, extra && extra.filter); const cnt = new Map(); rows.forEach((r) => cnt.set(r.sr, (cnt.get(r.sr) || 0) + 1));
  pdfTable({ title: 'Outlet Belum Transaksi ' + Q.short + ' - ' + bl, sub: scopeTxt() + (extra && extra.area ? ' | ' + extra.area : '') + ' | ' + Q.lbl + ' | master FJP aktif (tanpa NOO)', count: rows.length + ' outlet',
    cols: [{ l: 'No', w: 4, a: 'c', v: (r) => r.no }, { l: 'ShipTo', w: 11, v: (r) => r.k }, { l: 'Outlet', w: 34, v: (r) => r.n }, { l: 'Kecamatan', w: 13, v: (r) => r.kec }, { l: 'Hari kunjungan', w: 12, v: (r) => r.vd },
      { l: 'AVG ' + bl + ' ' + Q.y, w: 13, a: 'r', v: (r) => pRp(r.avg) }, { l: 'Terakhir order', w: 11, a: 'c', v: (r) => dateLbl(r.last) }],
    rows: rows.map((r, i) => Object.assign(r, { no: i + 1 })), group: (r) => r.sr, groupCount: (g) => cnt.get(g) + ' outlet',
    note: 'Outlet aktif di master FJP (tanpa slot NOO) yang belum punya transaksi Sales valid ' + (brand ? bl + ' ' : '') + 'sejak awal ' + Q.lbl + '. AVG = rata-rata omzet net ' + bl + ' Jan-' + BLN[Q.m - 1] + ' ' + Q.y + '.',
    file: 'Belum_Transaksi_' + Q.short.replace(' ', '_') + '_' + bl + '_' + CABNAMA[S.cab] + (extra && extra.area ? '_' + extra.area : '') + '_' + fileStamp() });
}
function rowsGrowth(brand, dir, outlets) {
  const y = S.year, m = S.month, os = outletStats('gt', { cab: S.cab, sales: S.sales, brand, outlets: outlets || null }, y, m);
  return [...os.values()].filter((x) => x.gAvg != null && (dir > 0 ? x.gAvg > 0 : x.gAvg < 0)).sort((a, b) => b.avg - a.avg)
    .map((x) => ({ o: x.o, n: OUT[x.o].n, k: shipOf(x.o), s: SALES[x.mainSales]?.n || '', kab: OUT[x.o].kab, kec: OUT[x.o].kec, ly: x.avgLy, cur: x.avg, g: x.gAvg, last: x.last }));
}
function pdfGrowth(brand, dir, extra) {
  const lim = S.sales >= 0 ? 20 : 100, bl = brand === 'ALL' ? 'Semua Merek' : brand === 'NUTRISARI' ? 'Nutrisari' : brand === 'HILO' ? 'HiLo' : brand;
  const all = rowsGrowth(brand, dir, extra && extra.outlets), rows = all.slice(0, lim).map((r, i) => Object.assign(r, { no: i + 1 })), y = S.year;
  pdfTable({ title: 'Top ' + lim + ' Outlet Growth AVG ' + (dir > 0 ? 'Positif' : 'Negatif') + ' - ' + bl, sub: scopeTxt() + (extra && extra.area ? ' | ' + extra.area : '') + ' | Jan-' + BLN[S.month - 1] + ' ' + y + ' vs AVG ' + (y - 1) + ' penuh',
    count: rows.length + ' dari ' + all.length + ' outlet',
    cols: [{ l: 'No', w: 4, a: 'c', v: (r) => r.no }, { l: 'Outlet', w: 30, v: (r) => r.n }, { l: 'ShipTo', w: 11, v: (r) => r.k }, { l: 'Sales', w: 13, v: (r) => r.s }, { l: 'Kecamatan', w: 12, v: (r) => r.kec },
      { l: 'AVG ' + (y - 1), w: 11, a: 'r', v: (r) => pRp(r.ly) }, { l: 'AVG ' + y, w: 11, a: 'r', v: (r) => pRp(r.cur) }, { l: 'Growth AVG', w: 8, a: 'r', v: (r) => pG(r.g), color: (r) => (r.g < 0 ? PCOL.redInk : [0.08, 0.5, 0.28]) }, { l: 'Terakhir order', w: 10, a: 'c', v: (r) => dateLbl(r.last) }],
    rows, note: 'Urut dari AVG ' + y + ' terbesar. Growth AVG = AVG Jan-' + BLN[S.month - 1] + ' ' + y + ' dibanding AVG Jan-Des ' + (y - 1) + '; outlet tanpa transaksi ' + (y - 1) + ' tidak dihitung. Top 100 untuk total cabang, Top 20 untuk satu salesman.',
    file: 'Growth_' + (dir > 0 ? 'Positif' : 'Negatif') + '_' + bl + '_' + CABNAMA[S.cab] + (extra && extra.area ? '_' + extra.area : '') + '_' + fileStamp() });
}
function pdfF3(sc, extra) {
  const y = S.year, m = S.month, end = ymOf(y, m), t = ytd(sc, y, m, S.sales >= 0), set = new Set(t.f3list);
  const os = outletStats('gt', { cab: 'ALL', sales: -1, brand: S.brand, outlets: set }, y, m), own = new Map(); for (const o of set) own.set(o, SALES[outletOwner(o)]?.n || '(tanpa salesman)');
  const last = lastOrders('gt', set, S.brand, end);
  const rows = [...set].map((o) => ({ sr: own.get(o), n: OUT[o].n, k: shipOf(o), kab: OUT[o].kab, kec: OUT[o].kec, ytd: os.get(o)?.ytd || 0, last: last.get(o), vd: FJP_BY_O.get(o)?.vd || '-' }))
    .sort((a, b) => a.sr.localeCompare(b.sr) || b.ytd - a.ytd).map((r, i) => Object.assign(r, { no: i + 1 }));
  const cnt = new Map(); rows.forEach((r) => cnt.set(r.sr, (cnt.get(r.sr) || 0) + 1));
  pdfTable({ title: 'Daftar Outlet F3=0', sub: scopeTxt() + ' | ' + brandName() + (extra && extra.area ? ' | ' + extra.area : '') + ' | RO Jan-' + BLN[m - 1] + ' ' + y + ', tanpa order ' + BLN[(m + 9) % 12] + '-' + BLN[m - 1], count: rows.length + ' outlet | ' + F.pct(t.f3pct) + ' dari RO',
    cols: [{ l: 'No', w: 4, a: 'c', v: (r) => r.no }, { l: 'Outlet', w: 32, v: (r) => r.n }, { l: 'ShipTo', w: 11, v: (r) => r.k }, { l: 'Kabupaten', w: 11, v: (r) => r.kab }, { l: 'Kecamatan', w: 12, v: (r) => r.kec },
      { l: 'Hari kunjungan', w: 10, v: (r) => r.vd }, { l: 'Omzet YTD', w: 11, a: 'r', v: (r) => pRp(r.ytd) }, { l: 'Terakhir order', w: 10, a: 'c', v: (r) => dateLbl(r.last) }],
    rows, group: (r) => r.sr, groupCount: (g) => cnt.get(g) + ' outlet',
    note: 'F3=0 = outlet yang sudah order sejak Januari ' + y + ' (RO) tetapi tidak order dalam 3 bulan terakhir. Salesman = pemilik outlet 12 bulan terakhir.',
    file: 'F3-0_' + CABNAMA[S.cab] + (extra && extra.area ? '_' + extra.area : '') + '_' + fileStamp() });
}

/* ---------- DPI ---------- */
function nsActiveItems(cab, end) { const s = new Set(); for (const r of D.gt) { if (!r[6] || r[3] < end - 11 || r[3] > end) continue; if (cab !== 'ALL' && OUT[r[1]].cab !== cab) continue; if (ITEM[r[2]].brand === 'NUTRISARI') s.add(r[2]); } return s; }
function pdfNsForm(Q, nsSets, salesName) {
  let outs = [...nsSets].filter(([, v]) => v.size >= 5 && v.size < 10).map(([o, v]) => ({ o, v: v.size, s: SALES[outletOwner(o)]?.n || '(tanpa salesman)' }));
  if (salesName) outs = outs.filter((x) => x.s === salesName);
  outs.sort((a, b) => a.s.localeCompare(b.s) || b.v - a.v || OUT[a.o].n.localeCompare(OUT[b.o].n));
  const set = new Set(outs.map((x) => x.o)), hist = itemLast('gt', set, Q.end), act = new Map();
  const forms = outs.map((x) => { const O = OUT[x.o], cab = O.cab; if (!act.has(cab)) act.set(cab, nsActiveItems(cab, Q.end));
    const hm = hist.get(x.o) || new Map(), ids = new Set(act.get(cab)); for (const i of hm.keys()) if (ITEM[i].brand === 'NUTRISARI') ids.add(i);
    const items = [...ids].map((i) => { const st = stOf(hm.get(i), Q.qa); return { g: 'NS', n: ITEM[i].n, st, stLbl: stLbl(st, Q), last: dateLbl(hm.get(i)) }; })
      .sort((a, b) => RANK[a.st] - RANK[b.st] || a.n.localeCompare(b.n));
    const fj = FJP_BY_O.get(x.o);
    return { name: O.n, info: [['ShipTo', shipOf(x.o)], ['Cabang', CABNAMA[cab]], ['Salesman', x.s], ['Kabupaten', O.kab], ['Kecamatan', O.kec], ['Hari kunjungan', fj?.vd || '-']],
      summary: 'Varian Nutrisari ' + Q.short + ': ' + x.v + '/10 (kurang ' + (10 - x.v) + ' varian)   |   ' + countSt(items), items }; });
  pdfForm({ title: 'FORM PUSH NUTRISARI 5-9 VARIAN', period: Q.lbl + ' | target >=10 varian', legend: legendOf(Q), outlets: forms,
    file: 'Form_Nutrisari_5-9_' + Q.short.replace(' ', '_') + '_' + CABNAMA[S.cab] + '_' + (salesName || (S.sales >= 0 ? SALES[S.sales].n : 'Semua_Salesman')) + '_' + fileStamp() });
}
function pdfDpiPanel(parent, Q0) {
  const Q = qInfo(); const P = pdfPanel(parent, 'Unduh PDF · ' + Q.lbl, 'Semua PDF mengikuti filter cabang & salesman di atas. Form Nutrisari 5–9 berisi semua SKU Nutrisari berwarna merah/kuning/putih untuk dibawa salesman.');
  pdfButton(P.grid, 'Belum transaksi · Semua Merek', 'Daftar toko FJP · kuartal berjalan', () => pdfDormant(Q, null));
  pdfButton(P.grid, 'Belum transaksi · Nutrisari', 'Push EA Nutrisari', () => pdfDormant(Q, 'NUTRISARI'));
  pdfButton(P.grid, 'Belum transaksi · HiLo', 'Push EA HiLo', () => pdfDormant(Q, 'HILO'));
  const n59 = [...Q0.nsSets.values()].filter((v) => v.size >= 5 && v.size < 10).length;
  pdfButton(P.grid, 'Form Nutrisari 5–9 varian', n59 + ' outlet · ' + (S.sales >= 0 ? SALES[S.sales].n : 'semua salesman') + ' · berwarna', () => pdfNsForm(Q, Q0.nsSets, curSales()));
}

/* ---------- Outlet ---------- */
function pdfOutletPanel(parent) {
  const lim = S.sales >= 0 ? 20 : 100;
  const P = pdfPanel(parent, 'Unduh PDF · daftar prioritas outlet', 'Top ' + lim + (S.sales >= 0 ? ' (satu salesman)' : ' (total cabang)') + ' · urut dari AVG ' + S.year + ' terbesar · mengikuti filter cabang & salesman.');
  pdfButton(P.grid, 'Growth AVG positif', 'Merek: ' + brandName(), () => pdfGrowth(S.brand, 1));
  pdfButton(P.grid, 'Growth AVG negatif', 'Merek: ' + brandName(), () => pdfGrowth(S.brand, -1));
  pdfButton(P.grid, 'Growth negatif Nutrisari', 'Top ' + lim + ' outlet', () => pdfGrowth('NUTRISARI', -1));
  pdfButton(P.grid, 'Growth negatif HiLo', 'Top ' + lim + ' outlet', () => pdfGrowth('HILO', -1));
  pdfButton(P.grid, 'Outlet F3=0', 'Filter aktif · per salesman', () => pdfF3(scope('gt', gtF())));
}

/* ---------- Area ---------- */
function pdfAreaPanel(parent, rows, set, sc) {
  const area = S.kab || 'Semua area', Q = qInfo();
  const P = pdfPanel(parent, 'Unduh PDF · ' + (S.kab ? S.kab : 'area ' + CABNAMA[S.cab]), 'Ringkasan tabel area di atas, dan daftar prioritas outlet di ' + (S.kab ? S.kab : 'seluruh area') + '.');
  pdfButton(P.grid, 'Ringkasan area', (S.kab ? 'Per kecamatan' : 'Per kabupaten/kota') + ' · ' + rows.length + ' baris', () => {
    const r2 = [...rows].sort((a, b) => b.total - a.total).map((r, i) => Object.assign({ no: i + 1 }, r));
    pdfTable({ title: 'Ringkasan Area - ' + (S.kab || CABNAMA[S.cab]), sub: scopeTxt() + ' | ' + brandName() + ' | Jan-' + BLN[S.month - 1] + ' ' + S.year, count: r2.length + (S.kab ? ' kecamatan' : ' kabupaten/kota'),
      cols: [{ l: 'No', w: 4, a: 'c', v: (r) => r.no }, { l: S.kab ? 'Kecamatan' : 'Kabupaten/kota', w: 20, v: (r) => r.n }, { l: 'Omzet', w: 13, a: 'r', v: (r) => pRp(r.total) }, { l: 'Kontribusi', w: 8, a: 'r', v: (r) => F.pct(r.kon) },
        { l: 'Growth YTD', w: 8, a: 'r', v: (r) => pG(r.gy), color: (r) => (r.gy < 0 ? PCOL.redInk : PCOL.ink) }, { l: 'Growth AVG', w: 8, a: 'r', v: (r) => pG(r.ga), color: (r) => (r.ga < 0 ? PCOL.redInk : PCOL.ink) }, { l: 'AVG EA', w: 7, a: 'r', v: (r) => F.n1(r.avgEa) },
        { l: 'RO', w: 6, a: 'r', v: (r) => F.n(r.ro) }, { l: 'EA/RO', w: 7, a: 'r', v: (r) => F.pct(r.eaRo) }, { l: 'EC/day', w: 7, a: 'r', v: (r) => F.n2(r.ecday) }, { l: 'Line/EA', w: 7, a: 'r', v: (r) => F.n2(r.lineEa) }, { l: 'F3=0', w: 7, a: 'r', v: (r) => F.pct(r.f3), color: (r) => (r.f3 >= 0.2 ? PCOL.redInk : PCOL.ink) }],
      rows: r2, note: 'Target: EA/RO >=40%, EC/day >=7, F3=0 <20%. Kabupaten/kota dari normalisasi kolom Kota transaksi; kecamatan dari master FJP.', file: 'Ringkasan_Area_' + (S.kab || CABNAMA[S.cab]) + '_' + fileStamp() });
  });
  const ex = { area: S.kab || null, outlets: set };
  pdfButton(P.grid, 'Growth negatif', 'Top ' + (S.sales >= 0 ? 20 : 100) + ' · ' + area, () => pdfGrowth(S.brand, -1, ex));
  pdfButton(P.grid, 'Outlet F3=0', area + ' · per salesman', () => pdfF3(sc, ex));
  pdfButton(P.grid, 'Belum transaksi kuartal', Q.lbl + ' · ' + area, () => pdfDormant(Q, null, { area: S.kab || null, filter: S.kab ? (r) => r.o >= 0 && OUT[r.o].kab === S.kab : null }));
}

/* ---------- Modern Trade: Retail Modern ---------- */
function pdfRetailForm(list, salesName, oneOutlet) {
  const Q = qInfo(); let outs = list.filter((r) => r.o >= 0);
  if (oneOutlet != null) outs = outs.filter((r) => r.o === oneOutlet); else if (salesName) outs = outs.filter((r) => r.sales === salesName);
  outs.sort((a, b) => (a.sales || '').localeCompare(b.sales || '') || a.n.localeCompare(b.n));
  const set = new Set(outs.map((r) => r.o)), hMt = itemLast('mt', set, Q.end), hGt = itemLast('gt', set, Q.end);
  const fMt = ITEM.filter((i) => i.ch === 'MT' && D.focusMT.includes(i.n)).map((i) => i.i), fGt = ITEM.filter((i) => i.ch === 'GT' && D.focusGT.includes(i.n)).map((i) => i.i);
  const forms = outs.map((r) => {
    const items = []; const add = (tb, ids, hm) => { for (const i of ids) { const st = stOf(hm.get(i), Q.qa); items.push({ g: tb === 'mt' ? 'MT' : 'GT', n: ITEM[i].n, st, stLbl: stLbl(st, Q), last: dateLbl(hm.get(i)) }); } };
    const mm = hMt.get(r.o) || new Map(), gm = hGt.get(r.o) || new Map();
    add('mt', new Set([...fMt, ...mm.keys()]), mm); add('gt', new Set([...fGt, ...gm.keys()]), gm);
    items.sort((a, b) => RANK[a.st] - RANK[b.st] || a.g.localeCompare(b.g) || a.n.localeCompare(b.n));
    return { name: r.n, info: [['ShipTo', shipOf(r.o)], ['Cabang', CABNAMA[r.cab]], ['Salesman', r.sales || '-'], ['Segmen', r.seg || '-']], summary: countSt(items), items }; });
  pdfForm({ title: 'FORM PUSH RETAIL MODERN', period: Q.lbl, legend: legendOf(Q), outlets: forms,
    file: 'Form_Retail_Modern_' + (oneOutlet != null ? (outs[0]?.n || 'outlet').slice(0, 30) : salesName || 'Semua_Outlet') + '_' + Q.short.replace(' ', '_') });
}
function pdfRetailPanel(parent, list) {
  const P = pdfPanel(parent, 'Unduh PDF · form Retail Modern', 'Satu halaman per outlet: ' + D.focusMT.length + ' item fokus MT + ' + D.focusGT.length + ' item fokus GT + semua item yang pernah dibeli toko, berwarna merah/kuning/putih.');
  pdfButton(P.grid, 'Form outlet terpilih', S.rmOutlet === 'ALL' ? 'Pilih outlet di filter atas' : (list.find((r) => String(r.o) === S.rmOutlet)?.n || ''), () => {
    if (S.rmOutlet === 'ALL') { alert('Pilih satu outlet di filter "Outlet" terlebih dahulu.'); return; } pdfRetailForm(list, null, +S.rmOutlet); });
  const nAll = list.filter((r) => r.o >= 0 && (!curSales() || r.sales === curSales())).length;
  pdfButton(P.grid, 'Form semua outlet', nAll + ' outlet · ' + (curSales() || 'semua salesman'), () => pdfRetailForm(list, curSales(), null));
}

/* ---------- Modern Trade: Misi Pasaraya ---------- */
function pdfMisiForm(stList, salesName) {
  const Q = qInfo(), SH = D.misiShip, sOf = (k) => D.retail.find((r) => r.st === k)?.sales || '-';
  let sts = stList; if (salesName) sts = sts.filter((k) => sOf(k) === salesName);
  const last = new Map(); for (const r of D.misiTx) { if (!r[4] || !r[3]) continue; const dt = new Date(Date.UTC(2023, 0, 1 + r[1])); const ym = (dt.getUTCFullYear() - Y0) * 12 + dt.getUTCMonth(); if (ym > Q.end) continue;
    const k = r[0] + '|' + ITEM[r[2]].ch + '|' + r[3], c = ym * 100 + dt.getUTCDate(); if (!(last.get(k) >= c)) last.set(k, c); }
  const forms = sts.map((st) => { const items = D.misi.map((mm) => { const c = last.get(st + '|' + mm.Channel + '|' + mm.Barcode), s = stOf(c, Q.qa); return { no: +mm.No, g: mm.Channel, bc: mm.Barcode, n: mm['Nama Item'], st: s, stLbl: stLbl(s, Q), last: dateLbl(c) }; })
      .sort((a, b) => RANK[a.st] - RANK[b.st] || a.no - b.no);
    return { name: 'MISI PASARAYA ' + SH[st], info: [['ShipTo', st], ['Salesman', sOf(st)], ['Master item', D.misi.length + ' SKU aktif'], ['Periode', Q.lbl]], summary: countSt(items), items }; });
  pdfForm({ title: 'FORM CHECKLIST MISI PASARAYA', period: Q.lbl, barcode: true, legend: legendOf(Q), outlets: forms,
    file: 'Checklist_Misi_' + (stList.length === 1 && !salesName ? SH[stList[0]] : salesName || 'Semua_Outlet') + '_' + Q.short.replace(' ', '_') });
}
function pdfMisiPanel(parent) {
  const SH = D.misiShip, all = Object.keys(SH);
  const P = pdfPanel(parent, 'Unduh PDF · checklist Misi', 'Satu form per outlet berisi ' + D.misi.length + ' SKU master Misi dengan barcode, berwarna merah/kuning/putih.');
  pdfButton(P.grid, 'PDF outlet terpilih', S.misiSt === 'ALL' ? 'Pilih outlet Misi di filter atas' : SH[S.misiSt], () => { if (S.misiSt === 'ALL') { alert('Pilih satu outlet Misi di filter "Outlet Misi" terlebih dahulu.'); return; } pdfMisiForm([S.misiSt], null); });
  const nM = all.filter((k) => !curSales() || D.retail.find((r) => r.st === k)?.sales === curSales()).length;
  pdfButton(P.grid, 'PDF semua outlet', nM + ' outlet · ' + (curSales() || 'semua salesman'), () => pdfMisiForm(all, curSales()));
}

const S = { tab: 'gt', view: 'overview', mtView: 'overview', mdsView: 'overview', cab: 'PAREPARE', sales: -1, brand: 'ALL', mtBrand: 'ALL', year: yOf(CLOSE_YM), month: mOf(CLOSE_YM),
  stk: -1, kab: '', rmOutlet: 'ALL', rmPer: 'YTD', rmItem: 'ALL', misiSt: 'ALL', misiCh: 'ALL', mds: 'ALL', mdsKab: '' };
const GT_VIEWS = [['overview', 'Sales Overview', 'Ringkasan cabang'], ['dpi', 'DPI Performance', 'Kuartal & distribusi'], ['salesman', 'Salesman Performance', 'Tim & individual'], ['outlet', 'Outlet Performance', 'Toko & brand depth'],
  ['item', 'Item Performance', 'SKU & pertumbuhan'], ['area', 'Area Overview', 'Kabupaten & kecamatan'], ['stockist', 'Stockist Performance', 'Stokist MDS']];
const MT_VIEWS = [['overview', 'Sales Overview', 'Seluruh Modern Trade'], ['retail', 'Retail Modern', D.retail.length + ' outlet pilihan'], ['misi', 'Performance Misi Pasaraya', '4 outlet · GT & MT']];
const MDS_VIEWS = [['overview', 'MDS Overview', 'Performa total dan per MDS'], ['area', 'Area Overview', 'Kabupaten & kecamatan']];
const VIEWFN = { gt: { overview: viewOverview, dpi: viewDpi, salesman: viewSalesman, outlet: viewOutlet, item: viewItem, area: viewArea, stockist: viewStockist },
  mt: { overview: viewMtOverview, retail: viewRetail, misi: viewMisi }, mds: { overview: viewMdsOverview, area: viewMdsArea } };

function buildHeader() {
  const hd = document.getElementById('pj-head');
  const closing = new Date(D.meta.closing + 'T00:00:00Z');
  hd.querySelector('.pj-closing').textContent = (D.meta.partial ? 'Update s.d. ' : 'Closing ') + closing.getUTCDate() + ' ' + BULAN[closing.getUTCMonth()] + ' ' + closing.getUTCFullYear() + (D.meta.partial ? ' · belum closing' : '');
  hd.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
  document.getElementById('pj-method').addEventListener('click', (e) => { const p = document.getElementById('pj-method-panel'); p.hidden = !p.hidden; e.currentTarget.setAttribute('aria-expanded', String(!p.hidden)); });
}

function buildFilters() {
  const box = document.getElementById('pj-filters'); box.replaceChildren();
  const mk = (lbl, id, opts, val, on) => { const w = h('label', 'pj-f'); w.append(h('span', '', lbl)); const s = h('select', 'pj-select'); s.id = id;
    opts.forEach(([v, t, grp]) => { if (grp) { const g = h('optgroup'); g.label = grp; t.forEach(([vv, tt]) => g.append(new Option(tt, vv))); s.append(g); } else s.append(new Option(t, v)); });
    s.value = String(val); s.addEventListener('change', () => on(s.value)); w.append(s); box.append(w); return s; };
  if (S.tab !== 'mds') {
    mk('Cabang', 'f-cab', [['PAREPARE', 'Parepare'], ['MAMUJU', 'Mamuju'], ['ALL', 'Gabungan Parepare + Mamuju']], S.cab, (v) => { S.cab = v; S.sales = -1; S.kab = ''; S.rmOutlet = 'ALL'; render(); });
    const sl = SALES.filter((s) => S.cab === 'ALL' || s.cab === S.cab);
    const opts = [['-1', 'TOTAL CABANG']];
    if (S.cab === 'ALL') ['PAREPARE', 'MAMUJU'].forEach((c) => opts.push([null, sl.filter((s) => s.cab === c).map((s) => [String(s.i), s.n]), CABNAMA[c]]));
    else sl.forEach((s) => opts.push([String(s.i), s.n]));
    mk('Sales', 'f-sales', opts, S.sales, (v) => { S.sales = +v; render(); });
    if (S.tab === 'gt') mk('Merek', 'f-brand', [['ALL', 'SEMUA MEREK'], ...[...new Set(ITEM.filter((i) => i.ch === 'GT').map((i) => i.brand))].sort().map((b) => [b, b])], S.brand, (v) => { S.brand = v; render(); });
    else mk('Merek', 'f-brand', [['ALL', 'SEMUA MEREK'], ...[...new Set(ITEM.filter((i) => i.ch === 'MT').map((i) => i.brand))].sort().map((b) => [b, b])], S.mtBrand, (v) => { S.mtBrand = v; render(); });
  } else {
    mk('Nama MDS', 'f-mds', [['ALL', 'Semua MDS'], ...MD.mds.map((n) => [n, n])], S.mds, (v) => { S.mds = v; render(); });
  }
  mk('Tahun', 'f-year', YEARS.map((y) => [String(y), String(y)]).reverse(), S.year, (v) => { S.year = +v; S.month = Math.min(S.month, maxM(S.year)); render(); });
  mk('Bulan', 'f-month', BULAN.slice(0, maxM(S.year)).map((b, i) => [String(i + 1), b]), S.month, (v) => { S.month = +v; render(); });
  const rs = h('button', 'pj-btn-ghost', 'Kembali ke closing'); rs.addEventListener('click', () => { Object.assign(S, { cab: 'PAREPARE', sales: -1, brand: 'ALL', mtBrand: 'ALL', year: yOf(CLOSE_YM), month: mOf(CLOSE_YM), stk: -1, kab: '', mds: 'ALL', mdsKab: '' }); render(); });
  box.append(rs);
}

function buildNav() {
  const nav = document.getElementById('pj-nav'); nav.replaceChildren();
  const views = S.tab === 'gt' ? GT_VIEWS : S.tab === 'mt' ? MT_VIEWS : MDS_VIEWS;
  const cur = S.tab === 'gt' ? S.view : S.tab === 'mt' ? S.mtView : S.mdsView;
  views.forEach(([k, t, sub]) => { const b = h('button', 'pj-nav-b' + (k === cur ? ' on' : '')); b.append(h('b', '', t), h('span', '', sub));
    b.addEventListener('click', () => { if (S.tab === 'gt') S.view = k; else if (S.tab === 'mt') S.mtView = k; else S.mdsView = k; render(); document.getElementById('pj-main').scrollIntoView({ block: 'start' }); }); nav.append(b); });
}

function render() {
  REDRAW.clear();
  document.querySelectorAll('#pj-head [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  document.getElementById('pj-subtitle').textContent = S.tab === 'gt' ? 'Nutrifood Distribution · General Trade' : S.tab === 'mt' ? 'Nutrifood Distribution · Modern Trade' : 'Nutrifood Distribution · MDS';
  document.getElementById('pj-title').textContent = (S.tab === 'gt' ? 'General Trade' : S.tab === 'mt' ? 'Modern Trade' : 'MDS') + ' Performance Sulawesi';
  buildFilters(); buildNav();
  const main = document.getElementById('pj-main'); main.replaceChildren();
  const loading = h('p', 'pj-note', 'Menghitung…'); main.append(loading);
  setTimeout(() => {
    main.replaceChildren();
    try { const cur = S.tab === 'gt' ? S.view : S.tab === 'mt' ? S.mtView : S.mdsView; VIEWFN[S.tab][cur](main); }
    catch (e) { console.error(e); main.append(h('p', 'pj-error', 'Halaman gagal dihitung: ' + e.message)); }
    const ft = h('footer', 'pj-foot'); ft.append(h('span', '', 'Sumber: ' + D.meta.sumber.join(' · ')), h('span', '', 'File dibuat ' + D.meta.generated + (D.meta.partial ? ' · data s.d. ' : ' · data closing ') + D.meta.closing + (D.meta.partial ? ' (belum closing)' : ''))); main.append(ft);
  }, 10);
}
buildHeader(); render();
