// After-action review ("VDR replay"): scrub the whole session — radar, communications,
// alarms — with reaction metrics, structure heatmap and key moments. Also replays an
// exported VDR JSON file (offline / research sharing).
import { h, mount, icon, toast } from '../core/dom.js';
import { go } from '../core/store.js';
import { db } from '../backend/index.js';
import { createRadar } from '../sim/radar.js';
import { messageEl, fmtReaction } from '../lab/widgets.js';
import { reactionMetrics, exportSession, EXPORT_FORMATS } from '../export/report.js';
import { participantStats, analyze } from '../ai/analyzer.js';
import { structureById, STRUCTURES } from '../data/smcp.js';
import { roleById, careerById } from '../data/careers.js';
import { scenarioById } from '../data/scenarios.js';
import { SEVERITY } from '../data/events.js';
import { hhmm, fmtDuration, readFileAsText, fmtDate } from '../core/util.js';
import { shipClock } from '../sim/engine.js';
import { sfx } from '../core/audio.js';

export default async function render(root, { path, user }) {
  const id = path[1];
  if (!id || id === 'import') return importView(root, user);
  const api = db();
  mount(root, h('div.page', h('div.empty', h('div.sonar', { style: { margin: '0 auto' } }), h('p', 'Cargando la caja negra…'))));
  const [lab, crew, comms, events, track] = await Promise.all([api.getLab(id), api.getCrew(id), api.getComms(id), api.getEvents(id), api.getTrack?.(id) || []]);
  if (!lab) { mount(root, h('div.page', h('div.panel.empty', h('h3', 'Sesión no encontrada')))); return; }
  return replay(root, { lab, crew, comms, events, track: track || [] }, user);
}

function importView(root, user) {
  const inp = h('input', { type: 'file', accept: '.json' });
  mount(root, h('div.page', h('div.panel', h('h2', 'Reproducir una caja negra (VDR)'), h('p.muted', 'Abre un archivo JSON exportado desde la consola docente para revisarlo sin conexión o compartirlo con otros docentes e investigadores.'), inp,
    h('button.btn.primary', { style: { marginTop: '12px' }, onclick: async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const d = JSON.parse(await readFileAsText(f));
        if (d.format !== 'mesim-vdr') throw new Error('No es un archivo VDR del simulador');
        replay(root, { lab: d.lab, crew: d.crew || [], comms: d.comms || [], events: d.events || [], track: d.track || [] }, user);
      } catch (e) { toast(e.message, 'error'); }
    } }, icon('play'), 'Reproducir'))));
}

