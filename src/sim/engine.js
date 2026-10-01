// Deterministic kinematics shared by every client. Positions are in nautical miles on a
// local flat grid (x = east, y = north). Each moving object stores an anchor
// (x, y, setAt) plus course/speed, so all clients compute identical positions from
// the same Firestore document without streaming coordinates.
import { norm360, toRad, toDeg, uid, seeded, clamp } from '../core/util.js';

export const HOUR = 3600 * 1000;

export function posAt(obj, t = Date.now()) {
  const dtH = Math.max(0, (t - (obj.setAt || t)) / HOUR) * (obj.timeScale || 1);
  const spd = obj.speed || 0;
  const c = toRad(obj.course || 0);
  return { x: (obj.x || 0) + Math.sin(c) * spd * dtH, y: (obj.y || 0) + Math.cos(c) * spd * dtH };
}

// Re-anchor an object at time t with a new course/speed (used for helm/engine orders).
export function reanchor(obj, patch = {}, t = Date.now()) {
  const p = posAt(obj, t);
  return { ...obj, ...patch, x: round3(p.x), y: round3(p.y), setAt: t };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

export function bearingRange(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { bearing: norm360(toDeg(Math.atan2(dx, dy))), range: Math.hypot(dx, dy) };
}

export function velocity(obj) {
  const c = toRad(obj.course || 0);
  return { vx: Math.sin(c) * (obj.speed || 0), vy: Math.cos(c) * (obj.speed || 0) };
}

/** CPA (NM) and TCPA (minutes) between own ship and a target at time t. */
export function cpaTcpa(own, tgt, t = Date.now()) {
  const po = posAt(own, t);
  const pt = posAt(tgt, t);
  const vo = velocity(own);
  const vt = velocity(tgt);
  const rx = pt.x - po.x;
  const ry = pt.y - po.y;
  const vx = vt.vx - vo.vx;
  const vy = vt.vy - vo.vy;
  const v2 = vx * vx + vy * vy;
  if (v2 < 1e-9) return { cpa: Math.hypot(rx, ry), tcpa: Infinity };
  const tH = -(rx * vx + ry * vy) / v2;
  const cx = rx + vx * Math.max(0, tH);
  const cy = ry + vy * Math.max(0, tH);
  return { cpa: Math.hypot(cx, cy), tcpa: tH * 60 };
}

// Relative bearing words used in SMCP ("on your starboard bow").
export function relativeSide(own, tgt, t = Date.now()) {
  const { bearing } = bearingRange(posAt(own, t), posAt(tgt, t));
  const rel = norm360(bearing - (own.course || 0));
  if (rel < 10 || rel > 350) return 'right ahead';
  if (rel < 80) return 'starboard bow';
  if (rel <= 100) return 'starboard beam';
  if (rel < 170) return 'starboard quarter';
  if (rel <= 190) return 'right astern';
  if (rel < 260) return 'port quarter';
  if (rel <= 280) return 'port beam';
  return 'port bow';
}

// Build the initial ship/targets state for a lab from a scenario.
export function initialState(scenario, labId = 'x', t = Date.now()) {
  const own = { ...scenario.ownShip, x: 0, y: 0, setAt: t, signal: null, list: 0, rudderStuck: null };
  const targets = (scenario.traffic || []).map((tr, i) => {
    const b = toRad(tr.bearing);
    return {
      id: 'sc' + i,
      name: tr.name,
      type: tr.type,
      x: round3(Math.sin(b) * tr.range),
      y: round3(Math.cos(b) * tr.range),
      course: tr.course,
      speed: tr.speed,
      ais: tr.ais !== false,
      mmsi: tr.ais !== false ? fakeMmsi(labId + tr.name) : null,
      setAt: t,
      source: 'scenario',
    };
  });
  return { ownShip: own, targets, world: { ...scenario.world }, engine: defaultEngine(scenario), simStart: t };
}

export function defaultEngine(scenario) {
  const moving = (scenario.ownShip.speed || 0) > 0.5;
  return { rpm: moving ? 92 : 0, loPressure: 3.0, cwTemp: 82, exhaust: moving ? 365 : 120, genLoad: moving ? 58 : 34, bilge: 12, fire: false, blackout: false, slowdown: false, fuelTemp: 128 };
}

function fakeMmsi(seed) {
  const r = seeded(seed);
  return String(2 + Math.floor(r() * 5)) + String(Math.floor(r() * 1e8)).padStart(8, '0');
}

/**
 * Translate an event definition's "effects" into a patch for the lab document.
 * Returns { patch, notes } where notes describe what happened (for the log).
 */
export function applyEffects(lab, effects = {}, vars = {}, t = Date.now()) {
  const patch = {};
  const notes = [];
  if (!effects) return { patch, notes };
  if (effects.world) {
    patch.world = { ...(lab.world || {}), ...effects.world };
    notes.push('World conditions changed');
  }
  if (effects.engine) {
    patch.engine = { ...(lab.engine || {}), ...effects.engine };
    if (effects.engine.blackout) Object.assign(patch.engine, { rpm: 0, genLoad: 0 });
    if (effects.engine.slowdown) Object.assign(patch.engine, { rpm: Math.min(lab.engine?.rpm || 0, 55) });
    notes.push('Engine status changed');
  }
  const own = lab.ownShip;
  if (own && effects.ownShip) {
    const o = effects.ownShip;
    const next = {};
    if (o.speedTo != null) next.speed = o.speedTo;
    if (o.list != null) next.list = o.list;
    if (o.rudderStuck != null) {
      next.rudderStuck = o.rudderStuck;
      next.course = norm360((own.course || 0) + (o.rudderStuck < 0 ? -25 : 25));
    }
    if (o.turn === 'williamson') next.course = norm360((own.course || 0) + 60);
    patch.ownShip = reanchor(own, next, t);
  }
  if (effects.signal && (patch.ownShip || own)) {
    patch.ownShip = { ...(patch.ownShip || own), signal: effects.signal };
  }
  if (effects.addTarget && own) {
    patch.targets = [...(lab.targets || []), targetFromSpec(patch.ownShip || own, effects.addTarget, vars, t)];
    notes.push('New radar contact');
  }
  return { patch, notes };
}

// Effects that end when the teacher resolves an event.
export function revertEffects(lab, effects = {}) {
  const patch = {};
  if (effects.engine) {
    patch.engine = { ...(lab.engine || {}), fire: false, blackout: false, slowdown: false };
    if (effects.engine.loPressure) patch.engine.loPressure = 3.0;
    if (effects.engine.bilge) patch.engine.bilge = 15;
    if (effects.engine.blackout || effects.engine.slowdown) patch.engine.rpm = 92;
  }
  if (effects.signal && lab.ownShip) patch.ownShip = { ...lab.ownShip, signal: null, rudderStuck: null };
  return patch;
}

/** Create a target relative to own ship. course may be a number or 'crossing'|'same'|'intercept'|'stopped'|'reciprocal'. */
export function targetFromSpec(own, spec, vars = {}, t = Date.now()) {
  const op = posAt(own, t);
  const name = String(spec.name || 'Target').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  const brg = norm360((own.course || 0) + (spec.relBearing ?? 30));
  const b = toRad(brg);
  const range = spec.range ?? 3;
  const x = op.x + Math.sin(b) * range;
  const y = op.y + Math.cos(b) * range;
  let course = spec.course;
  const speed = spec.speed ?? 10;
  if (course === 'same') course = own.course;
  else if (course === 'reciprocal') course = norm360((own.course || 0) + 180);
  else if (course === 'stopped') course = own.course;
  else if (course === 'crossing' || course === 'intercept') course = collisionCourse(own, { x, y }, speed, t, course === 'crossing' ? 0.15 : 0);
  return {
    id: uid('tg'),
    name, type: spec.type || (spec.tow ? 'Tug and tow' : 'Vessel'),
    x: round3(x), y: round3(y), course: Math.round(norm360(course ?? 0)), speed, ais: spec.ais !== false, tow: !!spec.tow,
    setAt: t, source: 'event',
  };
}

// Course for a target at P with speed s so that it passes own ship at ~offset NM (collision geometry).
export function collisionCourse(own, p, s, t = Date.now(), offset = 0) {
  const op = posAt(own, t);
  const vo = velocity(own);
  // Aim at own ship's position after time T where |P + vt*T - (O + vo*T)| = offset; solve by iteration.
  let best = 0;
  let bestErr = Infinity;
  for (let T = 0.05; T < 1.5; T += 0.01) {
    const ax = op.x + vo.vx * T + offset - p.x;
    const ay = op.y + vo.vy * T - p.y;
    const need = Math.hypot(ax, ay) / T;
    const err = Math.abs(need - s);
    if (err < bestErr) { bestErr = err; best = norm360(toDeg(Math.atan2(ax, ay))); }
  }
  return best;
}

// Snapshot of everything a radar or AI prompt needs at time t.
export function picture(lab, t = Date.now()) {
  const own = lab.ownShip;
  if (!own) return { own: null, contacts: [] };
  const op = posAt(own, t);
  const contacts = (lab.targets || []).map((tg) => {
    const p = posAt(tg, t);
    const { bearing, range } = bearingRange(op, p);
    const { cpa, tcpa } = cpaTcpa(own, tg, t);
    return { ...tg, px: p.x, py: p.y, bearing, range, cpa, tcpa, side: relativeSide(own, tg, t) };
  }).sort((a, b) => a.range - b.range);
  return { own: { ...own, px: op.x, py: op.y }, contacts };
}

// Ship's clock: scenario clock + elapsed real time.
export function shipClock(lab, t = Date.now()) {
  const base = String(lab.world?.clock || '1200');
  const startMin = parseInt(base.slice(0, 2), 10) * 60 + parseInt(base.slice(2), 10);
  const elapsed = Math.floor((t - (lab.simStart || t)) / 60000);
  const m = (startMin + elapsed) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
}

// Pseudo position text (lat/long) from local grid, anchored at a nominal origin per scenario.
export function latLonText(lab, p) {
  const o = ORIGINS[lab.scenarioId] || ORIGINS.tss_night;
  const lat = o.lat + p.y / 60;
  const lon = o.lon + p.x / (60 * Math.cos(toRad(o.lat)));
  const f = (v, pos, neg, w) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = (a - d) * 60;
    return `${String(d).padStart(w, '0')}°${m.toFixed(1).padStart(4, '0')}'${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, 'N', 'S', 2)} ${f(lon, 'E', 'W', 3)}`;
}

const ORIGINS = {
  tss_night: { lat: 50.86, lon: 1.05 },
  santander_approach: { lat: 43.55, lon: -3.77 },
  strait_crossing: { lat: 35.97, lon: -5.55 },
  alongside_bunkering: { lat: 43.35, lon: -3.05 },
  biscay_storm: { lat: 44.75, lon: -7.9 },
  offshore_field: { lat: 53.85, lon: 1.3 },
};

// Engine instrument readings with small animated noise, derived from engine flags.
export function engineReadings(engine = {}, own = {}, t = Date.now()) {
  const n = (amp, f = 1) => Math.sin(t / (900 * f)) * amp + Math.sin(t / (370 * f)) * amp * 0.4;
  const rpm = engine.blackout ? 0 : clamp((engine.rpm ?? 90) * Math.min(1, (own.speed || 0) / 14 + 0.25) + n(0.8), 0, 120);
  return {
    rpm,
    loPressure: clamp((engine.loPressure ?? 3) + n(0.03, 2) - (engine.loPressure < 2.5 ? ((t / 60000) % 5) * 0.02 : 0), 0, 5),
    cwTemp: clamp((engine.cwTemp ?? 82) + n(0.6, 3) + (engine.fire ? 6 : 0), 20, 120),
    exhaust: clamp((engine.exhaust ?? 360) * (rpm / 92 || 0.3) + n(4), 60, 520),
    genLoad: engine.blackout ? 0 : clamp((engine.genLoad ?? 55) + n(2.5, 1.5), 0, 110),
    bilge: clamp((engine.bilge ?? 12) + (engine.bilge > 50 ? ((t / 20000) % 30) : 0), 0, 100),
    fuelTemp: clamp((engine.fuelTemp ?? 128) + n(1, 4), 20, 160),
  };
}
