// Teacher console: full live control of a Communication Lab session.
import { h, mount, icon, toast, modal, field, select, confirmDialog, tabs } from '../core/dom.js';
import { go } from '../core/store.js';
import { db } from '../backend/index.js';
import { createSession } from '../lab/session.js';
import { messageEl, goalsPanel, tasksPanel, enginePanel, targetCard, fmtReaction, reactionTime } from '../lab/widgets.js';
import { createRadar } from '../sim/radar.js';
import { picture, reanchor, targetFromSpec, initialState, shipClock } from '../sim/engine.js';
import { fireEvent, resolveEvent, createDirector, eventsForScenario, npcName } from '../sim/director.js';
import { EVENTS, SEVERITY, CATEGORIES, eventById, rolesTouched, fill } from '../data/events.js';
import { STRUCTURES, structureById, CHANNELS } from '../data/smcp.js';
import { ROLES, CAREERS, STATIONS, roleById, careerById } from '../data/careers.js';
import { scenarioById } from '../data/scenarios.js';
import { PERSONAS, stationName } from '../ai/npc.js';
import { npcReply, PROVIDER_LABEL } from '../ai/ai.js';
import { participantStats } from '../ai/analyzer.js';
import { initials, hhmm, fmtDuration, uid as makeId, debounce } from '../core/util.js';
import { sfx, startAlarm, stopAllAlarms } from '../core/audio.js';
import { speak } from '../core/speech.js';
import { exportSession, EXPORT_FORMATS, buildSessionReport } from '../export/report.js';
import { ALARM_PATTERNS } from '../core/audio.js';
import { PRESET_GOALS } from './lab-hub.js';

export const RUBRIC = [
  { id: 'procedure', es: 'Procedimiento radio / SMCP', d: ['Sin estructura de llamada', 'Llamada incompleta', 'Llamada correcta con algún fallo', 'Procedimiento impecable'] },
  { id: 'accuracy', es: 'Precisión (datos, unidades, gramática)', d: ['Errores impiden la comprensión', 'Errores frecuentes', 'Errores menores', 'Preciso y claro'] },
  { id: 'fluency', es: 'Fluidez y pronunciación', d: ['Muy titubeante', 'Pausas frecuentes', 'Fluido con alguna duda', 'Fluido e inteligible'] },
  { id: 'interaction', es: 'Interacción y reparación', d: ['No reacciona', 'Reacciona tarde', 'Pide/da aclaraciones', 'Gestiona la comunicación'] },
  { id: 'task', es: 'Cumplimiento de la tarea del rol', d: ['No cumple', 'Parcial', 'Cumple', 'Cumple con iniciativa'] },
];

