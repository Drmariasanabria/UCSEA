// Canvas radar/ARPA display. Used on the bridge (own-ship centred) and at VTS/MRCC (shore picture).
import { picture } from './engine.js';
import { toRad, norm360 } from '../core/util.js';
import { sfx } from '../core/audio.js';

const RANGES = [0.75, 1.5, 3, 6, 12, 24];

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
    const R = S / 2 - 26;
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

    // Screen
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R + 20);
    bg.addColorStop(0, '#062a2a');
    bg.addColorStop(1, '#020c10');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R + 18, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

    // Sea/rain clutter
    const sea = lab.world?.seaState ?? 3;
    const rain = lab.world?.rain;
    ctx.fillStyle = 'rgba(80,255,180,0.18)';
    const clutterR = R * Math.min(0.45, 0.06 * sea) * (3 / Math.max(0.75, range));
    for (const sp of speckles) {
      if (Math.random() > 0.5) continue;
      const rr = sp.r * clutterR;
      ctx.fillRect(cx + Math.cos(sp.a) * rr, cy + Math.sin(sp.a) * rr, 1.6, 1.6);
    }
    if (rain) {
      ctx.fillStyle = 'rgba(80,255,180,0.08)';
      for (let i = 0; i < 120; i++) ctx.fillRect(cx + (Math.random() - 0.5) * R * 1.2 + R * 0.3, cy + (Math.random() - 0.5) * R * 0.8 - R * 0.3, 2, 2);
    }

    // Range rings
    ctx.strokeStyle = 'rgba(90,255,200,0.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2); ctx.stroke(); }

    // Sweep (conic trail)
    const sweepScreen = toRad(sweep - 90);
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(sweepScreen - 0.9, cx, cy);
      g.addColorStop(0, 'rgba(60,255,190,0)');
      g.addColorStop(0.14, 'rgba(60,255,190,0.22)');
      g.addColorStop(0.1433, 'rgba(60,255,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sweepScreen - 0.9, sweepScreen + 0.01); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,255,210,0.55)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweepScreen) * R, cy + Math.sin(sweepScreen) * R); ctx.stroke();

    // Targets
    for (const c of pic.contacts) {
      const { sx, sy } = toScreen(c.px, c.py);
      if (Math.hypot(sx - cx, sy - cy) > R) continue;
      const screenAng = norm360(Math.atan2(sy - cy, sx - cx) * 180 / Math.PI + 90);
      const since = norm360(sweep - screenAng);
      const intensity = Math.max(0.18, 1 - since / 300);
      glow.set(c.id, intensity);
      drawEcho(c, sx, sy, intensity, f, t);
    }

    // Own ship
    if (pic.own) {
      const { sx, sy } = toScreen(pic.own.px, pic.own.py);
      const hd = toRad((pic.own.course || 0) + rot - 90);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      if (o.mode === 'ship') {
        ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hd) * R, sy + Math.sin(hd) * R); ctx.stroke();
        ctx.setLineDash([]);
      }
      drawShipShape(sx, sy, hd, o.mode === 'shore' ? '#ffd166' : '#ffffff', o.mode === 'shore' ? 7 : 5);
      // 6-minute vector
      const v = (pic.own.speed || 0) * 0.1 * f.k;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hd) * v, sy + Math.sin(hd) * v); ctx.stroke();
      if (o.mode === 'shore') label(sx + 9, sy - 9, lab.ownShip.name, '#ffd166');
    }

    // EBL / VRM
    if (ebl) {
      const a = toRad(ebl.bearing + rot - 90);
      ctx.strokeStyle = '#ffcf5a'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); ctx.setLineDash([]);
    }
    if (vrm) {
      ctx.strokeStyle = '#ffcf5a'; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.arc(cx, cy, vrm.range * f.k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // Bearing scale
    ctx.strokeStyle = 'rgba(120,255,210,0.5)';
    ctx.fillStyle = 'rgba(160,255,220,0.8)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 5) {
      const a = toRad(d + rot - 90);
      const r1 = R + (d % 30 === 0 ? 0 : d % 10 === 0 ? 4 : 7);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10)); ctx.stroke();
      if (d % 30 === 0) ctx.fillText(String(d).padStart(3, '0'), cx + Math.cos(a) * (R + 19), cy + Math.sin(a) * (R + 19));
    }

    // HUD text
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(160,255,220,0.9)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(`${range} NM  ${o.mode === 'shore' ? 'NORTH UP · VTS' : orientation === 'head' ? 'HEAD UP' : 'NORTH UP'}`, 8, 14);
    ctx.textAlign = 'right';
    if (pic.own && o.mode === 'ship') ctx.fillText(`HDG ${String(Math.round(pic.own.course)).padStart(3, '0')}°  SPD ${pic.own.speed.toFixed(1)} kn`, S - 8, 14);
    if (mouse) {
      const p = f.fromScreen(mouse.x, mouse.y);
      const dx = p.x - (pic.own?.px || 0);
      const dy = p.y - (pic.own?.py || 0);
      const brg = norm360(Math.atan2(dx, dy) * 180 / Math.PI);
      const rng = Math.hypot(dx, dy);
      ctx.fillText(`CURSOR ${String(Math.round(brg)).padStart(3, '0')}° ${rng.toFixed(2)} NM`, S - 8, S - 10);
      if (tool === 'ebl') ebl = { bearing: brg };
      if (tool === 'vrm') vrm = { range: rng };
    }
    ctx.textAlign = 'left';
    if (ebl) ctx.fillText(`EBL ${String(Math.round(ebl.bearing)).padStart(3, '0')}°`, 8, S - 26);
    if (vrm) ctx.fillText(`VRM ${vrm.range.toFixed(2)} NM`, 8, S - 10);

    raf = requestAnimationFrame(draw);
  }

  function drawEcho(c, sx, sy, intensity, f, t) {
    const isSel = c.id === selectedId;
    const isAcq = acquired.has(c.id) || o.mode === 'shore';
    // raw echo blob
    ctx.fillStyle = `rgba(110,255,170,${0.85 * intensity})`;
    const sizePx = c.tow ? 4 : c.type?.match(/tanker|bulk|container|car|ro-ro/i) ? 4.5 : 3;
    ctx.beginPath(); ctx.ellipse(sx, sy, sizePx, sizePx * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    if (c.tow) {
      // barge 250 m astern of the tug
      const a = toRad(c.course + f.rot + 90);
      const len = 0.135 * f.k;
      ctx.strokeStyle = `rgba(110,255,170,${0.35 * intensity})`;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); ctx.stroke();
      ctx.fillStyle = `rgba(110,255,170,${0.8 * intensity})`;
      ctx.fillRect(sx + Math.cos(a) * len - 3.5, sy + Math.sin(a) * len - 3.5, 7, 7);
    }
    const hd = toRad(c.course + f.rot - 90);
    if (c.ais) drawShipShape(sx, sy, hd, isSel ? '#ffd166' : '#5ad1ff', 6, true);
    if (isAcq) {
      ctx.strokeStyle = c.cpa < 0.5 && c.tcpa > 0 && c.tcpa < 30 ? '#ff5d5d' : '#5ad1ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
      const v = (c.speed || 0) * 0.1 * f.k;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(hd) * v, sy + Math.sin(hd) * v); ctx.stroke();
    }
    if (isSel || (o.mode === 'shore' && c.ais)) {
      label(sx + 11, sy - 10, c.ais ? c.name : 'NO AIS', isSel ? '#ffd166' : '#9fe8ff');
    }
    if (isSel) {
      ctx.strokeStyle = '#ffd166';
      ctx.strokeRect(sx - 12, sy - 12, 24, 24);
    }
  }

  function drawShipShape(x, y, a, color, s = 6, outline = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.5); ctx.lineTo(s * 0.8, s); ctx.lineTo(-s * 0.8, s); ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    if (outline) ctx.stroke(); else { ctx.fillStyle = color; ctx.fill(); }
    ctx.restore();
  }

  function label(x, y, text, color) {
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
  }

  function drawIdle(S) {
    ctx.fillStyle = '#031014';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,255,210,0.6)';
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
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
