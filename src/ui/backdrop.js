// Cinematic background: a cross-fading Ken Burns carousel of maritime photos (Pexels CDN, free licence),
// tinted behind the UI, with a holographic layer on top (wireframe swell, rising light particles),
// a CSS radar sweep, light beams and pointer parallax. Images are requested small and compressed,
// one at a time after first paint; a failed image is simply skipped. Animation pauses when hidden.

export const SLIDES = [
  { id: 15348182, es: 'Portacontenedores en puerto', place: 'Rotterdam · 22:40 LT' },
  { id: 28498830, es: 'Guardia en el puente', place: 'Bridge watch · 04:10 LT' },
  { id: 14777019, es: 'Temporal junto al faro', place: 'Beaufort 8 · 01:15 LT' },
  { id: 32399137, es: 'Terminal de contenedores al anochecer', place: 'Port of Rotterdam · 20:55 LT' },
  { id: 29805443, es: 'Puente de navegación', place: 'Costa española · 11:30 LT' },
  { id: 15556014, es: 'Nubes de tormenta en ruta', place: 'Golfo de Vizcaya · 17:20 LT' },
  { id: 4940270, es: 'Grúas en el muelle', place: 'Atraque nocturno · 23:05 LT' },
  { id: 32846085, es: 'Faro iluminado', place: 'Recalada · 02:30 LT' },
  { id: 20216774, es: 'Operaciones de carga', place: 'Terminal · 09:45 LT' },
  { id: 30705550, es: 'Puerto de carga de noche', place: 'Night port · 00:50 LT' },
];

