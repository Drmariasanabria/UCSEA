// Canvas radar/ARPA display. Used on the bridge (own-ship centred) and at VTS/MRCC (shore picture).
import { picture } from './engine.js';
import { toRad, norm360 } from '../core/util.js';
import { sfx } from '../core/audio.js';

const RANGES = [0.75, 1.5, 3, 6, 12, 24];
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const HOLO = (a) => `rgba(110, 215, 255, ${a})`;

export function createRadar(canvas, opts = {}) {
  const o = {
    mode: 'ship', // 'ship' | 'shore'
    getLab: () => null,
    onSelect: null,
    onMoveTarget: null, // teacher god mode: drag targets
    godMode: false,
    sweepSound: false,
    getTime: null, // replay clock
    ...opts,
  };
  const ctx = canvas.getContext('2d');
  let range = o.mode === 'shore' ? 12 : 6;
  let orientation = 'head'; // head | north
  let raf = 0;
  let sweep = 0;
  let lastT = performance.now();
  let selectedId = null;
  const acquired = new Set();
  const glow = new Map(); // target id -> last painted intensity time
  let mouse = null;
  let ebl = null; // { bearing }
  let vrm = null; // { range }
  let tool = null; // 'ebl' | 'vrm' | null
  let dragging = null;
  let lastPingAngle = 0;
  const speckles = Array.from({ length: 260 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() }));

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(200, Math.min(rect.width, rect.height || rect.width));
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const sizeCss = () => canvas.width / Math.min(2, window.devicePixelRatio || 1);

  // Geometry helpers
  function frame(lab, t) {
    const pic = picture(lab, t);
    const S = sizeCss();
    const R = S / 2 - 34;
    const centre = o.mode === 'shore'
      ? shoreCentre(pic)
      : { x: pic.own?.px || 0, y: pic.own?.py || 0 };
    const rot = o.mode === 'ship' && orientation === 'head' ? -(pic.own?.course || 0) : 0;
    const k = R / range;
    const toScreen = (x, y) => {
      const dx = x - centre.x;
      const dy = y - centre.y;
      const a = toRad(-rot); // rotate the world so own heading points up
      const rx = dx * Math.cos(a) - dy * Math.sin(a);
      const ry = dx * Math.sin(a) + dy * Math.cos(a);
      return { sx: S / 2 + rx * k, sy: S / 2 - ry * k };
    };
    const fromScreen = (sx, sy) => {
      const rx = (sx - S / 2) / k;
      const ry = -(sy - S / 2) / k;
      const a = toRad(rot);
      return { x: centre.x + rx * Math.cos(a) - ry * Math.sin(a), y: centre.y + rx * Math.sin(a) + ry * Math.cos(a) };
    };
    return { pic, S, R, k, rot, toScreen, fromScreen, centre };
  }

  let shoreAnchor = null;
  function shoreCentre(pic) {
    if (!shoreAnchor && pic.own) shoreAnchor = { x: pic.own.px + 1.5, y: pic.own.py + 1.5 };
    return shoreAnchor || { x: 0, y: 0 };
  }

  function draw() {
    const lab = o.getLab();
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    lastT = now;
    sweep = (sweep + dt * 150) % 360; // 2.4 s per revolution
    if (o.sweepSound && sweep < lastPingAngle) sfx.ping();
    lastPingAngle = sweep;
    const t = o.getTime ? o.getTime() : Date.now();
    const S = sizeCss();
    ctx.clearRect(0, 0, S, S);
    if (!lab || !lab.ownShip) { drawIdle(S); raf = requestAnimationFrame(draw); return; }
    const f = frame(lab, t);
    const { R, toScreen, rot, pic } = f;
    const cx = S / 2;
    const cy = S / 2;

    // Screen: holographic glass disc
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R + 22);
    bg.addColorStop(0, 'rgba(18, 70, 110, 0.55)');
    bg.addColorStop(0.7, 'rgba(6, 26, 46, 0.7)');
    bg.addColorStop(1, 'rgba(2, 10, 20, 0.85)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R + 20, 0, Math.PI * 2); ctx.fill();
    // outer halo
    ctx.save();
    ctx.shadowColor = HOLO(0.9); ctx.shadowBlur = 18;
    ctx.strokeStyle = HOLO(0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // slowly rotating bezel segments (decorative)
    ctx.strokeStyle = HOLO(0.35); ctx.lineWidth = 2;
    const spin = now / 9000;
    for (let i = 0; i < 6; i++) {
      const a0 = spin + (i * Math.PI) / 3;
      ctx.beginPath(); ctx.arc(cx, cy, R + 14, a0, a0 + 0.55); ctx.stroke();
    }

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

    // dot grid
    ctx.fillStyle = HOLO(0.07);
    const step = Math.max(14, R / 12);
    for (let gx = cx - R; gx < cx + R; gx += step) for (let gy = cy - R; gy < cy + R; gy += step) ctx.fillRect(gx, gy, 1.2, 1.2);

    // Sea/rain clutter
    const sea = lab.world?.seaState ?? 3;
    const rain = lab.world?.rain;
    ctx.fillStyle = HOLO(0.22);
    const clutterR = R * Math.min(0.45, 0.06 * sea) * (3 / Math.max(0.75, range));
    for (const sp of speckles) {
      if (Math.random() > 0.5) continue;
      const rr = sp.r * clutterR;
      ctx.fillRect(cx + Math.cos(sp.a) * rr, cy + Math.sin(sp.a) * rr, 1.5, 1.5);
    }
    if (rain) {
      ctx.fillStyle = HOLO(0.1);
      for (let i = 0; i < 120; i++) ctx.fillRect(cx + (Math.random() - 0.5) * R * 1.2 + R * 0.3, cy + (Math.random() - 0.5) * R * 0.8 - R * 0.3, 2, 2);
    }

    // Range rings + spokes
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.strokeStyle = HOLO(i === 4 ? 0.3 : 0.14);
      ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = HOLO(0.07);
    for (let d = 0; d < 360; d += 30) {
      const a = toRad(d + rot - 90);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.08, cy + Math.sin(a) * R * 0.08); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    ctx.fillStyle = HOLO(0.45); ctx.font = `10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (let i = 1; i <= 3; i++) ctx.fillText(`${+(range * i / 4).toFixed(2)}`, cx + 4, cy - (R * i) / 4 - 3);

    // Sweep with afterglow
    const sweepScreen = toRad(sweep - 90);
    if (ctx.createConicGradient) {
      const trail = 1.25;
      const g = ctx.createConicGradient(sweepScreen - trail, cx, cy);
      g.addColorStop(0, HOLO(0));
      g.addColorStop(trail / (Math.PI * 2) * 0.97, HOLO(0.26));
      g.addColorStop(trail / (Math.PI * 2), HOLO(0.4));
      g.addColorStop(trail / (Math.PI * 2) + 0.001, HOLO(0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sweepScreen - trail, sweepScreen + 0.01); ctx.closePath(); ctx.fill();
    }
    ctx.save();
    ctx.shadowColor = HOLO(1); ctx.shadowBlur = 12;
    const lg = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweepScreen) * R, cy + Math.sin(sweepScreen) * R);
    lg.addColorStop(0, HOLO(0.1)); lg.addColorStop(1, 'rgba(210, 250, 255, 0.95)');
    ctx.strokeStyle = lg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweepScreen) * R, cy + Math.sin(sweepScreen) * R); ctx.stroke();
    ctx.restore();

    // Targets
    for (const c of pic.contacts) {
      const { sx, sy } = toScreen(c.px, c.py);
      if (Math.hypot(sx - cx, sy - cy) > R) continue;
      const screenAng = norm360(Math.atan2(sy - cy, sx - cx) * 180 / Math.PI + 90);
      const since = norm360(sweep - screenAng);
      const intensity = Math.max(0.25, 1 - since / 300);
      glow.set(c.id, intensity);
      drawEcho(c, sx, sy, intensity, f, t, now);
    }

    // Own ship
    if (pic.own) {
      const { sx, sy } = toScreen(pic.own.px, pic.own.py);
      const hd = toRad((pic.own.course || 0) + rot - 90);
      if (o.mode === 'ship') {
        const hg = ctx.createLinearGradient(sx, sy, sx + Math.cos(hd) * R, sy + Math.sin(hd) * R);
        hg.addColorStop(0, 'rgba(255,255,255,0.75)'); hg.addColorStop(1, 'rgba(255,255,255,0.05)');
        ctx.strokeStyle = hg; ctx.lineWidth = 1.2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hd) * R, sy + Math.sin(hd) * R); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save(); ctx.shadowColor = o.mode === 'shore' ? '#ffd36b' : '#ffffff'; ctx.shadowBlur = 14;
      drawShipShape(sx, sy, hd, o.mode === 'shore' ? '#ffd36b' : '#ffffff', o.mode === 'shore' ? 7 : 5.5);
      ctx.restore();
      // 6-minute vector
      const v = (pic.own.speed || 0) * 0.1 * f.k;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hd) * v, sy + Math.sin(hd) * v); ctx.stroke();
      if (o.mode === 'shore') label(sx + 12, sy - 12, lab.ownShip.name, '#ffd36b');
    }

    // EBL / VRM
    ctx.lineWidth = 1.3;
    if (ebl) {
      const a = toRad(ebl.bearing + rot - 90);
      ctx.strokeStyle = '#ffd36b'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); ctx.setLineDash([]);
    }
    if (vrm) {
      ctx.strokeStyle = '#ffd36b'; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.arc(cx, cy, vrm.range * f.k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // Bearing scale
    ctx.font = `10.5px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 5) {
      const a = toRad(d + rot - 90);
      const major = d % 30 === 0;
      const r1 = R + (major ? 1 : d % 10 === 0 ? 4 : 6);
      ctx.strokeStyle = HOLO(major ? 0.85 : 0.35);
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200, 240, 255, 0.85)';
    for (let d = 0; d < 360; d += 30) {
      const a = toRad(d + rot - 90);
      ctx.fillText(String(d).padStart(3, '0'), cx + Math.cos(a) * (R + 22), cy + Math.sin(a) * (R + 22));
    }

    // HUD pills
    const modeTxt = o.mode === 'shore' ? 'N-UP · VTS' : orientation === 'head' ? 'H-UP' : 'N-UP';
    if (S < 420) pill(4, 4, `${range} NM · ${modeTxt}`, '#bfefff', 'left');
    else {
      pill(6, 6, `${range} NM · ${modeTxt}`, '#bfefff', 'left');
      if (pic.own && o.mode === 'ship') pill(S - 6, 6, `HDG ${String(Math.round(pic.own.course)).padStart(3, '0')}° · ${pic.own.speed.toFixed(1)} kn`, '#bfefff', 'right');
    }
    if (mouse) {
      const p = f.fromScreen(mouse.x, mouse.y);
      const dx = p.x - (pic.own?.px || 0);
      const dy = p.y - (pic.own?.py || 0);
      const brg = norm360(Math.atan2(dx, dy) * 180 / Math.PI);
      const rng = Math.hypot(dx, dy);
      pill(S - 6, S - 30, `⌖ ${String(Math.round(brg)).padStart(3, '0')}° · ${rng.toFixed(2)} NM`, '#bfefff', 'right');
      if (tool === 'ebl') ebl = { bearing: brg };
      if (tool === 'vrm') vrm = { range: rng };
    }
    if (ebl) pill(6, S - 56, `EBL ${String(Math.round(ebl.bearing)).padStart(3, '0')}°`, '#ffd36b', 'left');
    if (vrm) pill(6, S - 30, `VRM ${vrm.range.toFixed(2)} NM`, '#ffd36b', 'left');

    raf = requestAnimationFrame(draw);
  }

  function drawEcho(c, sx, sy, intensity, f, t, now) {
    const isSel = c.id === selectedId;
    const isAcq = acquired.has(c.id) || o.mode === 'shore';
    const danger = c.cpa < 0.5 && c.tcpa > 0 && c.tcpa < 30;
    // glowing echo
    const sizePx = c.tow ? 4.5 : c.type?.match(/tanker|bulk|container|car|ro-ro/i) ? 5 : 3.5;
    const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sizePx * 3.2);
    rg.addColorStop(0, `rgba(220, 250, 255, ${0.95 * intensity})`);
    rg.addColorStop(0.35, HOLO(0.6 * intensity));
    rg.addColorStop(1, HOLO(0));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(sx, sy, sizePx * 3.2, 0, Math.PI * 2); ctx.fill();
    if (c.tow) {
      // barge 250 m astern of the tug
      const a = toRad(c.course + f.rot + 90);
      const len = 0.135 * f.k;
      ctx.strokeStyle = HOLO(0.45 * intensity); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); ctx.stroke();
      ctx.fillStyle = HOLO(0.85 * intensity);
      ctx.fillRect(sx + Math.cos(a) * len - 3.5, sy + Math.sin(a) * len - 3.5, 7, 7);
    }
    const hd = toRad(c.course + f.rot - 90);
    if (c.ais) drawShipShape(sx, sy, hd, isSel ? '#ffd36b' : '#7fe0ff', 6.5, true);
    if (danger) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.save(); ctx.shadowColor = '#ff5d6c'; ctx.shadowBlur = 16;
      ctx.strokeStyle = `rgba(255, 93, 108, ${0.5 + 0.5 * pulse})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx, sy, 13 + pulse * 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (isAcq) {
      const col = danger ? '#ff5d6c' : '#7fe0ff';
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]); ctx.lineDashOffset = -now / 60;
      ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      const v = (c.speed || 0) * 0.1 * f.k;
      const vg = ctx.createLinearGradient(sx, sy, sx + Math.cos(hd) * v, sy + Math.sin(hd) * v);
      vg.addColorStop(0, col); vg.addColorStop(1, 'rgba(127, 224, 255, 0.15)');
      ctx.strokeStyle = vg; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hd) * v, sy + Math.sin(hd) * v); ctx.stroke();
    }
    if (isSel || (o.mode === 'shore' && c.ais)) {
      const txt = c.ais ? c.name : 'NO AIS';
      label(sx + 14, sy - 14, isSel && c.cpa != null ? `${txt} · CPA ${c.cpa.toFixed(1)}` : txt, isSel ? '#ffd36b' : '#bfefff');
    }
    if (isSel) {
      // animated corner brackets
      const r = 15 + Math.sin(now / 250) * 1.5, l = 6;
      ctx.save(); ctx.shadowColor = '#ffd36b'; ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1.6;
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx + dx * r, sy + dy * (r - l)); ctx.lineTo(sx + dx * r, sy + dy * r); ctx.lineTo(sx + dx * (r - l), sy + dy * r);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawShipShape(x, y, a, color, s = 6, outline = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.5); ctx.lineTo(s * 0.8, s); ctx.lineTo(0, s * 0.55); ctx.lineTo(-s * 0.8, s); ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    if (outline) ctx.stroke(); else { ctx.fillStyle = color; ctx.fill(); }
    ctx.restore();
  }

  // Rounded glass tag for text on the scope.
  function pill(x, y, text, color, align = 'left') {
    ctx.font = `600 10.5px ${MONO}`;
    const w = ctx.measureText(text).width + 16, hgt = 20;
    const x0 = align === 'right' ? x - w : x;
    ctx.fillStyle = 'rgba(4, 18, 34, 0.72)';
    ctx.strokeStyle = 'rgba(127, 224, 255, 0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y, w, hgt, 10); else ctx.rect(x0, y, w, hgt);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + 8, y + hgt / 2 + 0.5);
  }
  const label = (x, y, text, color) => pill(x, y - 10, text, color);

  function drawIdle(S) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(18, 70, 110, 0.5)'); g.addColorStop(1, 'rgba(2, 10, 20, 0.85)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = HOLO(0.4); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = HOLO(0.8);
    ctx.font = `600 13px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('STAND BY', S / 2, S / 2);
  }

  // ---------- interaction ----------
  function hit(ev) {
    const lab = o.getLab();
    if (!lab) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const f = frame(lab, o.getTime ? o.getTime() : Date.now());
    let best = null;
    let bd = 16;
    for (const c of f.pic.contacts) {
      const { sx, sy } = f.toScreen(c.px, c.py);
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bd) { bd = d; best = c; }
    }
    return { target: best, mx, my, f };
  }

  canvas.addEventListener('pointermove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    if (dragging && o.godMode) {
      const lab = o.getLab();
      const f = frame(lab, Date.now());
      dragging.pos = f.fromScreen(mouse.x, mouse.y);
    }
  });
  canvas.addEventListener('pointerleave', () => { mouse = null; });
  canvas.addEventListener('pointerdown', (ev) => {
    const r = hit(ev);
    if (!r) return;
    if (tool) { tool = null; return; }
    if (r.target) {
      selectedId = r.target.id;
      acquired.add(r.target.id);
      sfx.tick();
      o.onSelect?.(r.target);
      if (o.godMode && o.onMoveTarget) { dragging = { id: r.target.id, pos: null }; canvas.setPointerCapture(ev.pointerId); }
    } else {
      selectedId = null;
      o.onSelect?.(null);
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (dragging?.pos) o.onMoveTarget?.(dragging.id, dragging.pos);
    dragging = null;
  });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const i = RANGES.indexOf(range);
    range = RANGES[Math.max(0, Math.min(RANGES.length - 1, i + (ev.deltaY > 0 ? 1 : -1)))];
  }, { passive: false });

  raf = requestAnimationFrame(draw);

  return {
    RANGES,
    get range() { return range; },
    setRange(r) { range = r; },
    stepRange(d) { const i = RANGES.indexOf(range); range = RANGES[Math.max(0, Math.min(RANGES.length - 1, i + d))]; },
    get orientation() { return orientation; },
    setOrientation(v) { orientation = v; },
    setTool(t) { tool = t; if (t === 'ebl' && !ebl) ebl = { bearing: 0 }; if (t === 'vrm' && !vrm) vrm = { range: range / 2 }; },
    clearTools() { tool = null; ebl = null; vrm = null; },
    acquireAll() { const lab = o.getLab(); (lab?.targets || []).forEach((t) => acquired.add(t.id)); },
    select(id) { selectedId = id; if (id) acquired.add(id); },
    get selectedId() { return selectedId; },
    setGodMode(v) { o.godMode = v; },
    setSweepSound(v) { o.sweepSound = v; },
    recentre() { shoreAnchor = null; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
