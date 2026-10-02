// Animated background: night sea with parallax swell, a container ship under way,
// lighthouse beam, stars and a faint sonar grid. Pure canvas, ~30 fps, pauses when hidden.

export function startOcean(canvas, { intensity = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0;
  let mood = { sea: 3, fog: 0, storm: 0, alarm: 0 };
  const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.3 + 0.2, p: Math.random() * 6 }));
  const spray = Array.from({ length: 40 }, () => ({ x: Math.random(), y: 0, v: 0, life: 0 }));

  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const horizon = () => H * 0.62;
  function waveY(x, t, layer) {
    const amp = (6 + mood.sea * 3.2) * (0.5 + layer * 0.35);
    const k = 0.006 / (0.6 + layer * 0.4);
    return horizon() + layer * H * 0.08 +
      Math.sin(x * k + t * (0.6 + layer * 0.25)) * amp +
      Math.sin(x * k * 2.3 - t * 0.9) * amp * 0.35 +
      Math.sin(x * k * 0.45 + t * 0.3) * amp * 0.6;
  }

  function drawShip(t) {
    const x = ((t * 14) % (W + 600)) - 300;
    const baseY = waveY(x, t, 1);
    const tilt = (waveY(x + 40, t, 1) - waveY(x - 40, t, 1)) / 80;
    ctx.save();
    ctx.translate(x, baseY - 6);
    ctx.rotate(Math.atan(tilt) * 0.7);
    const s = Math.max(0.6, Math.min(1.25, W / 1400));
    ctx.scale(s, s);
    // hull
    ctx.fillStyle = '#071526';
    ctx.beginPath();
    ctx.moveTo(-170, -6); ctx.lineTo(170, -6); ctx.lineTo(200, -26); ctx.lineTo(160, 18); ctx.lineTo(-160, 18); ctx.lineTo(-175, 2); ctx.closePath(); ctx.fill();
    // containers
    const cols = ['#0d2a44', '#12385a', '#0b2238', '#163f62'];
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
      ctx.fillStyle = cols[(i + j) % 4];
      ctx.fillRect(-120 + i * 26, -26 - j * 12, 24, 11);
    }
    // superstructure (aft)
    ctx.fillStyle = '#0a1d33';
    ctx.fillRect(-165, -62, 34, 56);
    ctx.fillRect(-170, -70, 44, 10);
    ctx.fillStyle = 'rgba(255,220,140,0.85)';
    for (let i = 0; i < 4; i++) ctx.fillRect(-161 + i * 8, -55, 4, 3);
    // mast + nav lights
    ctx.fillStyle = '#0a1d33'; ctx.fillRect(-150, -92, 3, 24);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-148.5, -94, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(-170, -64, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#35ff7a'; ctx.beginPath(); ctx.arc(-126, -64, 2, 0, 7); ctx.fill();
    // radar scanner rotating
    const r = Math.sin(t * 4) * 9;
    ctx.fillStyle = '#9fd7ff'; ctx.fillRect(-152 - r / 2, -76, r, 2);
    // wake
    ctx.strokeStyle = 'rgba(180,230,255,0.18)'; ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-175 - i * 40, 14 + i * 1.5); ctx.lineTo(-175 - i * 40 - 30, 14 + i * 2); ctx.stroke(); }
    ctx.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    last = now;
    const t = now / 1000;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon());
    sky.addColorStop(0, '#020812');
    sky.addColorStop(0.7, mood.storm ? '#0b1a2a' : '#061a33');
    sky.addColorStop(1, mood.alarm ? '#3a0e1a' : '#0b2c4d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // stars
    if (!mood.fog) for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.p);
      ctx.fillStyle = '#cfe9ff';
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // moon
    ctx.fillStyle = 'rgba(220,240,255,0.85)';
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.16, 26, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(160,210,255,0.06)';
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.16, 90, 0, 7); ctx.fill();
    // lighthouse beam
    const lx = W * 0.08, ly = horizon() - 40;
    const ang = (t * 0.6) % (Math.PI * 2);
    if (Math.cos(ang) > -0.2) {
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, W * 0.7);
      g.addColorStop(0, 'rgba(255,240,190,0.22)');
      g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(lx, ly);
      ctx.arc(lx, ly, W * 0.7, -0.06 + Math.sin(ang) * 0.35, 0.06 + Math.sin(ang) * 0.35); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#081627'; ctx.fillRect(lx - 6, ly, 12, 40);
    ctx.fillStyle = 'rgba(255,240,190,0.9)'; ctx.fillRect(lx - 4, ly - 6, 8, 6);

    // back swell + ship + front swell
    for (let layer = 0; layer < 3; layer++) {
      if (layer === 1) drawShip(t);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 14) ctx.lineTo(x, waveY(x, t, layer));
      ctx.lineTo(W, H); ctx.closePath();
      const g = ctx.createLinearGradient(0, horizon(), 0, H);
      const a = [0.95, 0.9, 0.96][layer];
      g.addColorStop(0, `rgba(${[8, 6, 4][layer]},${[38, 30, 22][layer]},${[64, 54, 44][layer]},${a})`);
      g.addColorStop(1, `rgba(2,10,20,${a})`);
      ctx.fillStyle = g; ctx.fill();
      // crest highlights
      ctx.strokeStyle = `rgba(120,210,255,${0.06 + layer * 0.03})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 14) { const y = waveY(x, t, layer); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // spray in heavy seas
    if (mood.sea >= 5) for (const p of spray) {
      if (p.life <= 0) { p.x = Math.random() * W; p.y = waveY(p.x, t, 2); p.v = -2 - Math.random() * 3; p.life = 30; }
      p.y += p.v; p.v += 0.18; p.life--;
      ctx.fillStyle = 'rgba(200,235,255,0.35)'; ctx.fillRect(p.x, p.y, 2, 2);
    }
    // sonar rings (bottom-right)
    ctx.strokeStyle = 'rgba(57,208,255,0.07)';
    for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.arc(W * 0.9, H * 0.95, i * 70 + ((t * 30) % 70), 0, 7); ctx.stroke(); }
    // fog veil
    if (mood.fog) { ctx.fillStyle = `rgba(150,170,185,${0.25 * mood.fog})`; ctx.fillRect(0, 0, W, H); }
    if (mood.alarm) { ctx.fillStyle = `rgba(255,30,50,${0.06 + 0.05 * Math.sin(t * 6)})`; ctx.fillRect(0, 0, W, H); }
  }

  function onVis() { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', onVis);
  if (reduce) { frame(0); cancelAnimationFrame(raf); } else raf = requestAnimationFrame(frame);

  return {
    setMood(m) { mood = { ...mood, ...m }; },
    stop() { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); },
  };
}
