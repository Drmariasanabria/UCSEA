// Holographic 3D knowledge graph on canvas: a slowly rotating constellation with glowing nodes,
// light pulses travelling along links, depth cueing, hover neighbourhood highlight, local-graph
// focus and search. Drag the background to orbit, wheel to zoom, click a node to select it,
// double-click to open it. No dependencies. Same API as the previous 2D graph.

const hexRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [90, 209, 255];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgba = ([r, g, b], a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const FONT = 'Manrope, Inter, system-ui, sans-serif';

export function createForceGraph(canvas, { onSelect, onOpen, colorOf = () => '#5ad1ff', labelOf = (n) => n.label } = {}) {
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let nodes = [];
  let links = [];
  let byId = new Map();
  let W = 0, H = 0, dpr = 1;
  const cam = { yaw: 0.6, pitch: -0.32, k: 1, cx: 0, cy: 0, cz: 0, tx: 0, ty: 0, tz: 0, panX: 0, panY: 0 };
  let hover = null, selected = null, drag = null;
  let alpha = 1;
  let raf = 0;
  let showLabels = true;
  let search = '';
  let focus = null; // { id, depth }
  let lastInteraction = 0;
  let pulses = [];
  const settings = { repel: 4200, linkDist: 95, linkStrength: 0.045, gravity: 0.009 };
  const FOV = 900;
  const stars = Array.from({ length: 160 }, () => {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 900 + Math.random() * 500;
    const s = Math.sqrt(1 - u * u);
    return { x: r * s * Math.cos(th), y: r * u, z: r * s * Math.sin(th), a: 0.15 + Math.random() * 0.5 };
  });

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  function setData(newNodes, newLinks) {
    const old = byId;
    nodes = newNodes.map((n) => {
      const o = old.get(n.id);
      const rand = () => (Math.random() - 0.5) * 420;
      return { ...n, x: o?.x ?? rand(), y: o?.y ?? rand(), z: o?.z ?? rand(), vx: 0, vy: 0, vz: 0, deg: 0, rgb: hexRgb(colorOf(n)) };
    });
    byId = new Map(nodes.map((n) => [n.id, n]));
    links = newLinks.filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target)
      .map((l) => ({ ...l, s: byId.get(l.source), t: byId.get(l.target) }));
    for (const l of links) { l.s.deg++; l.t.deg++; }
    pulses = [];
    alpha = 1;
  }

  function visibleSet() {
    if (!focus) return null;
    const set = new Set([focus.id]);
    let frontier = [focus.id];
    for (let d = 0; d < focus.depth; d++) {
      const next = [];
      for (const l of links) {
        if (frontier.includes(l.source) && !set.has(l.target)) { set.add(l.target); next.push(l.target); }
        if (frontier.includes(l.target) && !set.has(l.source)) { set.add(l.source); next.push(l.source); }
      }
      frontier = next;
    }
    return set;
  }

  function step(vis) {
    if (alpha < 0.004) return;
    const ns = vis ? nodes.filter((n) => vis.has(n.id)) : nodes;
    const ls = vis ? links.filter((l) => vis.has(l.source) && vis.has(l.target)) : links;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1) { dx = Math.random(); dy = Math.random(); dz = Math.random(); d2 = 1; }
        if (d2 > 360000) continue;
        const d = Math.sqrt(d2), f = (settings.repel * alpha) / d2;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; a.vz += (dz / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; b.vz -= (dz / d) * f;
      }
    }
    for (const l of ls) {
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, dz = l.t.z - l.s.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const f = (d - settings.linkDist) * settings.linkStrength * alpha;
      l.s.vx += (dx / d) * f; l.s.vy += (dy / d) * f; l.s.vz += (dz / d) * f;
      l.t.vx -= (dx / d) * f; l.t.vy -= (dy / d) * f; l.t.vz -= (dz / d) * f;
    }
    for (const n of ns) {
      n.vx -= n.x * settings.gravity * alpha; n.vy -= n.y * settings.gravity * alpha; n.vz -= n.z * settings.gravity * alpha;
      n.vx *= 0.8; n.vy *= 0.8; n.vz *= 0.8;
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
    }
    alpha *= 0.99;
  }

  // world -> camera -> screen
  function project(x, y, z) {
    x -= cam.cx; y -= cam.cy; z -= cam.cz;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = FOV / (FOV + z2 * cam.k);
    return { sx: W / 2 + cam.panX + x1 * f * cam.k, sy: H / 2 + cam.panY + y2 * f * cam.k, z: z2, f };
  }
  const radius = (n) => 3.2 + Math.sqrt(n.deg) * 2.1;

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (document.hidden || !W) return;
    const vis = visibleSet();
    step(vis);
    // camera easing + idle auto-orbit
    cam.cx += (cam.tx - cam.cx) * 0.08; cam.cy += (cam.ty - cam.cy) * 0.08; cam.cz += (cam.tz - cam.cz) * 0.08;
    if (!reduce && !drag && !hover && now - lastInteraction > 2500) cam.yaw += 0.0016;
    ctx.clearRect(0, 0, W, H);

    // starfield + holographic floor rings
    for (const s of stars) {
      const p = project(s.x + cam.cx, s.y + cam.cy, s.z + cam.cz);
      if (p.f <= 0) continue;
      ctx.fillStyle = `rgba(170, 225, 255, ${s.a * Math.min(1, p.f)})`;
      ctx.fillRect(p.sx, p.sy, 1.3, 1.3);
    }
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const r = i * 110;
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const th = (a / 64) * Math.PI * 2;
        const p = project(cam.cx + Math.cos(th) * r, cam.cy + 260, cam.cz + Math.sin(th) * r);
        a ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy);
      }
      ctx.strokeStyle = `rgba(90, 215, 255, ${0.11 - i * 0.018})`;
      ctx.stroke();
    }

    const anchor = hover || selected;
    const hl = new Set();
    if (anchor) {
      hl.add(anchor.id);
      for (const l of links) { if (l.source === anchor.id) hl.add(l.target); if (l.target === anchor.id) hl.add(l.source); }
    }
    const q = search.trim().toLowerCase();
    const P = new Map();
    for (const n of nodes) P.set(n.id, project(n.x, n.y, n.z));
    const depthA = (z) => Math.max(0.25, Math.min(1, 0.75 - z / 700));

    // links
    for (const l of links) {
      const hidden = vis && (!vis.has(l.source) || !vis.has(l.target));
      const a = P.get(l.source), b = P.get(l.target);
      const on = anchor && (l.source === anchor.id || l.target === anchor.id);
      let al = (l.implicit ? 0.1 : 0.22) * depthA((a.z + b.z) / 2);
      if (hidden) al *= 0.1;
      if (anchor && !on) al *= 0.35;
      if (on) {
        ctx.save(); ctx.shadowColor = '#ffd36b'; ctx.shadowBlur = 10;
        ctx.strokeStyle = 'rgba(255, 211, 107, 0.85)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        ctx.restore();
      } else {
        const g = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
        g.addColorStop(0, rgba(l.s.rgb, al)); g.addColorStop(1, rgba(l.t.rgb, al));
        ctx.strokeStyle = g; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
    }

    // light pulses travelling along links (more on the highlighted neighbourhood)
    if (!reduce && links.length) {
      if (pulses.length < 26 && Math.random() < 0.35) {
        const pool = anchor ? links.filter((l) => l.source === anchor.id || l.target === anchor.id) : links;
        const l = pool[Math.floor(Math.random() * pool.length)];
        if (l && !(vis && (!vis.has(l.source) || !vis.has(l.target)))) pulses.push({ l, t: 0, v: 0.008 + Math.random() * 0.012, rev: Math.random() < 0.5 });
      }
      ctx.globalCompositeOperation = 'lighter';
      pulses = pulses.filter((p) => (p.t += p.v) < 1);
      for (const p of pulses) {
        const a = P.get(p.l.source), b = P.get(p.l.target);
        if (!a || !b) continue;
        const t = p.rev ? 1 - p.t : p.t;
        const x = a.sx + (b.sx - a.sx) * t, y = a.sy + (b.sy - a.sy) * t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
        const col = anchor ? [255, 211, 107] : p.l.s.rgb;
        g.addColorStop(0, rgba([255, 255, 255], 0.95)); g.addColorStop(0.4, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fillRect(x - 6, y - 6, 12, 12);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // nodes, far to near
    const order = [...nodes].sort((a, b) => P.get(b.id).z - P.get(a.id).z);
    const labels = [];
    for (const n of order) {
      const p = P.get(n.id);
      if (p.f <= 0 || p.sx < -60 || p.sy < -60 || p.sx > W + 60 || p.sy > H + 60) continue;
      const hidden = vis && !vis.has(n.id);
      const match = q && (n.label.toLowerCase().includes(q) || (n.alt || '').toLowerCase().includes(q));
      const dim = (anchor && !hl.has(n.id)) || (q && !match);
      const al = depthA(p.z) * (dim ? 0.3 : 1) * (hidden ? 0.06 : 1);
      const r = radius(n) * p.f * Math.max(0.7, Math.min(1.8, cam.k));
      // halo
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 4);
      g.addColorStop(0, rgba(n.rgb, 0.55 * al)); g.addColorStop(1, rgba(n.rgb, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // core
      const c = ctx.createRadialGradient(p.sx - r * 0.3, p.sy - r * 0.3, 0, p.sx, p.sy, r);
      c.addColorStop(0, rgba([255, 255, 255], 0.95 * al)); c.addColorStop(0.45, rgba(n.rgb, al)); c.addColorStop(1, rgba(n.rgb.map((v) => v * 0.6), al));
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill();
      if (n === selected || match) {
        ctx.save(); ctx.shadowColor = match ? '#ffd36b' : '#ffffff'; ctx.shadowBlur = 14;
        ctx.strokeStyle = match ? '#ffd36b' : '#ffffff'; ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 3]); ctx.lineDashOffset = -now / 50;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      const showL = showLabels && !hidden && (hl.has(n.id) || match || n === selected || (!anchor && (n.deg >= 5 || cam.k > 1.5) && p.z < 120));
      if (showL) labels.push({ n, p, r, al, strong: hl.has(n.id) || match || n === selected });
    }
    // labels on top, as glass pills for highlighted ones
    for (const { n, p, r, al, strong } of labels) {
      const text = labelOf(n);
      ctx.font = `${strong ? 700 : 500} ${strong ? 13 : 11.5}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = p.sy + r + 14;
      if (strong) {
        const w = ctx.measureText(text).width + 18;
        ctx.fillStyle = 'rgba(4, 16, 30, 0.78)';
        ctx.strokeStyle = rgba(n.rgb, 0.6); ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(p.sx - w / 2, y - 11, w, 22, 11); else ctx.rect(p.sx - w / 2, y - 11, w, 22);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff';
      } else ctx.fillStyle = `rgba(220, 240, 255, ${0.75 * al})`;
      ctx.fillText(text, p.sx, y + 0.5);
    }
  }

  function nodeAt(sx, sy) {
    const vis = visibleSet();
    let best = null, bd = 12;
    for (const n of nodes) {
      if (vis && !vis.has(n.id)) continue;
      const p = project(n.x, n.y, n.z);
      const d = Math.hypot(p.sx - sx, p.sy - sy) - radius(n) * p.f * cam.k;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    lastInteraction = performance.now();
    canvas.setPointerCapture(e.pointerId);
    drag = { x: p.x, y: p.y, yaw: cam.yaw, pitch: cam.pitch, panX: cam.panX, panY: cam.panY, pan: e.shiftKey || e.button === 2, node: nodeAt(p.x, p.y), moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (drag) {
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.pan) { cam.panX = drag.panX + dx; cam.panY = drag.panY + dy; }
      else { cam.yaw = drag.yaw + dx * 0.006; cam.pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + dy * 0.006)); }
      lastInteraction = performance.now();
    } else {
      hover = nodeAt(p.x, p.y);
      canvas.style.cursor = hover ? 'pointer' : 'grab';
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && !drag.moved) {
      selected = drag.node || null;
      onSelect?.(selected);
      if (selected) api.centerOn(selected.id);
    }
    drag = null;
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', (e) => { const p = pos(e); const n = nodeAt(p.x, p.y); if (n) onOpen?.(n); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    lastInteraction = performance.now();
    cam.k = Math.max(0.35, Math.min(4, cam.k * (e.deltaY < 0 ? 1.1 : 0.91)));
  }, { passive: false });

  raf = requestAnimationFrame(draw);

  const api = {
    setData,
    setSearch(q) { search = q; const n = nodes.find((x) => q && x.label.toLowerCase() === q.toLowerCase()); if (n) this.centerOn(n.id); },
    setLabels(v) { showLabels = v; },
    setFocus(id, depth = 1) { focus = id ? { id, depth } : null; alpha = 0.8; if (id) this.centerOn(id); },
    get focus() { return focus; },
    select(id) { selected = byId.get(id) || null; if (selected) this.centerOn(id); },
    centerOn(id) { const n = byId.get(id); if (n) { cam.tx = n.x; cam.ty = n.y; cam.tz = n.z; cam.panX = 0; cam.panY = 0; cam.k = Math.max(cam.k, 1.25); lastInteraction = performance.now(); } },
    reheat() { alpha = 1; for (const n of nodes) { n.x += (Math.random() - 0.5) * 60; n.y += (Math.random() - 0.5) * 60; n.z += (Math.random() - 0.5) * 60; } },
    zoom(f) { cam.k = Math.max(0.35, Math.min(4, cam.k * f)); },
    fit() { cam.tx = cam.ty = cam.tz = 0; cam.panX = cam.panY = 0; cam.k = 1; cam.pitch = -0.32; },
    settings,
    snapshot() {
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, Math.max(c.width, c.height) / 1.4);
      g.addColorStop(0, '#0c2a48'); g.addColorStop(1, '#020812');
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(canvas, 0, 0);
      return c.toDataURL('image/png');
    },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
  return api;
}