function replay(root, data, user) {
  const { lab, crew, comms, events, track } = data;
  const isT = user.role === 'teacher';
  const visibleComms = comms.filter((m) => m.kind !== 'whisper' || isT).filter((m) => m.kind !== 'log' || isT || m.fromUid === user.uid);
  const t0 = lab.startedAt || lab.createdAt || (comms[0]?.ts ?? Date.now());
  const t1 = Math.max(lab.endedAt || 0, comms[comms.length - 1]?.ts || 0, track[track.length - 1]?.t || 0, t0 + 60000);
  let T = t1; // open on the final picture; Play restarts from the beginning
  let playing = false;
  let speed = 8;
  let raf = 0;
  let lastFrame = 0;

  const replayLab = () => {
    let s = null;
    for (const x of track) { if (x.t <= T) s = x; else break; }
    if (!s) s = track[0];
    if (!s) return { ...lab, simStart: lab.simStart || t0 };
    return {
      ...lab,
      world: s.world || lab.world,
      ownShip: { ...lab.ownShip, x: s.own.x, y: s.own.y, course: s.own.course, speed: s.own.speed, list: s.own.list, setAt: s.t },
      targets: s.targets.map((tg) => ({ ...tg, setAt: s.t })),
    };
  };

  const canvas = h('canvas');
  const radar = createRadar(canvas, { mode: 'shore', getLab: replayLab, getTime: () => T });
  const clockEl = h('span.timer');
  const scrub = h('input', { type: 'range', min: t0, max: t1, step: 1000, value: t0, style: { width: '100%' }, oninput: (e) => { T = +e.target.value; update(true); } });
  const ticks = h('div', { style: { position: 'relative', height: '16px', marginTop: '-4px' } },
    events.map((e) => h('span', { title: `${hhmm(new Date(e.ts))} ${e.titleEs}`, style: { position: 'absolute', left: `${((e.ts - t0) / (t1 - t0)) * 100}%`, top: 0, width: '4px', height: '14px', borderRadius: '2px', background: SEVERITY[e.severity]?.color || 'var(--accent)', cursor: 'pointer' }, onclick: () => { T = e.ts; update(true); } })));
  const playBtn = h('button.btn.primary', { onclick: () => { if (!playing && T >= t1) T = t0; playing = !playing; playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), playing ? 'Pausa' : 'Reproducir'); if (playing) { lastFrame = performance.now(); loop(); } } }, icon('play'), 'Reproducir');
  const speedSel = h('select', { style: { maxWidth: '110px' }, onchange: (e) => (speed = +e.target.value) }, [1, 4, 8, 16, 60].map((s) => h('option', { value: s, selected: s === speed }, `×${s}`)));
  const commsBox = h('div.comms', { style: { maxHeight: '58vh' } });
  const activeBox = h('div');

  function loop(now = performance.now()) {
    if (!playing) return;
    const dt = now - lastFrame;
    lastFrame = now;
    T = Math.min(t1, T + dt * speed);
    update(false);
    if (T >= t1) { playing = false; playBtn.replaceChildren(icon('play'), 'Reproducir'); return; }
    raf = requestAnimationFrame(loop);
  }

  let lastCount = -1;
  function update(force) {
    scrub.value = T;
    clockEl.textContent = `${shipClock({ ...lab, simStart: lab.simStart || t0 }, T)} · +${fmtDuration(T - t0)}`;
    const shown = visibleComms.filter((m) => m.ts <= T);
    if (shown.length !== lastCount || force) {
      if (shown.length > lastCount && !force && shown[shown.length - 1]?.kind !== 'system') sfx.radioIn();
      lastCount = shown.length;
      mount(commsBox, shown.slice(-80).map((m) => messageEl(m, { viewer: isT ? 'teacher' : user.uid })));
      commsBox.scrollTop = commsBox.scrollHeight;
      const act = events.filter((e) => e.ts <= T && (!e.resolvedAt || e.resolvedAt > T));
      mount(activeBox, act.length ? act.map((e) => h('div.alarm-banner.' + e.severity, { style: { marginBottom: '6px', padding: '8px 12px' } }, icon('alarm'), h('div', h('b', e.titleEs), h('div.small', e.situation)))) : h('p.small', 'Sin alarmas activas en este instante.'));
    }
  }

  // ---------- analytics ----------
  const people = crew.filter((c) => isT || c.uid === user.uid);
  const msgsOf = (uid) => comms.filter((m) => m.fromUid === uid && ['radio', 'intercom', 'log'].includes(m.kind));
  const reactions = reactionMetrics(events, comms, people);

  const usage = people.map((c) => {
    const counts = {};
    for (const m of msgsOf(c.uid)) for (const [k, v] of Object.entries((m.analysis || analyze(m.text)).structures || {})) counts[k] = (counts[k] || 0) + v.length;
    return { c, counts };
  });
  const usedIds = STRUCTURES.map((s) => s.id).filter((id) => usage.some((u) => u.counts[id]));
  const maxCell = Math.max(1, ...usage.flatMap((u) => usedIds.map((id) => u.counts[id] || 0)));
  const heat = usedIds.length ? h('div', { style: { overflowX: 'auto' } }, h('table', h('thead', h('tr', h('th', 'Estudiante'), usedIds.map((id) => h('th', { title: structureById(id)?.es, style: { writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '150px', fontSize: '.68rem' } }, structureById(id)?.es.split(' (')[0])))),
    h('tbody', usage.map((u) => h('tr', h('td', h('b', u.c.name)), usedIds.map((id) => {
      const v = u.counts[id] || 0;
      return h('td.mono', { title: `${u.c.name} · ${structureById(id)?.es}: ${v}`, style: { textAlign: 'center', background: v ? `rgba(57,208,255,${0.12 + (0.7 * v) / maxCell})` : 'transparent', color: 'var(--text)' } }, v || '');
    })))))) : h('p.muted', 'Sin transmisiones analizadas.');

  // key moments
  const moments = [];
  for (const r of reactions) {
    const first = r.rows.filter((x) => x.firstMsgMs != null).sort((a, b) => a.firstMsgMs - b.firstMsgMs)[0];
    moments.push({ t: r.event.ts, text: `${r.event.titleEs}: ${first ? `primera respuesta de ${first.name} en ${fmtDuration(first.firstMsgMs)}` : 'nadie transmitió después'}`, sev: r.event.severity });
  }
  const tx = comms.filter((m) => ['radio', 'intercom'].includes(m.kind));
  for (let k = 1; k < tx.length; k++) if (tx[k].ts - tx[k - 1].ts > 4 * 60000) moments.push({ t: tx[k - 1].ts, text: `Silencio de radio de ${fmtDuration(tx[k].ts - tx[k - 1].ts)}`, sev: 'routine' });
  for (const m of comms.filter((x) => /\b(mayday|pan[- ]?pan)\b/i.test(x.text) && x.kind !== 'npc' && x.kind !== 'system')) moments.push({ t: m.ts, text: `${m.fromName || m.from} transmite ${/mayday/i.test(m.text) ? 'MAYDAY' : 'PAN-PAN'}`, sev: 'distress' });
  moments.sort((a, b) => a.t - b.t);

  mount(root, h('div.page',
    h('div.page-head',
      h('div', h('span.eyebrow', 'Debriefing · Voyage Data Recorder'), h('h2', lab.title || 'Sesión'), h('p', `${scenarioById(lab.scenarioId).en} · ${fmtDate(t0)} · ${crew.length} participantes · ${comms.filter((m) => ['radio', 'intercom'].includes(m.kind)).length} transmisiones · ${events.length} incidentes`)),
      h('div.row', EXPORT_FORMATS.filter((f) => isT || f.id !== 'json').map((f) => h('button.btn.small', { onclick: () => exportSession(f.id, isT ? data : { ...data, focusUid: user.uid }) }, f.label.split(' (')[0])))),
    h('div.panel', { style: { marginBottom: '14px' } },
      h('div.row', playBtn, speedSel, clockEl, h('span.grow'), h('span.small', track.length ? `${track.length} muestras de trayectoria` : 'Sin trayectoria registrada: el radar muestra la situación final.')),
      h('div', { style: { marginTop: '10px' } }, scrub, ticks)),
    h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', alignItems: 'start' } },
      h('div.col', h('div.panel', h('div.radar-wrap', { style: { width: 'min(100%, 60vh)' } }, canvas)), h('div.panel', h('h4', 'Alarmas en este instante'), activeBox)),
      h('div.panel', h('h4', icon('radio'), 'Comunicaciones'), commsBox)),
    h('div.grid.g2', { style: { marginTop: '14px' } },
      h('div.panel', h('h4', icon('clock'), 'Momentos clave'),
        moments.length ? moments.map((m) => h('div.active-ev', { style: { cursor: 'pointer' }, onclick: () => { T = m.t; update(true); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
          h('div', h('span.badge.sev-' + m.sev, hhmm(new Date(m.t))), ' ', m.text), icon('play'))) : h('p.muted', 'Nada destacable.')),
      h('div.panel', h('h4', icon('bolt'), 'Tiempos de reacción ante alarmas'),
        reactions.length ? h('table', h('thead', h('tr', h('th', 'Incidente'), h('th', 'Persona'), h('th', 'ACK'), h('th', '1ª transmisión'))),
          h('tbody', reactions.flatMap((r) => r.rows.map((x, k) => h('tr', h('td', k === 0 ? r.event.titleEs : ''), h('td', `${x.name} · ${roleById(x.roleId)?.en || ''}`), h('td.mono', fmtReaction(x.ackMs)), h('td.mono', fmtReaction(x.firstMsgMs))))))) : h('p.muted', 'Sin incidentes.'))),
    h('div.panel', { style: { marginTop: '14px' } }, h('h4', icon('graph'), 'Mapa de estructuras usadas (por persona)'), h('p.small', 'Cuanto más intensa la celda, más veces se usó la estructura. Útil para ver qué se practica y qué falta.'), heat),
    h('div.panel', { style: { marginTop: '14px' } }, h('h4', icon('users'), 'Resumen por participante'),
      h('table', h('thead', h('tr', ['Persona', 'Titulación', 'Rol', 'Mensajes', 'Palabras', 'Voz', 'Marcadores', 'Variedad', 'SMCP'].map((x) => h('th', x)))),
        h('tbody', people.map((c) => { const s = participantStats(msgsOf(c.uid)); return h('tr', h('td', h('b', c.name)), h('td', careerById(c.careerId)?.short || ''), h('td', roleById(c.roleId)?.en || ''), h('td.mono', s.messages), h('td.mono', s.words), h('td.mono', s.spoken), h('td.mono', s.markers), h('td.mono', s.variety), h('td.mono', s.smcpAccuracy != null ? s.smcpAccuracy + '%' : '—')); })))),
    h('div.row', { style: { marginTop: '14px' } }, h('button.btn', { onclick: () => go(isT ? 'control/' + lab.id : 'portfolio') }, 'Volver'), isT ? h('button.btn.ghost', { onclick: () => go('debrief/import') }, icon('upload'), 'Abrir otro VDR') : null)));
  update(true);
  return () => { playing = false; cancelAnimationFrame(raf); radar.destroy(); };
}
