// Minimal accessible SVG charts (single-series). Specs: 2px lines, >=8px markers with a
// 2px surface ring, hairline solid grid, bars <=24px with 4px rounded data-end,
// hover tooltips, text in text colours (never the series colour), table view.
import { h } from '../core/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const SURFACE = '#0b2038';
const GRID = 'rgba(155,182,201,0.18)';
const INK = '#eaf6ff';
const MUTED = '#9bb6c9';

function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

function tooltip(host) {
  const tip = h('div', { style: { position: 'absolute', pointerEvents: 'none', padding: '6px 10px', borderRadius: '8px', background: 'rgba(3,11,22,0.95)', border: '1px solid rgba(90,210,255,0.4)', font: '600 0.8rem var(--mono)', color: INK, opacity: 0, transition: 'opacity .12s', whiteSpace: 'nowrap', zIndex: 5 } });
  host.appendChild(tip);
  return {
    show(x, y, html) { tip.innerHTML = html; tip.style.left = `${x + 12}px`; tip.style.top = `${y - 34}px`; tip.style.opacity = 1; },
    hide() { tip.style.opacity = 0; },
  };
}

/** points: [{ label, y }] in order. */
export function lineChart(points, { title, yMax = null, unit = '', color = '#39d0ff', height = 190 } = {}) {
  const W = 560, H = height, L = 40, R = 46, T = 14, B = 28;
  const host = h('div', { style: { position: 'relative' } });
  const table = tableView(points, title, unit);
  if (!points.length) return h('p.small', 'Sin datos todavía.');
  const max = yMax ?? niceMax(Math.max(...points.map((p) => p.y)));
  const x = (i) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': title || 'chart' });
  for (const t of [0, max / 2, max]) {
    svgEl('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), stroke: GRID, 'stroke-width': 1 }, svg);
    const tx = svgEl('text', { x: L - 8, y: y(t) + 4, 'text-anchor': 'end', fill: MUTED, 'font-size': 11, 'font-family': 'JetBrains Mono, monospace' }, svg);
    tx.textContent = Math.round(t) + unit;
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.y)}`).join(' ');
  svgEl('path', { d: `${d} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, fill: color, 'fill-opacity': 0.1 }, svg);
  svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  const tip = tooltip(host);
  points.forEach((p, i) => {
    svgEl('circle', { cx: x(i), cy: y(p.y), r: 4, fill: color, stroke: SURFACE, 'stroke-width': 2 }, svg);
    const hit = svgEl('circle', { cx: x(i), cy: y(p.y), r: 14, fill: 'transparent', tabindex: 0 }, svg);
    const show = (e) => { const r = host.getBoundingClientRect(); const cx = e.clientX ? e.clientX - r.left : (x(i) / W) * r.width; const cy = e.clientY ? e.clientY - r.top : (y(p.y) / H) * r.height; tip.show(cx, cy, `${p.label}<br><b>${p.y}${unit}</b>`); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointermove', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('pointerleave', () => tip.hide());
    hit.addEventListener('blur', () => tip.hide());
  });
  const last = points[points.length - 1];
  const lt = svgEl('text', { x: x(points.length - 1) + 8, y: y(last.y) + 4, fill: INK, 'font-size': 12, 'font-weight': 700, 'font-family': 'JetBrains Mono, monospace' }, svg);
  lt.textContent = last.y + unit;
  host.appendChild(svg);
  return h('div', host, table);
}

/** items: [{ label, value }] — horizontal bars, single hue. */
export function barChart(items, { title, unit = '', color = '#39d0ff' } = {}) {
  if (!items.length) return h('p.small', 'Sin datos todavía.');
  const rowH = 30, L = 210, R = 56, W = 560;
  const H = items.length * rowH + 10;
  const max = niceMax(Math.max(...items.map((i) => i.value)));
  const host = h('div', { style: { position: 'relative' } });
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': title || 'bar chart' });
  const tip = tooltip(host);
  svgEl('line', { x1: L, x2: L, y1: 0, y2: H, stroke: GRID, 'stroke-width': 1 }, svg);
  items.forEach((it, i) => {
    const y0 = 6 + i * rowH;
    const bh = Math.min(20, rowH - 8);
    const w = Math.max(2, ((W - L - R) * it.value) / max);
    const lab = svgEl('text', { x: L - 10, y: y0 + bh / 2 + 4, 'text-anchor': 'end', fill: MUTED, 'font-size': 12, 'font-family': 'Inter, sans-serif' }, svg);
    lab.textContent = it.label.length > 32 ? it.label.slice(0, 31) + '…' : it.label;
    // square at baseline, 4px rounded data-end
    const r = Math.min(4, w / 2);
    svgEl('path', { d: `M${L},${y0} H${L + w - r} Q${L + w},${y0} ${L + w},${y0 + r} V${y0 + bh - r} Q${L + w},${y0 + bh} ${L + w - r},${y0 + bh} H${L} Z`, fill: color }, svg);
    const val = svgEl('text', { x: L + w + 6, y: y0 + bh / 2 + 4, fill: INK, 'font-size': 12, 'font-weight': 700, 'font-family': 'JetBrains Mono, monospace' }, svg);
    val.textContent = it.value + unit;
    const hit = svgEl('rect', { x: 0, y: y0 - 4, width: W, height: rowH, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', (e) => { const b = host.getBoundingClientRect(); tip.show(e.clientX - b.left, e.clientY - b.top, `${it.label}<br><b>${it.value}${unit}</b>`); });
    hit.addEventListener('pointerleave', () => tip.hide());
  });
  host.appendChild(svg);
  return h('div', host, tableView(items.map((i) => ({ label: i.label, y: i.value })), title, unit));
}

function tableView(points, title, unit) {
  return h('details', { style: { marginTop: '6px' } }, h('summary.small', 'Ver como tabla'),
    h('table', h('thead', h('tr', h('th', title || 'Etiqueta'), h('th', 'Valor'))), h('tbody', points.map((p) => h('tr', h('td', p.label), h('td.mono', p.y + unit))))));
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
