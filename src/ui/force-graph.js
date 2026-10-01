// Obsidian-style force-directed graph on canvas: drag, pan, zoom, hover-highlight,
// local-graph focus, search highlighting. No dependencies.

export function createForceGraph(canvas, { onSelect, onOpen, colorOf = () => '#5ad1ff', labelOf = (n) => n.label } = {}) {
  const ctx = canvas.getContext('2d');
  let nodes = [];
  let links = [];
  let byId = new Map();
  let W = 0, H = 0, dpr = 1;
  let view = { x: 0, y: 0, k: 1 };
  let hover = null, selected = null, drag = null, pan = null;
  let alpha = 1;
  let raf = 0;
  let showLabels = true;
  let search = '';
  let focus = null; // { id, depth }
  const settings = { repel: 900, linkDist: 70, linkStrength: 0.06, gravity: 0.012 };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(() => { resize(); });
  ro.observe(canvas);
  resize();

  function setData(newNodes, newLinks) {
    const old = byId;
    nodes = newNodes.map((n) => {
      const o = old.get(n.id);
      return { ...n, x: o?.x ?? (Math.random() - 0.5) * 600, y: o?.y ?? (Math.random() - 0.5) * 400, vx: 0, vy: 0, deg: 0 };
    });
    byId = new Map(nodes.map((n) => [n.id, n]));
    links = newLinks.filter((l) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target)
      .map((l) => ({ ...l, s: byId.get(l.source), t: byId.get(l.target) }));
    for (const l of links) { l.s.deg++; l.t.deg++; }
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

  function step() {
    const vis = visibleSet();
    const ns = vis ? nodes.filter((n) => vis.has(n.id)) : nodes;
    const ls = vis ? links.filter((l) => vis.has(l.source) && vis.has(l.target)) : links;
    if (alpha < 0.005 && !drag) return;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random(); dy = Math.random(); d2 = 1; }
        if (d2 > 250000) continue;
        const f = (settings.repel * alpha) / d2;
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    for (const l of ls) {
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - settings.linkDist) * settings.linkStrength * alpha;
      l.s.vx += (dx / d) * f; l.s.vy += (dy / d) * f;
      l.t.vx -= (dx / d) * f; l.t.vy -= (dy / d) * f;
    }
    for (const n of ns) {
      n.vx -= n.x * settings.gravity * alpha;
      n.vy -= n.y * settings.gravity * alpha;
      if (drag?.node === n) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
    }
    alpha *= 0.992;
  }

  const toScreen = (n) => ({ sx: W / 2 + (n.x + view.x) * view.k, sy: H / 2 + (n.y + view.y) * view.k });
  const toWorld = (sx, sy) => ({ x: (sx - W / 2) / view.k - view.x, y: (sy - H / 2) / view.k - view.y });
  const radius = (n) => 4 + Math.sqrt(n.deg) * 2.6;

  function draw() {
    step();
    ctx.clearRect(0, 0, W, H);
    const vis = visibleSet();
    const hl = new Set();
    const anchor = hover || selected;
    if (anchor) {
      hl.add(anchor.id);
      for (const l of links) { if (l.source === anchor.id) hl.add(l.target); if (l.target === anchor.id) hl.add(l.source); }
    }
    const q = search.trim().toLowerCase();
    // links
    for (const l of links) {
      if (vis && (!vis.has(l.source) || !vis.has(l.target))) continue;
      const a = toScreen(l.s), b = toScreen(l.t);
      const on = anchor && (l.source === anchor.id || l.target === anchor.id);
      ctx.strokeStyle = on ? 'rgba(255,207,90,0.85)' : l.implicit ? 'rgba(120,180,220,0.12)' : 'rgba(120,200,255,0.22)';
      ctx.lineWidth = on ? 1.8 : 1;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    // nodes
    for (const n of nodes) {
      if (vis && !vis.has(n.id)) continue;
      const { sx, sy } = toScreen(n);
      if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50) continue;
      const r = radius(n) * Math.max(0.6, Math.min(1.6, view.k));
      const dim = anchor && !hl.has(n.id);
      const match = q && (n.label.toLowerCase().includes(q) || (n.alt || '').toLowerCase().includes(q));
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = colorOf(n);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      if (n === selected || match) { ctx.strokeStyle = match ? '#ffcf5a' : '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); }
      if (showLabels && (view.k > 0.75 || n.deg > 4 || hl.has(n.id) || match)) {
        ctx.font = `${hl.has(n.id) || match ? 700 : 500} ${Math.round(12 * Math.max(0.85, Math.min(1.4, view.k)))}px Inter, sans-serif`;
        ctx.fillStyle = dim ? 'rgba(220,235,245,0.5)' : '#e6f4ff';
        ctx.textAlign = 'center';
        ctx.fillText(labelOf(n), sx, sy + r + 13);
      }
      ctx.globalAlpha = 1;
    }
    raf = requestAnimationFrame(draw);
  }

  function nodeAt(sx, sy) {
    const vis = visibleSet();
    let best = null, bd = 14;
    for (const n of nodes) {
      if (vis && !vis.has(n.id)) continue;
      const p = toScreen(n);
      const d = Math.hypot(p.sx - sx, p.sy - sy) - radius(n);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    const n = nodeAt(p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
    if (n) { drag = { node: n, moved: false }; alpha = Math.max(alpha, 0.3); }
    else pan = { x: p.x, y: p.y, vx: view.x, vy: view.y };
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (drag) { const w = toWorld(p.x, p.y); drag.node.x = w.x; drag.node.y = w.y; drag.moved = true; alpha = Math.max(alpha, 0.2); }
    else if (pan) { view.x = pan.vx + (p.x - pan.x) / view.k; view.y = pan.vy + (p.y - pan.y) / view.k; }
    else { hover = nodeAt(p.x, p.y); canvas.style.cursor = hover ? 'pointer' : 'grab'; }
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && !drag.moved) { selected = drag.node; onSelect?.(selected); }
    if (pan && !drag) { /* click on background */ }
    drag = null; pan = null;
  });
  canvas.addEventListener('dblclick', (e) => { const p = pos(e); const n = nodeAt(p.x, p.y); if (n) onOpen?.(n); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pos(e);
    const before = toWorld(p.x, p.y);
    view.k = Math.max(0.2, Math.min(4, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    const after = toWorld(p.x, p.y);
    view.x += after.x - before.x; view.y += after.y - before.y;
  }, { passive: false });

  raf = requestAnimationFrame(draw);

  return {
    setData,
    setSearch(q) { search = q; const n = nodes.find((x) => q && x.label.toLowerCase() === q.toLowerCase()); if (n) this.centerOn(n.id); },
    setLabels(v) { showLabels = v; },
    setFocus(id, depth = 1) { focus = id ? { id, depth } : null; alpha = 0.8; },
    get focus() { return focus; },
    select(id) { selected = byId.get(id) || null; if (selected) this.centerOn(id); },
    centerOn(id) { const n = byId.get(id); if (n) { view.x = -n.x; view.y = -n.y; view.k = Math.max(view.k, 1.2); } },
    reheat() { alpha = 1; for (const n of nodes) { n.x += (Math.random() - 0.5) * 50; n.y += (Math.random() - 0.5) * 50; } },
    zoom(f) { view.k = Math.max(0.2, Math.min(4, view.k * f)); },
    fit() { view = { x: 0, y: 0, k: 1 }; },
    settings,
    snapshot() { return canvas.toDataURL('image/png'); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