const url = (id, w) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}`;

export function startBackdrop(host, { interval = 11000 } = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData || /2g/.test(navigator.connection?.effectiveType || '');
  const width = Math.min(1600, Math.round((window.innerWidth || 1280) * Math.min(1.25, window.devicePixelRatio || 1)));
  host.innerHTML = '';
  const layers = [0, 1].map(() => {
    const d = document.createElement('div');
    d.className = 'bd-slide';
    host.appendChild(d);
    return d;
  });
  for (const cls of ['bd-tint', 'bd-glow', 'bd-radar', 'bd-beam']) {
    const d = document.createElement('div');
    d.className = cls;
    host.appendChild(d);
  }
  const holo = document.createElement('canvas');
  holo.className = 'bd-holo';
  host.appendChild(holo);
  for (const cls of ['bd-fog', 'bd-alarm', 'bd-vignette', 'bd-grain']) {
    const d = document.createElement('div');
    d.className = cls;
    host.appendChild(d);
  }
  const stopHolo = reduce ? () => {} : startHolo(holo, host);
  // Pointer parallax (photos move a little, the hologram a little more).
  const onMove = (e) => {
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    host.style.setProperty('--px', x.toFixed(3));
    host.style.setProperty('--py', y.toFixed(3));
  };
  if (!reduce) addEventListener('pointermove', onMove, { passive: true });
  const listeners = new Set();
  const ok = new Map(); // id -> loaded url
  const failed = new Set();
  let front = 0, idx = -1, timer = 0, stopped = false;

  const load = (s) => new Promise((resolve) => {
    if (ok.has(s.id)) return resolve(true);
    if (failed.has(s.id)) return resolve(false);
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    const u = url(s.id, width);
    img.onload = () => { ok.set(s.id, u); resolve(true); };
    img.onerror = () => { failed.add(s.id); resolve(false); };
    img.src = u;
  });

  async function show(next) {
    for (let tries = 0; tries < SLIDES.length; tries++) {
      const n = (next + tries) % SLIDES.length;
      if (await load(SLIDES[n])) {
        if (stopped) return;
        idx = n;
        const back = layers[1 - front];
        back.style.backgroundImage = `url("${ok.get(SLIDES[n].id)}")`;
        back.classList.remove('kb');
        void back.offsetWidth; // restart Ken Burns
        back.classList.add('on', 'kb');
        back.style.setProperty('--kx', `${(Math.random() * 4 - 2).toFixed(2)}%`);
        back.style.setProperty('--ky', `${(Math.random() * 3 - 1.5).toFixed(2)}%`);
        layers[front].classList.remove('on');
        front = 1 - front;
        listeners.forEach((f) => f(SLIDES[n], n));
        load(SLIDES[(n + 1) % SLIDES.length]); // prefetch the next one quietly
        return;
      }
    }
  }

  const tick = () => {
    clearTimeout(timer);
    if (stopped || document.hidden || reduce) return;
    timer = setTimeout(async () => { await show(idx + 1); tick(); }, interval);
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  // First image after first paint so the UI is never blocked by it.
  const kick = () => { if (!saveData) show(Math.floor(Math.random() * 3)).then(tick); };
  if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 1200 }); else setTimeout(kick, 300);

  return {
    setMood({ alarm, fog } = {}) {
      if (alarm != null) host.classList.toggle('alarm', !!alarm);
      if (fog != null) host.classList.toggle('fog', !!fog);
    },
    setVariant(v) { host.dataset.variant = v; }, // 'hero' (clear) | 'app' (dim, more blur) | 'focus' (very dim)
    go(n) { show(n).then(tick); },
    onChange(f) { listeners.add(f); if (idx >= 0) f(SLIDES[idx], idx); return () => listeners.delete(f); },
    get index() { return idx; },
    stop() { stopped = true; clearTimeout(timer); stopHolo(); removeEventListener('pointermove', onMove); },
  };
}

// Holographic layer: perspective wireframe swell scrolling towards the viewer + drifting light motes.
function startHolo(canvas, host) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, raf = 0, last = 0, t0 = performance.now();
  const motes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, v: 0.004 + Math.random() * 0.012, p: Math.random() * 6.28, hue: Math.random() < 0.8 ? 192 : 42 }));
  const resize = () => {
    W = canvas.width = Math.round(innerWidth * 0.75);
    H = canvas.height = Math.round(innerHeight * 0.75);
  };
  addEventListener('resize', resize);
  resize();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || now - last < 33) return; // ~30 fps
    last = now;
    const t = (now - t0) / 1000;
    const variant = host.dataset.variant;
    const alarm = host.classList.contains('alarm');
    const k = variant === 'hero' ? 1 : variant === 'app' ? 0.75 : 0.5;
    ctx.clearRect(0, 0, W, H);
    // --- wireframe swell (rows recede to the horizon, scrolling towards the viewer)
    const hz = H * 0.58, rows = 26, cols = 46;
    const col = alarm ? '255,90,110' : '90,215,255';
    ctx.lineWidth = 1;
    for (let i = 0; i < rows; i++) {
      const z = ((i + (t * 0.55) % 1) / rows); // 0 far .. 1 near
      const zz = z * z;
      const y0 = hz + zz * (H - hz) * 1.05;
      const amp = 2 + zz * 26;
      ctx.strokeStyle = `rgba(${col},${(0.04 + zz * 0.32) * k})`;
      ctx.beginPath();
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const x = W / 2 + (u - 0.5) * W * (0.5 + zz * 2.6);
        const y = y0 + Math.sin(u * 9 + t * 0.9 + i * 0.5) * amp * 0.5 + Math.sin(u * 23 - t * 1.4) * amp * 0.18;
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // converging meridians
    ctx.strokeStyle = `rgba(${col},${0.07 * k})`;
    ctx.beginPath();
    for (let j = -12; j <= 12; j++) {
      ctx.moveTo(W / 2 + j * W * 0.012, hz);
      ctx.lineTo(W / 2 + j * W * 0.16, H * 1.05);
    }
    ctx.stroke();
    // horizon glow line
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},${0.55 * k})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, hz - 1, W, 2);
    // --- light motes rising
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.y -= m.v / 30;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      const x = (m.x + Math.sin(t * 0.3 + m.p) * 0.01) * W, y = m.y * H;
      const a = (0.25 + 0.35 * Math.sin(t * 1.5 + m.p) ** 2) * k;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, m.r * 4);
      rg.addColorStop(0, `hsla(${alarm ? 355 : m.hue},100%,75%,${a})`);
      rg.addColorStop(1, `hsla(${alarm ? 355 : m.hue},100%,60%,0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(x - m.r * 4, y - m.r * 4, m.r * 8, m.r * 8);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
}