export default async function render(root, { path, user }) {
  const labId = path[1];
  if (user.role !== 'teacher') { go('lab/' + labId); return; }
  const api = db();
  const session = createSession(labId, user, { isHost: true });
  const st = session.state;
  await session.ready();
  if (!st.lab) { mount(root, h('div.page', h('div.panel.empty', h('h3', 'Sesión no encontrada'), h('button.btn', { onclick: () => go('lab') }, 'Volver')))); return () => session.destroy(); }

  const director = createDirector(() => st.lab, { uid: user.uid, name: user.name, role: 'Instructor' });
  let tab = 'live';
  let selUid = null;
  let liveFilter = { channel: 'all', uid: 'all' };
  let radar = null;

  // ---------- skeleton ----------
  const leftS = h('div.stack');
  const centre = h('div.panel', { style: { display: 'flex', flexDirection: 'column', minHeight: 0 } });
  const rightS = h('div.stack.right');
  mount(root, h('div.page.full', h('div.tconsole', leftS, centre, rightS)));

  // ---------- LEFT: session + roster + pulse ----------
  const sessionCard = h('div.panel');
  const rosterCard = h('div.panel', { style: { flex: 1, overflow: 'auto', minHeight: 0 } });
  const pulseCard = h('div.panel');
  leftS.append(sessionCard, rosterCard, pulseCard);

  function drawSession() {
    const lab = st.lab;
    const elapsed = lab.startedAt ? (lab.endedAt || Date.now()) - lab.startedAt : 0;
    const url = `${location.origin}${location.pathname}#/lab/${lab.id}`;
    mount(sessionCard,
      h('div.row.between', h('span.eyebrow', 'Código de embarque'), h('span.badge.sev-' + ({ running: 'safety', paused: 'urgency', briefing: 'routine', ended: 'routine' }[lab.status] || 'routine'), { briefing: 'BRIEFING', running: 'EN CURSO', paused: 'PAUSA', ended: 'FINALIZADA', archived: 'ARCHIVADA' }[lab.status] || lab.status)),
      h('div.big-code', { title: url, onclick: () => { navigator.clipboard?.writeText(url); toast('Enlace copiado', 'success'); } }, lab.code),
      h('div.small', lab.title, ' · ', scenarioById(lab.scenarioId).area),
      h('div.row', { style: { marginTop: '10px' } },
        h('span.mono', { style: { color: 'var(--gold)', fontSize: '1.3rem' } }, shipClock(lab)),
        h('span.small', 'Transcurrido ' + fmtDuration(elapsed))),
      h('div.row', { style: { marginTop: '10px', gap: '6px' } },
        lab.status === 'briefing' || lab.status === 'paused'
          ? h('button.btn.success', { onclick: () => setStatus(lab.status === 'briefing' ? 'start' : 'resume') }, icon('play'), lab.status === 'briefing' ? 'Comenzar' : 'Reanudar')
          : null,
        lab.status === 'running' ? h('button.btn.warn', { onclick: () => setStatus('pause') }, icon('pause'), 'Pausa') : null,
        lab.status !== 'ended' ? h('button.btn.danger', { onclick: () => setStatus('end') }, icon('stop'), 'Finalizar') : h('button.btn', { onclick: () => go('debrief/' + lab.id) }, icon('log'), 'Debriefing'),
        h('button.btn.ghost.small', { onclick: () => window.open(url + '?join=1', '_blank') }, icon('eye'), 'Abrir como alumno')));
  }

  async function setStatus(action) {
    const lab = st.lab;
    if (action === 'start') {
      // re-anchor ship and traffic so the simulation starts "now"
      const fresh = initialState(scenarioById(lab.scenarioId), lab.id);
      await api.updateLab(lab.id, { status: 'running', startedAt: Date.now(), simStart: Date.now(), ownShip: { ...fresh.ownShip, ...pickOwn(lab.ownShip) }, targets: lab.targets?.map((t) => ({ ...t, setAt: Date.now() })) });
      await systemMsg('▶ Sesión iniciada. Todos los puestos: comprobación de radio en el canal 16.');
      sfx.bell(4);
    } else if (action === 'pause') {
      // freeze movement by zeroing speeds? keep simple: mark paused, re-anchor so positions persist
      await api.updateLab(lab.id, { status: 'paused', ownShip: reanchor(lab.ownShip), pausedSpeeds: { own: lab.ownShip.speed, targets: (lab.targets || []).map((t) => t.speed) } });
      await api.updateLab(lab.id, { ownShip: { ...reanchor(lab.ownShip), speed: 0 }, targets: (lab.targets || []).map((t) => ({ ...reanchor(t), speed: 0 })) });
      await systemMsg('⏸ Ejercicio en pausa. Mantened la escucha.');
    } else if (action === 'resume') {
      const ps = lab.pausedSpeeds || {};
      await api.updateLab(lab.id, { status: 'running', ownShip: { ...reanchor(lab.ownShip), speed: ps.own ?? lab.ownShip.speed }, targets: (lab.targets || []).map((t, i) => ({ ...reanchor(t), speed: ps.targets?.[i] ?? t.speed })) });
      await systemMsg('▶ Se reanuda el ejercicio.');
    } else if (action === 'end') {
      if (!(await confirmDialog('Finalizar sesión', 'Se detendrán las alarmas y los eventos aleatorios. Podrás revisar todo en el debriefing.', 'Finalizar'))) return;
      await api.updateLab(lab.id, { status: 'ended', endedAt: Date.now(), random: { ...(lab.random || {}), enabled: false } });
      await systemMsg('■ Fin del ejercicio. Guardad vuestro trabajo en el portafolio. Gracias, tripulación.');
      sfx.bell(8);
    }
  }
  const pickOwn = (o) => ({ course: o.course, speed: o.speed });
  const systemMsg = (text) => api.sendComm(labId, { kind: 'system', channel: 'SYS', from: 'INSTRUCTOR', fromUid: 'system', text });

  function memberStats(c) {
    const msgs = st.comms.filter((m) => m.fromUid === c.uid && ['radio', 'intercom', 'log'].includes(m.kind));
    return { msgs, s: participantStats(msgs) };
  }

  function drawRoster() {
    const crew = [...st.crew].sort((a, b) => (session.online(b) - session.online(a)) || a.name.localeCompare(b.name));
    mount(rosterCard,
      h('div.panel-head', h('h4', icon('users'), `Tripulación (${crew.filter(session.online).length}/${crew.length})`)),
      crew.length ? crew.map((c) => {
        const { s } = memberStats(c);
        const r = roleById(c.roleId);
        const car = careerById(c.careerId);
        const goals = st.lab.goals?.length ? goalsDone(c) : null;
        return h('div.crew-row' + (selUid === c.uid ? '.sel' : ''), { onclick: () => { selUid = c.uid; drawRoster(); drawRight(); } },
          h('div.avatar.sm', { style: { background: car?.color } }, initials(c.name)),
          h('div', h('div.name', c.name), h('span.role', r ? `${r.en} · ${STATIONS[r.station].es}` : '—'),
            h('div.mini', h('span', `✉ ${s.messages}`), h('span', `🎙 ${s.spoken}`), goals ? h('span', `🎯 ${goals}`) : null, s.warnings ? h('span', { style: { color: 'var(--c-warn)' } }, `⚠ ${s.warnings}`) : null)),
          h('span.dot' + (session.online(c) ? '.on' : '.off'), { title: session.online(c) ? 'En línea' : 'Desconectado' }));
      }) : h('p.muted', 'Esperando tripulación… Comparte el código.'));
  }
  function goalsDone(c) {
    const msgs = st.comms.filter((m) => m.fromUid === c.uid);
    let ok = 0;
    for (const g of st.lab.goals) {
      const n = msgs.reduce((acc, m) => acc + ((m.analysis?.structures || {})[g.id]?.length || 0), 0);
      if (n >= g.count) ok++;
    }
    return `${ok}/${st.lab.goals.length}`;
  }

  function drawPulse() {
    const now = Date.now();
    const buckets = Array.from({ length: 20 }, (_, i) => st.comms.filter((m) => ['radio', 'intercom'].includes(m.kind) && m.ts > now - (20 - i) * 60000 && m.ts <= now - (19 - i) * 60000).length);
    const max = Math.max(1, ...buckets);
    const spoken = st.comms.filter((m) => m.spoken).length;
    const total = st.comms.filter((m) => ['radio', 'intercom'].includes(m.kind)).length;
    mount(pulseCard, h('div.panel-head', h('h4', icon('bolt'), 'Pulso de la clase')),
      h('div.pulse-strip', buckets.map((b) => h('i', { style: { height: `${(b / max) * 100}%` }, title: `${b} mensajes` }))),
      h('div.row.between.small', h('span', 'últimos 20 min'), h('span', `${total} transmisiones · ${total ? Math.round((spoken / total) * 100) : 0}% por voz`)));
  }

  // ---------- CENTRE: tabs ----------
  const tabBar = h('div');
  const body = h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', marginTop: '12px' } });
  centre.append(tabBar, body);
  const TABS = [
    { id: 'live', label: 'En directo', icon: 'radio' },
    { id: 'radar', label: 'Radar maestro', icon: 'radar' },
    { id: 'events', label: 'Eventos y alarmas', icon: 'alarm' },
    { id: 'world', label: 'Situación', icon: 'sliders' },
    { id: 'brief', label: 'Tarea y objetivos', icon: 'target' },
    { id: 'ai', label: 'IA', icon: 'sparkle' },
    { id: 'assess', label: 'Evaluación', icon: 'trophy' },
    { id: 'export', label: 'Exportar', icon: 'download' },
  ];
  function drawTabs() {
    const pending = st.comms.filter((m) => m.needsReply && !m.replied).length;
    mount(tabBar, tabs(TABS.map((t) => ({ ...t, badge: t.id === 'live' && pending ? pending : t.id === 'events' ? st.events.filter((e) => e.status === 'active').length || null : null })), tab, (id) => { tab = id; sfx.tick(); drawTabs(); drawBody(); }));
  }
  function drawBody() {
    radar?.destroy();
    radar = null;
    ({ live: drawLive, radar: drawRadar, events: drawEvents, world: drawWorld, brief: drawBrief, ai: drawAI, assess: drawAssess, export: drawExport })[tab]();
  }

  // ----- LIVE
  let liveList = null;
  function drawLive() {
    const chanSel = select([{ value: 'all', label: 'Todos los canales' }, ...CHANNELS.map((c) => ({ value: c.id, label: c.label })), { value: 'LOG', label: 'Diarios' }, { value: 'SYS', label: 'Sistema' }], liveFilter.channel, (v) => { liveFilter.channel = v; drawLiveList(); }, { style: { maxWidth: '200px' } });
    const whoSel = select([{ value: 'all', label: 'Todas las personas' }, ...st.crew.map((c) => ({ value: c.uid, label: c.name })), { value: 'npc', label: 'Estaciones IA' }], liveFilter.uid, (v) => { liveFilter.uid = v; drawLiveList(); }, { style: { maxWidth: '220px' } });
    liveList = h('div.comms', { style: { minHeight: '320px', maxHeight: 'calc(100vh - 470px)' } });
    // speak-as composer
    const personaOpts = [{ value: 'instructor', label: 'Instructor (mensaje a todos)' },
      ...['vts', 'mrcc', 'port', 'pilot', 'agent', 'tug', 'engine', 'master', 'company'].map((k) => ({ value: k, label: `${PERSONAS[k].label}: ${stationName(st.lab, k)}` })),
      ...(st.lab.targets || []).map((t) => ({ value: 'vessel:' + t.id, label: `Buque: ${t.name}` }))];
    let as = 'vts';
    let ch = 'VTS';
    const ta = h('textarea', { rows: 2, placeholder: 'Habla como cualquier estación… (Enter para transmitir)' });
    const send = async () => {
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      if (as === 'instructor') await systemMsg('📣 ' + text);
      else await session.postNpc(as, { text, provider: 'teacher', model: user.name }, { channel: ch });
      sfx.radioOut();
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const pending = st.comms.filter((m) => m.needsReply && !m.replied);
    mount(body,
      pending.length ? h('div.panel', { style: { marginBottom: '12px', borderLeft: '4px solid var(--gold)' } },
        h('h4', `Respuestas pendientes (${st.lab.ai?.mode === 'approve' ? 'aprobar borrador IA' : 'modo manual'})`),
        pending.map((m) => pendingItem(m))) : null,
      h('div.row', chanSel, whoSel, h('span.grow'), h('span.small', 'Las transmisiones del alumnado muestran el análisis automático.')),
      liveList,
      h('div.panel', { style: { marginTop: '12px', padding: '12px' } },
        h('div.row', h('b', 'Hablar como'), select(personaOpts, as, (v) => { as = v; }, { style: { maxWidth: '300px' } }),
          h('span', 'en'), select(CHANNELS.map((c) => ({ value: c.id, label: c.label })), ch, (v) => { ch = v; }, { style: { maxWidth: '150px' } })),
        h('div.composer', { style: { marginTop: '8px' } }, ta, h('button.btn.primary', { onclick: send }, icon('send'), 'TX'))));
    drawLiveList();
  }
  function drawLiveList() {
    if (!liveList || tab !== 'live') return;
    const msgs = st.comms.filter((m) =>
      (liveFilter.channel === 'all' || String(m.channel) === liveFilter.channel) &&
      (liveFilter.uid === 'all' || (liveFilter.uid === 'npc' ? m.kind === 'npc' : m.fromUid === liveFilter.uid || m.toUid === liveFilter.uid))).slice(-250);
    const atBottom = liveList.scrollHeight - liveList.scrollTop - liveList.clientHeight < 100;
    mount(liveList, msgs.map((m) => messageEl(m, { viewer: 'teacher', onPlay: (x) => speak(x.text, { persona: x.persona || x.from }) })));
    if (atBottom) liveList.scrollTop = liveList.scrollHeight;
  }
  function pendingItem(m) {
    const draft = h('textarea', { rows: 2, placeholder: 'Respuesta de la estación…' }, m.aiDraft || '');
    return h('div.task',
      h('div.small', `${hhmm(new Date(m.ts))} · ${m.from} → ${m.to || m.needsReply}`), h('div', m.text),
      draft,
      h('div.row', { style: { marginTop: '6px' } },
        h('button.btn.small', { onclick: async () => {
          const r = await session.generateReply(m, m.needsReply);
          draft.value = r.text;
          toast(`Borrador: ${PROVIDER_LABEL[r.provider]}`, 'info', 2500);
        } }, icon('sparkle'), 'Borrador IA'),
        h('button.btn.small.primary', { onclick: async () => { if (!draft.value.trim()) return; await session.postNpc(m.needsReply, { text: draft.value.trim(), provider: 'teacher' }, m); } }, icon('send'), 'Enviar como ' + (stationName(st.lab, m.needsReply.split(':')[0]) || m.needsReply)),
        h('button.btn.small.ghost', { onclick: () => api.updateComm(labId, m.id, { replied: true, aiStatus: 'dismissed' }) }, 'Descartar')));
  }

  // ----- RADAR (god mode)
  function drawRadar() {
    const canvas = h('canvas');
    const info = h('div');
    let sel = null;
    radar = createRadar(canvas, {
      mode: 'shore', getLab: () => st.lab, godMode: true,
      onSelect: (c) => { sel = c?.id || null; drawInfo(); },
      onMoveTarget: async (id, pos) => {
        const targets = (st.lab.targets || []).map((t) => (t.id === id ? { ...t, x: pos.x, y: pos.y, setAt: Date.now() } : t));
        await api.updateLab(labId, { targets });
      },
    });
    const drawInfo = () => {
      const c = picture(st.lab).contacts.find((x) => x.id === sel);
      mount(info, c ? h('div.col', targetCard(c),
        h('div.row',
          h('button.btn.small', { onclick: () => editTarget(c) }, icon('edit'), 'Editar'),
          h('button.btn.small', { onclick: async () => { const targets = st.lab.targets.map((t) => (t.id === c.id ? { ...reanchor(t), ais: !t.ais } : t)); await api.updateLab(labId, { targets }); } }, c.ais ? 'Apagar AIS' : 'Encender AIS'),
          h('button.btn.small.danger', { onclick: async () => { await api.updateLab(labId, { targets: st.lab.targets.filter((t) => t.id !== c.id) }); sel = null; drawInfo(); } }, icon('trash'), 'Eliminar'))) : h('p.small', 'Selecciona un blanco para editarlo. Arrástralo para reposicionarlo (modo dios).'));
    };
    drawInfo();
    mount(body, h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,1fr)' } },
      h('div', h('div.radar-wrap', { style: { maxHeight: '64vh' } }, canvas),
        h('div.radar-tools', h('button.btn.small', { onclick: () => radar.stepRange(-1) }, 'Zoom +'), h('button.btn.small', { onclick: () => radar.stepRange(1) }, 'Zoom −'), h('button.btn.small', { onclick: () => radar.recentre() }, 'Centrar'))),
      h('div.col', h('button.btn.primary', { onclick: () => editTarget(null) }, icon('plus'), 'Añadir buque / blanco'), info,
        h('hr'), h('h4', 'Buque del ejercicio'), ownShipControls())));
  }
  function ownShipControls() {
    const own = st.lab.ownShip;
    const c = h('input', { type: 'number', value: Math.round(own.course), min: 0, max: 359 });
    const s = h('input', { type: 'number', value: own.speed, step: 0.5, min: 0, max: 30 });
    return h('div.grid.g2', field('Rumbo', c), field('Velocidad (kn)', s),
      h('button.btn.small', { onclick: async () => { await api.updateLab(labId, { ownShip: reanchor(st.lab.ownShip, { course: +c.value % 360, speed: +s.value }) }); toast('Buque actualizado', 'success'); } }, 'Aplicar'));
  }
  function editTarget(c) {
    const t = c ? st.lab.targets.find((x) => x.id === c.id) : null;
    const name = h('input', { value: t?.name || 'MV Sea Lion' });
    const type = h('input', { value: t?.type || 'General cargo' });
    const rb = h('input', { type: 'number', value: 45 });
    const rg = h('input', { type: 'number', value: 3, step: 0.1 });
    const course = select([{ value: 'crossing', label: 'Cruce (riesgo de abordaje)' }, { value: 'intercept', label: 'Rumbo de colisión' }, { value: 'same', label: 'Mismo rumbo' }, { value: 'reciprocal', label: 'Rumbo opuesto' }, { value: 'stopped', label: 'Parado' }, { value: 'custom', label: 'Rumbo concreto…' }], 'crossing', () => {});
    const custom = h('input', { type: 'number', value: t?.course ?? 0 });
    const speed = h('input', { type: 'number', value: t?.speed ?? 12, step: 0.5 });
    const ais = h('input', { type: 'checkbox', checked: t ? t.ais : true });
    modal({
      title: t ? 'Editar blanco' : 'Nuevo blanco',
      body: h('div.grid.g2', field('Nombre', name), field('Tipo', type),
        t ? null : field('Demora relativa (°)', rb), t ? null : field('Distancia (NM)', rg),
        t ? field('Rumbo (°)', custom) : field('Geometría', course), t ? null : field('Rumbo concreto (si aplica)', custom),
        field('Velocidad (kn)', speed), h('label.check', ais, h('span', 'Transmite AIS'))),
      actions: [{ label: t ? 'Guardar' : 'Añadir', kind: 'primary', onClick: async () => {
        let targets;
        if (t) targets = st.lab.targets.map((x) => (x.id === t.id ? { ...reanchor(x), name: name.value, type: type.value, course: +custom.value, speed: +speed.value, ais: ais.checked } : x));
        else {
          const spec = { name: name.value, type: type.value, relBearing: +rb.value, range: +rg.value, course: course.value === 'custom' ? +custom.value : course.value, speed: +speed.value, ais: ais.checked };
          targets = [...(st.lab.targets || []), { ...targetFromSpec(st.lab.ownShip, spec), source: 'teacher' }];
        }
        await api.updateLab(labId, { targets });
        sfx.ping();
      } }],
    });
  }

  // ----- EVENTS
  let evCat = 'all';
  function drawEvents() {
    const lab = st.lab;
    const pool = eventsForScenario(lab.scenarioId).filter((e) => evCat === 'all' || e.category === evCat);
    const active = st.events.filter((e) => e.status === 'active');
    const r = lab.random || {};
    mount(body,
      h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)', alignItems: 'start' } },
        h('div',
          h('div.row', { style: { marginBottom: '10px' } }, h('button.chip' + (evCat === 'all' ? '.on' : ''), { onclick: () => { evCat = 'all'; drawEvents(); } }, 'Todos'),
            Object.entries(CATEGORIES).map(([k, v]) => h('button.chip' + (evCat === k ? '.on' : ''), { onclick: () => { evCat = k; drawEvents(); } }, v))),
          h('div.event-grid', pool.map((e) => h('button.event-btn.' + e.severity, { onclick: () => triggerDialog(e) },
            h('b', e.es), h('span.small', e.en), h('span.small.dim', `${rolesTouched(e).length} roles con tarea · ${e.alarm ? '🔔 ' + e.alarm : 'sin alarma'}`)))),
          h('div.row', { style: { marginTop: '14px' } }, h('button.btn', { onclick: customEventDialog }, icon('plus'), 'Crear evento personalizado'), h('button.btn', { onclick: scheduleDialog }, icon('clock'), 'Programar en cronograma'))),
        h('div.col',
          h('div.panel', h('h4', icon('alarm'), `Activos (${active.length})`),
            active.length ? active.map((e) => h('div.active-ev', h('div', h('b', e.titleEs), h('div.small', `${hhmm(new Date(e.ts))} · ${e.by?.name || ''}${e.effectsApplied === false ? ' · (notificado por alumno)' : ''}`)),
              h('div.row', { style: { gap: '4px' } },
                e.effectsApplied === false && e.eventId ? h('button.btn.small', { title: 'Aplicar efectos al mundo', onclick: async () => { await fireEvent(st.lab, { eventId: e.eventId, vars: e.vars, by: { name: 'Instructor' }, silentBroadcast: false }); await api.updateEvent(labId, e.id, { status: 'resolved', resolvedAt: Date.now() }); } }, '⚡') : null,
                h('button.btn.small.success', { onclick: () => resolveEvent(st.lab, e, user) }, 'Resolver')))) : h('p.muted', 'Ninguno.')),
          h('div.panel', h('h4', icon('dice'), 'Eventos aleatorios'),
            h('label.check', h('input', { type: 'checkbox', checked: !!r.enabled, onchange: (e) => api.updateLab(labId, { random: { ...r, enabled: e.target.checked, nextAt: null } }) }), h('span', 'Activados')),
            field('Cada ~ minutos', h('input', { type: 'number', min: 1, max: 60, value: r.everyMin || 6, onchange: (e) => api.updateLab(labId, { random: { ...r, everyMin: +e.target.value, nextAt: null } }) })),
            h('div.row', Object.keys(SEVERITY).map((s) => h('label.check.small', h('input', { type: 'checkbox', checked: (r.severities || ['routine', 'safety', 'urgency']).includes(s), onchange: (e) => {
              const set = new Set(r.severities || ['routine', 'safety', 'urgency']);
              e.target.checked ? set.add(s) : set.delete(s);
              api.updateLab(labId, { random: { ...r, severities: [...set] } });
            } }), h('span', SEVERITY[s].es)))),
            r.enabled && r.nextAt ? h('p.small', `Próximo en ~${Math.max(0, Math.round((r.nextAt - Date.now()) / 60000))} min`) : null,
            lab.status !== 'running' ? h('p.small', { style: { color: 'var(--c-warn)' } }, 'Solo se disparan con la sesión en curso.') : null),
          h('div.panel', h('h4', icon('clock'), 'Cronograma'),
            (lab.schedule || []).length ? (lab.schedule || []).map((s, i) => h('div.active-ev', h('div', h('b', `+${s.atMin} min`), ' ', eventById(s.eventId)?.es || s.eventId, s.fired ? h('span.badge', '✓') : null),
              h('button.icon-btn', { onclick: () => api.updateLab(labId, { schedule: lab.schedule.filter((_, j) => j !== i) }) }, icon('x')))) : h('p.muted', 'Sin eventos programados.')))));
  }

  function triggerDialog(def) {
    const inputs = {};
    const varFields = Object.entries(def.vars || {}).map(([k, v]) => { inputs[k] = h('input', { value: v }); return field(k, inputs[k]); });
    const touched = rolesTouched(def);
    modal({
      title: `${def.es} · ${def.en}`,
      wide: true,
      body: h('div',
        h('p', fill(def.situation, { ship: st.lab.ownShip.name, ...def.vars })),
        varFields.length ? h('div.grid.g3', varFields) : null,
        h('h4', 'Tareas por rol'),
        h('div.grid.g2', (def.tasks || []).map((t) => h('div.task', h('b', ROLES.find((r) => r.id === t.who)?.en || STATIONS[t.who]?.en || careerById(t.who)?.es || t.who), h('div.small', t.task)))),
        h('p.small', `Roles conectados afectados: ${st.crew.filter((c) => touched.includes(c.roleId)).map((c) => c.name).join(', ') || 'ninguno con tarea específica (recibirán la tarea genérica)'}`)),
      actions: [
        { label: 'Disparar ahora', kind: def.severity === 'distress' ? 'danger' : 'primary', onClick: async () => {
          const vars = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
          await fireEvent(st.lab, { eventId: def.id, vars, by: { uid: user.uid, name: user.name, role: 'Instructor' } });
          sfx.notify();
          toast('Evento disparado: ' + def.es, 'success');
        } },
      ],
    });
  }

  function customEventDialog() {
    const title = h('input', { placeholder: 'Steering gear room flooding' });
    const titleEs = h('input', { placeholder: 'Inundación en el local del servo' });
    const desc = h('textarea', { rows: 3, placeholder: 'Situation (English): what, where, when, numbers…' });
    const sev = select(Object.keys(SEVERITY).map((s) => ({ value: s, label: SEVERITY[s].es })), 'urgency', () => {});
    const alarm = select([{ value: '', label: 'Sin alarma' }, ...ALARM_PATTERNS.map((a) => ({ value: a, label: a }))], 'caution', () => {});
    const rows = h('div');
    const targetOpts = [{ value: '*', label: 'Todos' }, ...CAREERS.map((c) => ({ value: c.id, label: 'Titulación: ' + c.short })), ...Object.values(STATIONS).map((s) => ({ value: s.id, label: 'Puesto: ' + s.es })), ...ROLES.map((r) => ({ value: r.id, label: 'Rol: ' + r.es }))];
    const addRow = () => rows.append(h('div.row', { style: { marginBottom: '6px' } }, select(targetOpts, '*', () => {}, { style: { maxWidth: '260px' } }), h('input.grow', { placeholder: 'Task (English): who to call, which marker, what to include' })));
    addRow(); addRow();
    modal({
      title: 'Evento personalizado',
      wide: true,
      body: h('div', h('div.grid.g2', field('Título (EN)', title), field('Título (ES)', titleEs)), field('Situación', desc), h('div.grid.g2', field('Gravedad', sev), field('Alarma', alarm)),
        h('h4', 'Tareas por destinatario'), rows, h('button.btn.small', { onclick: addRow }, icon('plus'), 'Otra tarea')),
      actions: [{ label: 'Disparar', kind: 'primary', onClick: async () => {
        const tasks = [...rows.children].map((r) => ({ who: r.querySelector('select').value, task: r.querySelector('input').value.trim() })).filter((t) => t.task);
        if (!title.value.trim()) { toast('Pon un título', 'warn'); return false; }
        await fireEvent(st.lab, { custom: { title: title.value.trim(), en: title.value.trim(), es: titleEs.value.trim() || title.value.trim(), description: desc.value.trim(), situation: desc.value.trim(), severity: sev.value, alarm: alarm.value || null, category: 'safety', tasks }, by: { uid: user.uid, name: user.name, role: 'Instructor' } });
        toast('Evento personalizado disparado', 'success');
      } }],
    });
  }

  function scheduleDialog() {
    const ev = select(eventsForScenario(st.lab.scenarioId).map((e) => ({ value: e.id, label: e.es })), eventsForScenario(st.lab.scenarioId)[0].id, () => {});
    const at = h('input', { type: 'number', min: 0, max: 240, value: 5 });
    modal({
      title: 'Programar evento',
      body: h('div', field('Evento', ev), field('Minuto desde el inicio', at)),
      actions: [{ label: 'Añadir', kind: 'primary', onClick: async () => { await api.updateLab(labId, { schedule: [...(st.lab.schedule || []), { id: makeId('s'), eventId: ev.value, atMin: +at.value, fired: false }].sort((a, b) => a.atMin - b.atMin) }); } }],
    });
  }

  // ----- WORLD
  function drawWorld() {
    const lab = st.lab;
    const w = lab.world || {};
    const save = debounce((patch) => api.updateLab(labId, { world: { ...st.lab.world, ...patch } }), 300);
    const slider = (label, key, min, max, step, unit) => {
      const out = h('output', `${w[key]} ${unit}`);
      return h('div.slider-row', h('span', label), h('input', { type: 'range', min, max, step, value: w[key] ?? min, oninput: (e) => { out.textContent = `${e.target.value} ${unit}`; save({ [key]: +e.target.value }); } }), out);
    };
    const varsBox = h('div');
    const drawVars = () => mount(varsBox,
      (st.lab.variables || []).map((v, i) => h('div.row', { style: { marginBottom: '6px' } }, h('input', { value: v.key, style: { maxWidth: '220px' }, onchange: (e) => upVar(i, { key: e.target.value }) }), h('input.grow', { value: v.value, onchange: (e) => upVar(i, { value: e.target.value }) }),
        h('button.icon-btn', { onclick: () => api.updateLab(labId, { variables: st.lab.variables.filter((_, j) => j !== i) }) }, icon('x')))),
      h('button.btn.small', { onclick: () => api.updateLab(labId, { variables: [...(st.lab.variables || []), { key: 'Pilot boarding', value: '1515' }] }) }, icon('plus'), 'Añadir variable'));
    const upVar = (i, p) => api.updateLab(labId, { variables: st.lab.variables.map((v, j) => (j === i ? { ...v, ...p } : v)) });
    drawVars();
    const clock = h('input', { value: w.clock || '1200', maxlength: 4, style: { maxWidth: '120px', fontFamily: 'var(--mono)' } });
    mount(body, h('div.grid.g2',
      h('div.panel', h('h4', icon('wind'), 'Meteorología y mar'),
        slider('Viento (kn)', 'wind', 0, 70, 1, 'kn'), slider('Dirección viento', 'windDir', 0, 359, 5, '°'), slider('Estado de la mar', 'seaState', 0, 9, 1, ''),
        slider('Visibilidad', 'visibility', 0.1, 12, 0.1, 'NM'), slider('Sonda', 'depth', 5, 200, 1, 'm'),
        h('div.row', ['fog', 'rain'].map((k) => h('label.check', h('input', { type: 'checkbox', checked: !!w[k], onchange: (e) => save({ [k]: e.target.checked }) }), h('span', k === 'fog' ? 'Niebla' : 'Lluvia'))),
          h('label.check', h('input', { type: 'checkbox', checked: w.gnss !== false, onchange: (e) => save({ gnss: e.target.checked }) }), h('span', 'GNSS operativo'))),
        h('div.row', h('span', 'Hora del buque'), clock, h('button.btn.small', { onclick: () => api.updateLab(labId, { world: { ...st.lab.world, clock: clock.value.padStart(4, '0') }, simStart: Date.now() }) }, 'Fijar'))),
      h('div.panel', h('h4', icon('engine'), 'Planta propulsora'), enginePanel(lab),
        h('div.row', { style: { marginTop: '10px' } },
          h('button.btn.small', { onclick: () => api.updateLab(labId, { engine: { ...lab.engine, blackout: !lab.engine?.blackout } }) }, 'Blackout on/off'),
          h('button.btn.small', { onclick: () => api.updateLab(labId, { engine: { ...lab.engine, loPressure: lab.engine?.loPressure < 2.5 ? 3 : 1.7 } }) }, 'Baja presión aceite on/off'),
          h('button.btn.small', { onclick: () => api.updateLab(labId, { engine: { ...lab.engine, bilge: (lab.engine?.bilge || 0) > 50 ? 12 : 72 } }) }, 'Sentinas alto on/off'),
          h('button.btn.small', { onclick: () => api.updateLab(labId, { ownShip: { ...lab.ownShip, list: lab.ownShip.list ? 0 : 8 } }) }, 'Escora 8° on/off'))),
      h('div.panel', { style: { gridColumn: '1 / -1' } }, h('h4', icon('sliders'), 'Variables del ejercicio (visibles para todos)'),
        h('p.small', 'Datos que puedes introducir o cambiar en cualquier momento: horas, cifras, nombres, condiciones. Aparecen en la consola del alumnado y la IA los usa.'), varsBox)));
  }

  // ----- BRIEF & GOALS
  function drawBrief() {
    const lab = st.lab;
    const brief = h('textarea', { rows: 6 }, lab.brief || '');
    const goals = [...(lab.goals || [])];
    const goalsBox = h('div.grid.g3', STRUCTURES.map((s) => {
      const g = goals.find((x) => x.id === s.id);
      const cnt = h('input', { type: 'number', min: 1, max: 20, value: g?.count || 2, style: { width: '70px', minHeight: '38px' } });
      const cb = h('input', { type: 'checkbox', checked: !!g });
      const wrap = h('label.check', { title: s.ex }, cb, h('span.grow', s.es), cnt);
      wrap.dataset.id = s.id;
      return wrap;
    }));
    const announce = h('input', { placeholder: 'Anuncio a toda la tripulación (aparece en todas las consolas)' });
    mount(body, h('div.col',
      h('div.panel', h('h4', 'Instrucciones de la tarea'), brief,
        h('div.row', { style: { marginTop: '8px' } },
          h('label.check', h('input', { type: 'checkbox', checked: !!lab.speakingRequired, onchange: (e) => api.updateLab(labId, { speakingRequired: e.target.checked }) }), h('span', 'Radio solo por voz')),
          h('label.check', h('input', { type: 'checkbox', checked: lab.autoSendVoice !== false, onchange: (e) => api.updateLab(labId, { autoSendVoice: e.target.checked }) }), h('span', 'Enviar al soltar PTT')))),
      h('div.panel', h('h4', 'Estructuras obligatorias'),
        h('div.row', { style: { marginBottom: '10px' } }, Object.entries(PRESET_GOALS).map(([k, v]) => h('button.chip', { onclick: () => { [...goalsBox.children].forEach((w) => { const g = v.find((x) => x.id === w.dataset.id); w.querySelector('input[type=checkbox]').checked = !!g; if (g) w.querySelector('input[type=number]').value = g.count; }); } }, k))),
        goalsBox),
      h('div.row.end', h('button.btn.primary', { onclick: async () => {
        const newGoals = [...goalsBox.children].filter((w) => w.querySelector('input[type=checkbox]').checked).map((w) => ({ id: w.dataset.id, count: +w.querySelector('input[type=number]').value }));
        await api.updateLab(labId, { brief: brief.value, goals: newGoals });
        await systemMsg('📝 Instrucciones actualizadas. Revisad el panel de tareas.');
        sfx.success(); toast('Tarea actualizada para todos', 'success');
      } }, icon('check'), 'Publicar cambios')),
      h('div.panel', h('h4', 'Anuncio'), h('div.row', h('div.grow', announce), h('button.btn', { onclick: async () => { if (announce.value.trim()) { await systemMsg('📣 ' + announce.value.trim()); announce.value = ''; } } }, icon('send'), 'Anunciar')))));
  }

  // ----- AI
  function drawAI() {
    const ai = st.lab.ai || {};
    const provider = select([{ value: 'auto', label: 'Automático: Claude (si hay función) → Gemini → motor local' }, { value: 'gemini', label: 'Gemini (Firebase AI Logic) → motor local' }, { value: 'local', label: 'Solo motor SMCP local' }], ai.provider || 'auto', () => {});
    const mode = select([{ value: 'auto', label: 'Automático (responde la IA)' }, { value: 'approve', label: 'Borrador IA + aprobación docente' }, { value: 'manual', label: 'Manual (respondes tú)' }], ai.mode || 'auto', () => {});
    const fn = h('input', { value: ai.functionUrl || '', placeholder: 'https://europe-west1-maritime-comms.cloudfunctions.net/npcReply' });
    const gm = h('input', { value: ai.geminiModel || '', placeholder: 'gemini-2.5-flash (por defecto)' });
    const persona = h('textarea', { rows: 3, placeholder: 'Ej.: El VTS es estricto con el procedimiento y pide siempre la posición. Los buques responden a veces de forma ambigua para forzar reparaciones.' }, ai.persona || '');
    const testOut = h('div');
    mount(body, h('div.col',
      h('div.panel', h('h4', icon('sparkle'), 'Estaciones con IA'),
        h('p.small', 'La cadena de proveedores garantiza respuesta: si la IA en la nube no responde, el motor SMCP local contesta siempre con datos reales del radar y los eventos.'),
        h('div.grid.g2', field('Proveedor', provider), field('Modo', mode), field('URL Cloud Function (Claude)', fn, 'Opcional. Ver README → «IA con Claude».'), field('Modelo Gemini', gm, 'Requiere activar Firebase AI Logic en la consola de Firebase.')),
        field('Instrucciones de comportamiento para las estaciones', persona),
        h('div.row', h('button.btn.primary', { onclick: async () => { await api.updateLab(labId, { ai: { provider: provider.value, mode: mode.value, functionUrl: fn.value.trim(), geminiModel: gm.value.trim(), persona: persona.value.trim() } }); toast('Configuración IA guardada', 'success'); } }, 'Guardar'),
          h('button.btn', { onclick: async () => {
            mount(testOut, h('p.small', 'Probando…'));
            const t0 = performance.now();
            const r = await npcReply({ lab: st.lab, personaKey: 'vts', events: st.events, history: [], sender: { name: 'Test' }, text: `${stationName(st.lab, 'vts')}, this is ${st.lab.ownShip.name}. Request traffic information. Over.`, channel: 'VTS' });
            mount(testOut, h('div.task', h('div.small', `${PROVIDER_LABEL[r.provider]} · ${r.model || ''} · ${Math.round(performance.now() - t0)} ms`), h('div', r.text)));
          } }, icon('play'), 'Probar respuesta del VTS'))),
      testOut));
  }

  // ----- ASSESSMENT
  function drawAssess() {
    const rows = st.crew.map((c) => {
      const { msgs, s } = memberStats(c);
      const reacts = st.events.map((e) => reactionTime(e, c.uid, st.comms)).filter((x) => x != null);
      const avgReact = reacts.length ? reacts.reduce((a, b) => a + b, 0) / reacts.length : null;
      const a = c.assessment || {};
      const total = RUBRIC.reduce((acc, r) => acc + (a[r.id] || 0), 0);
      return h('tr',
        h('td', h('b', c.name), h('div.small', roleById(c.roleId)?.en || '')),
        h('td.mono', s.messages), h('td.mono', s.spoken), h('td.mono', s.variety), h('td.mono', s.smcpAccuracy != null ? s.smcpAccuracy + '%' : '—'), h('td.mono', fmtReaction(avgReact)),
        h('td', st.lab.goals?.length ? goalsDone(c) : '—'),
        h('td', h('b.mono', total ? `${total}/${RUBRIC.length * 4}` : '—')),
        h('td', h('button.btn.small', { onclick: () => rubricDialog(c) }, icon('edit'), 'Rúbrica')));
    });
    mount(body, h('div.col',
      h('p.small', 'Indicadores automáticos y explicables (no sustituyen tu juicio). La rúbrica está alineada con los descriptores de interacción oral del MCER y las competencias de comunicación del Convenio STCW / IMO Model Course 3.17.'),
      h('table', h('thead', h('tr', ['Estudiante', 'Mensajes', 'Voz', 'Variedad', 'SMCP', 'Reacción media', 'Objetivos', 'Rúbrica', ''].map((x) => h('th', x)))), h('tbody', rows))));
  }

  function rubricDialog(c) {
    const a = { ...(c.assessment || {}) };
    const comment = h('textarea', { rows: 3, placeholder: 'Comentario para el portafolio del estudiante' }, a.comment || '');
    const grid = h('div', RUBRIC.map((r) => h('div', { style: { marginBottom: '10px' } }, h('b', r.es),
      h('div.row', r.d.map((d, i) => h('button.chip' + (a[r.id] === i + 1 ? '.on' : ''), { onclick: (e) => { a[r.id] = i + 1; [...e.target.parentNode.children].forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); } }, `${i + 1} · ${d}`))))));
    const msgs = memberStats(c).msgs.slice(-12);
    modal({
      title: `Evaluación — ${c.name}`,
      wide: true,
      body: h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' } }, h('div', grid, field('Comentario', comment)),
        h('div', h('h4', 'Últimas transmisiones'), h('div.comms', { style: { maxHeight: '420px' } }, msgs.map((m) => messageEl(m, { viewer: 'teacher' }))))),
      actions: [
        { label: 'Guardar', kind: 'primary', onClick: async () => { a.comment = comment.value; await api.updateCrew(labId, c.uid, { assessment: a }); toast('Evaluación guardada', 'success'); if (tab === 'assess') drawAssess(); } },
        { label: 'Guardar y enviar a su portafolio', kind: 'success', onClick: async () => {
          a.comment = comment.value;
          await api.updateCrew(labId, c.uid, { assessment: a });
          const rep = buildSessionReport({ lab: st.lab, crew: st.crew, comms: st.comms, events: st.events, focusUid: c.uid });
          await api.addPortfolioEntry(c.uid, { type: 'assessment', title: `Evaluación docente — ${st.lab.title}`, labId, rubric: a, teacherComment: a.comment, reportMarkdown: rep.markdown, stats: participantStats(memberStats(c).msgs) }).catch((e) => toast('No se pudo escribir en su portafolio: ' + e.message, 'error'));
          toast('Enviado al portafolio', 'success');
        } },
      ],
    });
  }

  // ----- EXPORT
  function drawExport() {
    const data = () => ({ lab: st.lab, crew: st.crew, comms: st.comms, events: st.events });
    mount(body, h('div.col',
      h('div.panel', h('h4', icon('log'), 'Caja negra (VDR) de la sesión completa'),
        h('div.row', EXPORT_FORMATS.map((f) => h('button.btn', { onclick: () => exportSession(f.id, data()) }, icon(f.icon), f.label))),
        h('div.row', { style: { marginTop: '10px' } }, h('button.btn.primary', { onclick: () => go('debrief/' + labId) }, icon('play'), 'Abrir debriefing con reproducción'))),
      h('div.panel', h('h4', icon('users'), 'Informe individual'),
        st.crew.length ? h('table', h('tbody', st.crew.map((c) => h('tr', h('td', h('b', c.name), h('div.small', roleById(c.roleId)?.en || '')),
          h('td', h('div.row.end', ['pdf', 'docx', 'md'].map((f) => h('button.btn.small', { onclick: () => exportSession(f, { ...data(), focusUid: c.uid }) }, f.toUpperCase())),
            h('button.btn.small.success', { onclick: async () => {
              const rep = buildSessionReport({ ...data(), focusUid: c.uid });
              await api.addPortfolioEntry(c.uid, { type: 'lab', title: `${st.lab.title} — informe`, labId, reportMarkdown: rep.markdown, stats: participantStats(memberStats(c).msgs) }).then(() => toast('Enviado', 'success')).catch((e) => toast(e.message, 'error'));
            } }, 'A su portafolio'))))))) : h('p.muted', 'Sin participantes.'))));
  }

  // ---------- RIGHT ----------
  const alarmsCard = h('div.panel');
  const selCard = h('div.panel', { style: { flex: 1, overflow: 'auto', minHeight: 0 } });
  const quickCard = h('div.panel');
  rightS.append(alarmsCard, selCard, quickCard);
  function drawRight() {
    const active = st.events.filter((e) => e.status === 'active');
    mount(alarmsCard, h('div.panel-head', h('h4', icon('alarm'), 'Alarmas activas')),
      active.length ? active.map((e) => h('div.active-ev', h('div', h('span.badge.sev-' + e.severity, SEVERITY[e.severity].es), ' ', h('b', e.titleEs),
        h('div.small', `ACK ${Object.keys(e.acks || {}).length}/${st.crew.length}`)), h('button.btn.small.success', { onclick: () => resolveEvent(st.lab, e, user) }, '✓'))) : h('p.muted', 'Sin alarmas.'));
    const c = st.crew.find((x) => x.uid === selUid);
    if (!c) mount(selCard, h('div.empty', icon('user', 'xl'), h('p', 'Selecciona a alguien de la tripulación para ver sus tareas, sus mensajes y hablarle en privado.')));
    else {
      const whisper = h('input', { placeholder: 'Mensaje privado (pista, corrección…)' });
      const { msgs, s } = memberStats(c);
      mount(selCard,
        h('div.row.between', h('div', h('h3', { style: { margin: 0 } }, c.name), h('div.small', `${roleById(c.roleId)?.en || ''} · ${careerById(c.careerId)?.short || ''}`)), h('span.dot' + (session.online(c) ? '.on' : '.off'))),
        h('div.row', { style: { margin: '10px 0' } },
          h('button.btn.small.primary', { onclick: () => go(`lab/${labId}?as=${c.uid}`) }, icon('eye'), 'Ver como estudiante'),
          h('button.btn.small', { onclick: () => rubricDialog(c) }, icon('trophy'), 'Rúbrica'),
          h('button.btn.small.ghost', { onclick: async () => { if (await confirmDialog('Quitar de la sesión', `¿Quitar a ${c.name}?`, 'Quitar')) { await api.removeCrew(labId, c.uid); selUid = null; } } }, icon('x'))),
        h('div.row', h('div.grow', whisper), h('button.btn.small', { onclick: async () => { if (!whisper.value.trim()) return; await session.send({ text: whisper.value.trim(), channel: 'PRIV', kind: 'whisper', whisperTo: c.uid, fromName: 'Instructor' }); whisper.value = ''; toast('Mensaje privado enviado', 'success'); } }, icon('send'))),
        h('div.grid.g2', { style: { margin: '10px 0' } }, h('div.kpi', h('b', s.messages), h('span', 'mensajes')), h('div.kpi', h('b', s.smcpAccuracy != null ? s.smcpAccuracy + '%' : '—'), h('span', 'precisión SMCP'))),
        h('h4', 'Objetivos'), goalsPanel(st.lab.goals, msgs),
        h('h4', { style: { marginTop: '12px' } }, 'Tareas activas'), tasksPanel(st.lab, st.events, c, msgs),
        h('h4', { style: { marginTop: '12px' } }, 'Últimos mensajes'), msgs.slice(-5).map((m) => messageEl(m, { viewer: 'teacher' })));
    }
    const favs = ['close_quarters', 'restricted_visibility', 'blackout', 'er_fire', 'mob', 'pilot_change', 'dark_tow', 'cargo_shift'].map(eventById).filter((e) => e && eventsForScenario(st.lab.scenarioId).includes(e));
    mount(quickCard, h('div.panel-head', h('h4', icon('bolt'), 'Disparo rápido')),
      h('div.event-grid', { style: { gridTemplateColumns: '1fr 1fr' } }, favs.map((e) => h('button.event-btn.' + e.severity, { style: { minHeight: '60px' }, onclick: () => triggerDialog(e) }, h('b', e.es)))));
  }

  // ---------- subscriptions ----------
  const unsubs = [
    session.on('lab', () => { drawSession(); drawTabs(); if (['world', 'brief', 'ai'].includes(tab)) { /* keep inputs stable */ } else if (tab === 'events') drawEvents(); }),
    session.on('crew', () => { drawRoster(); drawRight(); if (tab === 'assess' || tab === 'export') drawBody(); }),
    session.on('comms', ({ added } = {}) => {
      drawRoster(); drawPulse(); drawTabs(); drawLiveList(); if (selUid) drawRight();
      for (const m of added || []) if (m.needsReply && !m.replied) { sfx.notify(); if (tab === 'live') drawLive(); }
    }),
    session.on('events', ({ added } = {}) => {
      drawRight(); drawTabs(); if (tab === 'events') drawEvents();
      for (const e of added || []) if (e.by?.uid && e.by.uid !== user.uid && Date.now() - e.ts < 30000) { sfx.notify(); toast(`${e.by.name} ha notificado: ${e.titleEs}`, 'warn', 7000); }
    }),
  ];
  const tick = setInterval(() => { drawSession(); drawPulse(); }, 5000);

  drawSession(); drawRoster(); drawPulse(); drawTabs(); drawBody(); drawRight();

  return () => { unsubs.forEach((u) => u()); clearInterval(tick); director.stop(); radar?.destroy(); session.destroy(); stopAllAlarms(); void startAlarm; void npcName; void CHANNELS; };
}
