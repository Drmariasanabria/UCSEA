// Interactive general-cargo ship diagram (side profile + plan view), stern left / bow right,
// as in the class figure. Zones are clickable and produce SMCP-style location phrases.
// parseLocation() turns a student's description into a zone (used by "Call the place").

export const ZONES = [
  { id: 'steering', label: 'steering gear room', x: 40, w: 50, deck: 'side', below: true },
  { id: 'hold4', label: 'No. 4 hold', x: 90, w: 160, hold: 4 },
  { id: 'accommodation', label: 'accommodation block', x: 250, w: 120, above: true },
  { id: 'machinery', label: 'machinery space', x: 250, w: 120, below: true },
  { id: 'hold3', label: 'No. 3 hold', x: 370, w: 160, hold: 3 },
  { id: 'hold2', label: 'No. 2 hold', x: 530, w: 160, hold: 2 },
  { id: 'hold1', label: 'No. 1 hold', x: 690, w: 160, hold: 1 },
  { id: 'forecastle', label: 'forecastle', x: 850, w: 110, above: true },
];

const SIDE_TOP = 40, DECK_Y = 110, KEEL_Y = 175;
const PLAN_TOP = 205, PLAN_MID = 275, PLAN_BOT = 345;

export function shipDiagram({ onPick, marks = [], interactive = true } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 360');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'General cargo ship: side profile and plan view');
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };

  // holographic defs: glow + hull gradient
  const gid = `sd${Math.random().toString(36).slice(2, 7)}`;
  const defs = el('defs', {});
  const flt = el('filter', { id: `${gid}g`, x: '-10%', y: '-30%', width: '120%', height: '160%' }, defs);
  el('feGaussianBlur', { stdDeviation: 2.4, result: 'b' }, flt);
  const mg = el('feMerge', {}, flt); el('feMergeNode', { in: 'b' }, mg); el('feMergeNode', { in: 'SourceGraphic' }, mg);
  const hg = el('linearGradient', { id: `${gid}h`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#3fc4ff', 'stop-opacity': 0.28 }, hg); el('stop', { offset: 1, 'stop-color': '#3fc4ff', 'stop-opacity': 0.04 }, hg);
  const HULL = `url(#${gid}h)`, GLOW = `url(#${gid}g)`;
  // sea
  el('rect', { x: 0, y: 150, width: 1000, height: 30, fill: 'rgba(63,196,255,0.12)' });
  for (let x = 0; x < 1000; x += 40) el('path', { d: `M${x} 158 q10 -4 20 0 t20 0`, fill: 'none', stroke: 'rgba(127,224,255,0.25)' });
  // hull side
  el('path', { d: `M40 ${DECK_Y} L960 ${DECK_Y} L985 ${DECK_Y - 22} L940 ${KEEL_Y} L60 ${KEEL_Y} L30 ${DECK_Y + 25} Z`, fill: HULL, stroke: '#7fe0ff', 'stroke-width': 2, filter: GLOW });
  // superstructure + bridge + funnel
  el('rect', { x: 255, y: SIDE_TOP + 5, width: 70, height: DECK_Y - SIDE_TOP - 5, fill: 'rgba(63,196,255,0.16)', stroke: '#7fe0ff', filter: GLOW });
  el('rect', { x: 248, y: SIDE_TOP - 6, width: 84, height: 12, fill: 'rgba(63,196,255,0.26)', stroke: '#7fe0ff', filter: GLOW });
  el('rect', { x: 335, y: SIDE_TOP + 20, width: 22, height: DECK_Y - SIDE_TOP - 20, fill: 'rgba(63,196,255,0.12)', stroke: '#7fe0ff', filter: GLOW });
  // forecastle
  el('path', { d: `M850 ${DECK_Y} L850 ${DECK_Y - 18} L975 ${DECK_Y - 22} L960 ${DECK_Y} Z`, fill: 'rgba(63,196,255,0.16)', stroke: '#7fe0ff', filter: GLOW });
  // containers on hatch covers
  for (const z of ZONES.filter((q) => q.hold)) for (let i = 0; i < 5; i++) el('rect', { x: z.x + 8 + i * 29, y: DECK_Y - 26, width: 26, height: 24, fill: 'none', stroke: 'rgba(90,209,255,0.35)', 'stroke-dasharray': '3 3' });
  // bulkheads & double bottom
  for (const z of ZONES) el('line', { x1: z.x, y1: DECK_Y, x2: z.x, y2: KEEL_Y - 6, stroke: 'rgba(90,209,255,0.5)' });
  el('line', { x1: 60, y1: KEEL_Y - 14, x2: 940, y2: KEEL_Y - 14, stroke: 'rgba(90,209,255,0.35)', 'stroke-dasharray': '6 4' });
  // plan view
  el('path', { d: `M40 ${PLAN_TOP + 20} L880 ${PLAN_TOP} Q975 ${PLAN_MID} 880 ${PLAN_BOT} L40 ${PLAN_BOT - 20} Z`, fill: HULL, stroke: '#7fe0ff', 'stroke-width': 2, filter: GLOW });
  el('line', { x1: 40, y1: PLAN_MID, x2: 960, y2: PLAN_MID, stroke: 'rgba(255,207,90,0.5)', 'stroke-dasharray': '8 6' });
  const txt = (x, y, s, size = 13, fill = '#cfeaff', anchor = 'middle') => { const t = el('text', { x, y, 'font-size': size, fill, 'text-anchor': anchor, 'font-family': 'IBM Plex Mono, monospace', 'pointer-events': 'none' }); t.textContent = s; return t; };
  txt(500, PLAN_MID + 4, 'CENTRELINE', 11, 'rgba(255,207,90,0.8)');
  txt(30, PLAN_TOP + 8, 'PORT', 12, '#ff8a8a', 'start');
  txt(30, PLAN_BOT + 12, 'STARBOARD', 12, '#7cf29c', 'start');
  txt(990, 30, 'BOW →', 13, '#9fe8ff', 'end');
  txt(10, 30, '← STERN', 13, '#9fe8ff', 'start');

  const groups = [];
  const zoneEl = (zone, x, y, w, hgt, side) => {
    const g = el('g', { class: 'hotspot', tabindex: interactive ? 0 : -1, role: interactive ? 'button' : 'img', 'aria-label': describe(zone, side) });
    const r = el('rect', { x, y, width: w, height: hgt, rx: 6, fill: 'rgba(57,208,255,0.04)', stroke: 'transparent' }, g);
    if (interactive) {
      const pick = () => { groups.forEach((q) => q.classList.remove('on')); g.classList.add('on'); r.setAttribute('stroke', '#ffcf5a'); onPick?.({ zone: zone.id, side, phrase: describe(zone, side) }); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && pick());
      g.addEventListener('mouseenter', () => r.setAttribute('fill', 'rgba(57,208,255,0.16)'));
      g.addEventListener('mouseleave', () => r.setAttribute('fill', 'rgba(57,208,255,0.04)'));
    }
    groups.push(g);
    return g;
  };
  for (const z of ZONES) {
    if (z.hold) {
      zoneEl(z, z.x + 4, DECK_Y + 4, z.w - 8, KEEL_Y - DECK_Y - 22, null);
      txt(z.x + z.w / 2, DECK_Y + 40, z.label.toUpperCase(), 13);
      zoneEl(z, z.x + 10, PLAN_TOP + 18, z.w - 20, PLAN_MID - PLAN_TOP - 22, 'port');
      zoneEl(z, z.x + 10, PLAN_MID + 4, z.w - 20, PLAN_BOT - PLAN_MID - 22, 'starboard');
      txt(z.x + z.w / 2, PLAN_TOP + 46, `No.${z.hold} P`, 12);
      txt(z.x + z.w / 2, PLAN_MID + 32, `No.${z.hold} S`, 12);
    } else if (z.id === 'accommodation') {
      zoneEl(z, 250, SIDE_TOP - 8, 110, DECK_Y - SIDE_TOP + 6, null);
      txt(292, SIDE_TOP + 40, 'ACCOMM.', 11);
      zoneEl(z, 255, PLAN_TOP + 30, 100, PLAN_BOT - PLAN_TOP - 70, null);
      txt(305, PLAN_MID - 8, 'BRIDGE', 11);
    } else if (z.id === 'machinery') {
      zoneEl(z, 254, DECK_Y + 4, 112, KEEL_Y - DECK_Y - 22, null);
      txt(310, DECK_Y + 40, 'ENGINE ROOM', 11);
    } else if (z.id === 'steering') {
      zoneEl(z, 40, DECK_Y - 4, 50, 50, null);
      txt(65, DECK_Y + 30, 'S/G', 11);
    } else if (z.id === 'forecastle') {
      zoneEl(z, 852, DECK_Y - 24, 110, 70, null);
      txt(905, DECK_Y + 30, 'FORE PEAK', 11);
    }
  }
  const markLayer = el('g', {});
  function setMarks(list) {
    while (markLayer.firstChild) markLayer.removeChild(markLayer.firstChild);
    for (const m of list) {
      const z = ZONES.find((q) => q.id === m.zone);
      if (!z) continue;
      const x = z.x + z.w * (m.dx ?? 0.5);
      const y = m.side === 'port' ? PLAN_TOP + 42 : m.side === 'starboard' ? PLAN_MID + 36 : DECK_Y + 30;
      el('circle', { cx: x, cy: y, r: 13, fill: m.color || 'rgba(255,93,108,0.75)', stroke: '#fff', 'stroke-width': 2 }, markLayer);
      if (m.label) txt(x, m.dx != null ? y + 28 : y - 18, m.label, 12, '#fff');
    }
  }
  setMarks(marks);
  svg.setMarks = setMarks;
  return svg;
}

export function describe(zone, side) {
  if (typeof zone === 'string') zone = ZONES.find((z) => z.id === zone);
  if (!zone) return '';
  const s = side ? `, ${side} side` : '';
  if (zone.hold) return `${zone.label}${s}`;
  return `the ${zone.label}${s}`;
}

/**
 * Resolve a free-text location ("forward of No. 2 hatch, port side", "aft of the accommodation", "in the forecastle")
 * Returns { zone, side, confidence, reasons[] }.
 */
export function parseLocation(text = '') {
  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, first: 1, second: 2, third: 3, fourth: 4 };
  const t = text.toLowerCase()
    .replace(/\b(one|two|three|four|five|first|second|third|fourth)\b/g, (w) => String(WORDNUM[w]))
    .replace(/number|nº|n°/g, 'no.').replace(/no\s*\.?\s*(\d)/g, 'no.$1');
  const reasons = [];
  let side = /\bport\b/.test(t) ? 'port' : /\bstarboard\b|\bstbd\b/.test(t) ? 'starboard' : null;
  if (/\bcentreline|centerline|amidships\b/.test(t)) side = null;
  if (/\b(left|right)\b/.test(t)) reasons.push('Usa port/starboard, no left/right.');
  if (/\b(front|back)\b/.test(t)) reasons.push('Usa forward/aft o bow/stern, no front/back.');
  const holdM = t.match(/no\.(\d)\s*(?:hatch|hold|cargo hold)?/);
  const rel = /\bforward of\b|\bahead of\b/.test(t) ? 1 : /\baft of\b|\babaft\b|\bbehind\b/.test(t) ? -1 : 0;
  let zone = null;
  let confidence = 0.5;
  if (holdM) {
    let n = +holdM[1];
    if (rel === 1) n -= 1; // forward of No.2 -> No.1 (holds numbered from bow)
    if (rel === -1) n += 1;
    if (n === 0) zone = 'forecastle';
    else if (n >= 1 && n <= 4) zone = 'hold' + n;
    else if (n === 5) zone = 'machinery';
    confidence = 0.9;
  } else if (/accommodation|bridge|superstructure|deckhouse/.test(t)) {
    zone = rel === 1 ? 'hold3' : rel === -1 ? 'hold4' : 'accommodation';
    confidence = 0.8;
  } else if (/engine room|machinery/.test(t)) {
    zone = rel === 1 ? 'hold3' : rel === -1 ? 'hold4' : 'machinery';
    confidence = 0.8;
  } else if (/forecastle|fore peak|bow\b/.test(t)) { zone = rel === -1 ? 'hold1' : 'forecastle'; confidence = 0.8; }
  else if (/steering gear|stern|aft peak/.test(t)) { zone = rel === 1 ? 'hold4' : 'steering'; confidence = 0.8; }
  if (zone && ZONES.find((z) => z.id === zone)?.hold && !side) { reasons.push('Falta el costado (port / starboard) o «on the centreline».'); confidence -= 0.2; }
  if (!zone) reasons.push('No se identifica un punto de referencia (No. X hold/hatch, accommodation, forecastle…).');
  return { zone, side, confidence, reasons };
}
