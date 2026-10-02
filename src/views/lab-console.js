// Student console of the Real Communication Lab (also used by the teacher in "view as student").
import { h, mount, icon, toast, modal, field } from '../core/dom.js';
import { go } from '../core/store.js';
import { db } from '../backend/index.js';
import { createSession } from '../lab/session.js';
import {
  statusBar, alarmBanner, tasksPanel, goalsPanel, conningPanel, enginePanel, targetCard, docsPanel, radioPanel, openLogbook, messageEl,
} from '../lab/widgets.js';
import { createRadar } from '../sim/radar.js';
import { picture, reanchor } from '../sim/engine.js';
import { fireEvent, eventsForScenario } from '../sim/director.js';
import { CAREERS, ROLES, STATIONS, roleById, careerById, rolesFor, roleMatches } from '../data/careers.js';
import { scenarioById } from '../data/scenarios.js';
import { SEVERITY } from '../data/events.js';
import { startAlarm, stopAlarm, stopAllAlarms, sfx, startAmbient, stopAmbient, setAmbientWeather } from '../core/audio.js';
import { speak, stopSpeaking } from '../core/speech.js';
import { shipDiagram } from '../ui/ship-diagram.js';
import { getBackdrop } from '../main.js';
import { participantStats } from '../ai/analyzer.js';
import { buildSessionReport } from '../export/report.js';
import { safetyIndex, safetyColor } from '../lab/metrics.js';
import { setGlossaryIndex } from '../lab/widgets.js';

const HELM_ROLES = ['master', 'chief_officer', 'second_officer', 'third_officer', 'oow'];

export default async function render(root, { path, query, user }) {
  const labId = path[1];
  const asUid = user.role === 'teacher' ? query.as || null : null;
  const session = createSession(labId, user, { asUid });
  const st = session.state;
  mount(root, h('div.page', h('div.empty', h('div.sonar', { style: { margin: '0 auto' } }), h('p', 'Conectando con la sesión…'))));

  await session.ready();
  if (!st.lab) {
    session.destroy();
    mount(root, h('div.page', h('div.panel.empty', icon('sos', 'xl'), h('h3', 'Sesión no encontrada'), h('button.btn', { onclick: () => go('lab') }, 'Volver'))));
    return;
  }
  if (user.role === 'teacher' && !asUid && st.lab.ownerUid === user.uid && !query.join) { session.destroy(); go('control/' + labId); return; }

  let cleanupConsole = null;
  const showPicker = () => rolePicker(root, session, user, () => { cleanupConsole = consoleView(root, session, user); });
  if (!st.me && !asUid) showPicker();
  else cleanupConsole = consoleView(root, session, user);

  return () => { cleanupConsole?.(); session.destroy(); stopAllAlarms(); stopAmbient(); stopSpeaking(); };
}

// ---------------------------------------------------------------- role picker
function rolePicker(root, session, user, done) {
  const st = session.state;
  const lab = st.lab;
  const sc = scenarioById(lab.scenarioId);
  let career = user.careerId || 'nautica';
  let roleId = user.roleId && roleById(user.roleId)?.career === career ? user.roleId : null;
  const careersEl = h('div.career-tabs');
  const rolesEl = h('div.roles');
  const detail = h('div');
  const taken = () => new Set(st.crew.filter(session.online).map((c) => c.roleId));
  const draw = () => {
    mount(careersEl, CAREERS.map((c) => h('button.career' + (career === c.id ? '.on' : ''), { style: { '--cc': c.color }, onclick: () => { career = c.id; roleId = null; sfx.tick(); draw(); } },
      h('b', { style: { color: c.color } }, c.short), h('span.small', c.es), h('div.small.dim', c.blurb))));
    const tk = taken();
    mount(rolesEl, rolesFor(career).map((r) => h('button.role' + (roleId === r.id ? '.on' : '') + (tk.has(r.id) ? '.taken' : ''), { onclick: () => { roleId = r.id; sfx.tick(); draw(); } },
      h('span.st', STATIONS[r.station].es), h('b', r.es), h('span.small', r.en), tk.has(r.id) ? h('span.small', { style: { color: 'var(--c-warn)' } }, 'Ocupado por otra persona (se puede compartir)') : null)));
    const r = roleById(roleId);
    mount(detail, r ? h('div.panel',
      h('h3', `${r.en} — ${r.es}`),
      h('div.grid.g2',
        h('div', h('h4', 'Responsabilidades'), h('ul', r.duties.map((d) => h('li', d)))),
        h('div', h('h4', 'Foco lingüístico'), h('ul', r.focus.map((d) => h('li', d))))),
      h('button.btn.primary.big', { onclick: async () => {
        await session.join({ roleId: r.id, careerId: r.career, station: r.station });
        db().updateProfile(user.uid, { careerId: r.career, roleId: r.id }).catch(() => {});
        sfx.boot();
        done();
      } }, icon('anchor'), `Tomar el puesto: ${r.es}`)) : h('p.muted', 'Elige un puesto para ver sus responsabilidades.'));
  };
  draw();
  const unsub = session.on('crew', draw);
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', `Sesión ${lab.code} · ${sc.area}`), h('h2', lab.title || sc.es), h('p', sc.blurb)),
      h('div.panel', { style: { padding: '12px 18px' } }, h('div.small', 'Buque del ejercicio'), h('b', sc.ownShip.name), h('div.small', `${sc.ownShip.type} · ${sc.ownShip.callsign}`))),
    h('h4', '1 · Tu titulación'), careersEl, h('h4', '2 · Tu puesto'), rolesEl, h('div', { style: { height: '18px' } }), detail));
  return unsub;
}

// ---------------------------------------------------------------- console
function consoleView(root, session, user) {
  const st = session.state;
  const api = db();
  const me = () => st.me || st.crew.find((c) => c.uid === session.viewer);
  const role = () => roleById(me()?.roleId);
  const station = () => STATIONS[role()?.station] || STATIONS.bridge;
  const acked = {};
  let selectedTarget = null;
  let voices = localStorage.getItem('mesim10:voices') !== 'off';
  let lastActivity = Date.now();
  const ocean = getBackdrop();

  const status = h('div');
  const leftCol = h('div.col-a');
  const centre = h('div.col-b');
  const right = h('div.col-c');
  const spectBanner = session.spectating ? h('div.alarm-banner.routine', { style: { gridColumn: '1 / -1' } }, icon('eye', 'lg'),
    h('div.grow', h('h3', `Vista de estudiante: ${me()?.name || ''}`), h('span.small', 'Solo lectura. Ves exactamente su consola, tareas y canales.')),
    h('button.btn.small', { onclick: () => go('control/' + st.lab.id) }, 'Volver a la consola docente')) : null;
  const layout = h('div.lab', h('div.statusbar-wrap.statusbar', { style: { padding: 0, border: 0, background: 'none' } }, status), leftCol, centre, right);
  if (spectBanner) layout.prepend(spectBanner);
  mount(root, h('div.page.full', layout));

  // ----- left column: brief, alarms, tasks, goals
  const briefEl = h('div.panel');
  const alarmsEl = h('div');
  const tasksEl = h('div.panel.scroll', { style: { flex: 1 } });
  const myMsgs = () => st.comms.filter((m) => m.fromUid === session.viewer && ['radio', 'intercom', 'log'].includes(m.kind));
  function drawLeft() {
    const lab = st.lab;
    mount(briefEl, h('div.panel-head', h('h4', icon('doc'), 'Instrucciones')), h('p', { style: { whiteSpace: 'pre-wrap' } }, lab.brief || '—'),
      lab.variables?.length ? h('div.row', lab.variables.map((v) => h('span.badge', `${v.key}: ${v.value}`))) : null);
    mount(alarmsEl, alarmBanner(st.events, me()?.roleId, { acked, onAck: session.spectating ? null : ack }));
    mount(tasksEl,
      h('div.panel-head', h('h4', icon('target'), `Tareas · ${role()?.en || ''}`)),
      tasksPanel(lab, st.events, me(), myMsgs()),
      h('hr'),
      h('div.panel-head', h('h4', icon('trophy'), 'Estructuras obligatorias')),
      goalsPanel(lab.goals, myMsgs()),
      reviewsReceived());
  }
  function reviewsReceived() {
    const got = st.comms.filter((m) => m.kind === 'review' && m.toUid === session.viewer);
    if (!got.length) return null;
    return h('div', h('hr'), h('div.panel-head', h('h4', icon('chat'), 'Feedback de compañeros')),
      got.map((m) => h('div.task', h('div.small', m.review ? `Claridad ${m.review.clarity}/4 · Procedimiento ${m.review.procedure}/4 · Precisión ${m.review.precision}/4` : ''), h('div', m.text))));
  }
  leftCol.append(briefEl, alarmsEl, tasksEl);

  // ----- centre: station view
  let radar = null;
  const stationBox = h('div.panel', { style: { flex: '1', minHeight: 0, overflow: 'auto' } });
  const instruments = h('div.panel');
  const tgtBox = h('div');
  centre.append(stationBox, instruments);

  function buildStation() {
    radar?.destroy();
    radar = null;
    const stt = station();
    const canvas = h('canvas', { 'aria-label': 'Radar display' });
    if (['bridge', 'radio', 'vessel2', 'vts', 'mrcc'].includes(stt.id)) {
      const shore = ['vts', 'mrcc'].includes(stt.id);
      radar = createRadar(canvas, {
        mode: shore ? 'shore' : 'ship',
        getLab: () => st.lab,
        onSelect: (c) => { selectedTarget = c?.id || null; drawTarget(); },
      });
      const rangeLbl = h('span.mono');
      const updR = () => { rangeLbl.textContent = radar.range + ' NM'; };
      updR();
      mount(stationBox,
        h('div.panel-head', h('h4', icon('radar'), shore ? `${stt.en} · picture` : 'X-band radar / ARPA'),
          h('div.row', { style: { gap: '6px' } },
            h('button.icon-btn', { title: 'Reducir escala', onclick: () => { radar.stepRange(-1); updR(); } }, '−'), rangeLbl,
            h('button.icon-btn', { title: 'Aumentar escala', onclick: () => { radar.stepRange(1); updR(); } }, '+'))),
        h('div.scope-layout',
          h('div.radar-wrap', canvas),
          h('div.scope-rail',
            h('div.radar-tools',
              shore ? null : h('button.btn.small', { onclick: (e) => { radar.setOrientation(radar.orientation === 'head' ? 'north' : 'head'); e.target.textContent = radar.orientation === 'head' ? 'HEAD UP' : 'NORTH UP'; } }, 'HEAD UP'),
              h('button.btn.small', { onclick: () => radar.setTool('ebl') }, 'EBL'), h('button.btn.small', { onclick: () => radar.setTool('vrm') }, 'VRM'),
              h('button.btn.small', { onclick: () => radar.acquireAll() }, 'ACQ ALL'), h('button.btn.small.ghost', { onclick: () => radar.clearTools() }, 'CLR')),
            tgtBox,
            h('button.btn.small.primary', { onclick: () => insertTargetReport() }, icon('radio'), 'Informe de blanco'))));
      drawTarget();
    } else if (stt.id === 'ecr') {
      mount(stationBox, h('div.panel-head', h('h4', icon('engine'), 'Engine control room · alarm & monitoring')), h('div#ecr'));
    } else if (stt.id === 'deck') {
      const diag = shipDiagram({ onPick: ({ phrase }) => { radioEl.insert(phrase + ' '); toast('Ubicación insertada: ' + phrase, 'info', 2500); } });
      mount(stationBox, h('div.panel-head', h('h4', icon('anchor'), 'Deck rounds · ship diagram')),
        h('p.small', 'Pulsa una zona del buque para insertar su localización precisa en tu mensaje (forward/aft, port/starboard).'),
        h('div.scene', diag));
    } else {
      mount(stationBox, h('div.panel-head', h('h4', icon('doc'), `${stt.en}`)), h('div#docs'));
    }
  }

  function drawTarget() {
    if (!radar) return;
    const c = picture(st.lab).contacts.find((x) => x.id === selectedTarget);
    mount(tgtBox, targetCard(c));
  }

  function insertTargetReport() {
    const c = picture(st.lab).contacts.find((x) => x.id === selectedTarget) || picture(st.lab).contacts[0];
    if (!c) return;
    radioEl.insert(`Radar shows ${c.ais ? 'vessel ' + c.name : 'a target not transmitting AIS'} on bearing ${String(Math.round(c.bearing)).padStart(3, '0')} degrees, range ${c.range.toFixed(1)} nautical miles. CPA ${c.cpa.toFixed(1)} nautical miles. `);
  }

  function drawInstruments() {
    const stt = station();
    const lab = st.lab;
    const canHelm = !session.spectating && HELM_ROLES.includes(role()?.id) && stt.id === 'bridge';
    if (stt.id === 'ecr') {
      const ecr = stationBox.querySelector('#ecr');
      if (ecr) mount(ecr, enginePanel(lab));
      mount(instruments, h('div.panel-head', h('h4', icon('wheel'), 'Bridge repeaters')), conningPanel(lab, { canHelm: false, onOrder: () => {} }));
    } else if (['office', 'port'].includes(stt.id)) {
      const docs = stationBox.querySelector('#docs');
      if (docs) mount(docs, docsPanel(lab, st.events));
      mount(instruments, h('div.panel-head', h('h4', icon('engine'), 'Ship status (remote)')), enginePanel(lab));
    } else if (['vts', 'mrcc'].includes(stt.id)) {
      mount(instruments, h('div.panel-head', h('h4', icon('ship'), 'Tracked vessels')), h('table', h('tbody',
        [{ ...picture(lab).own, name: lab.ownShip.name, own: true }, ...picture(lab).contacts].map((c) => h('tr',
          h('td', h('b', c.own ? c.name : c.ais ? c.name : 'NO AIS')), h('td.mono', `${String(Math.round(c.course || 0)).padStart(3, '0')}°`), h('td.mono', `${(c.speed || 0).toFixed(1)} kn`), h('td.small', c.own ? 'EXERCISE SHIP' : c.type || ''))))));
    } else {
      mount(instruments, h('div.panel-head', h('h4', icon('wheel'), 'Conning')), conningPanel(lab, { canHelm, onOrder: helmOrder }));
    }
  }

  async function helmOrder(o) {
    const lab = st.lab;
    const patch = {};
    if (o.course != null) patch.course = o.course;
    if (o.speed != null) patch.speed = o.speed;
    await api.updateLab(lab.id, { ownShip: reanchor(lab.ownShip, patch) });
    const what = o.telegraph ? `engine telegraph ${o.telegraph} (${o.speed} kn)` : o.course != null ? `course altered to ${String(Math.round(o.course)).padStart(3, '0')}°` : `speed set to ${o.speed} kn`;
    await api.sendComm(lab.id, { kind: 'system', channel: 'SYS', from: 'BRIDGE', fromUid: 'system', text: `⎈ ${lab.ownShip.name}: ${what} — by ${me()?.name}` });
    sfx.click();
  }

  // ----- right: radio
  const stt0 = station();
  const radioEl = radioPanel(session, {
    channels: [...new Set([...stt0.channels.map(String), '16', '13', 'VTS', 'INT', 'PHONE'])],
    defaultChannel: String(stt0.channels[0]),
    teacherVoices: (m) => speak(m.text, { persona: m.persona || m.from }),
  });
  const voiceToggle = h('label.check.small', h('input', { type: 'checkbox', checked: voices, onchange: (e) => { voices = e.target.checked; localStorage.setItem('mesim10:voices', voices ? 'on' : 'off'); if (!voices) stopSpeaking(); } }), h('span', 'Voces de estaciones (TTS)'));
  right.append(h('div.panel', { style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } },
    h('div.panel-head', h('h4', icon('radio'), 'VHF / comunicaciones'), voiceToggle), radioEl));

  // ----- status bar
  function drawStatus() {
    mount(status, statusBar(st.lab, me(), {
      onRaise: session.spectating ? null : raiseEvent,
      onLog: session.spectating ? null : () => openLogbook(session),
      extra: [
        (() => { const si = safetyIndex({ events: st.events, comms: st.comms, crew: st.crew.filter(session.online) }); return h('div.row', { title: 'Índice de seguridad del buque (equipo): baja si las alarmas no se reconocen o nadie responde por radio a tiempo.', style: { gap: '8px' } }, h('div.safety-ring', { style: { '--v': si.score, '--c': safetyColor(si.score), width: '48px', height: '48px' } }, h('b', { style: { fontSize: '.9rem' } }, si.score)), h('span.small', 'Seguridad')); })(),
        h('button.btn.small', { onclick: saveToPortfolio, disabled: session.spectating }, icon('folder'), 'Portafolio'),
        h('button.btn.small.ghost', { title: 'Cambiar de puesto', onclick: async () => { if (session.spectating) return; await api.removeCrew(st.lab.id, user.uid); location.reload(); } }, icon('users')),
        (st.lab.status === 'ended' || st.lab.peerReview) && !session.spectating ? h('button.btn.small.primary', { onclick: peerReview }, icon('chat'), 'Evaluar a un compañero') : null,
      ],
    }));
  }

  // ----- alarms & effects
  function syncAlarms(added = []) {
    for (const e of st.events) {
      if (e.status !== 'active' && e.alarm) stopAlarm(e.id);
    }
    for (const e of added) {
      if (e.status !== 'active') continue;
      if (Date.now() - e.ts > 60000) continue; // don't ring for old events on reload
      sfx.notify();
      if (e.alarm && !(e.acks || {})[session.viewer] && !session.spectating) startAlarm(e.id, e.alarm);
      if (e.severity === 'distress' || e.severity === 'urgency') { document.body.classList.remove('flash-red'); void document.body.offsetWidth; document.body.classList.add('flash-red'); }
      toast(`${SEVERITY[e.severity]?.es?.toUpperCase()}: ${e.titleEs}`, e.severity === 'distress' ? 'error' : 'warn', 6000);
    }
    const anyDistress = st.events.some((e) => e.status === 'active' && (e.severity === 'distress' || e.severity === 'urgency'));
    ocean?.setMood({ alarm: anyDistress ? 1 : 0, fog: st.lab.world?.fog ? 1 : 0, sea: st.lab.world?.seaState ?? 3 });
  }
  async function ack(e) {
    acked[e.id] = Date.now();
    stopAlarm(e.id);
    sfx.click();
    await api.updateEvent(st.lab.id, e.id, { acks: { [session.viewer]: Date.now() } });
    drawLeft();
  }

  // Local CPA guard alarm and BNWAS for bridge watchkeepers.
  const guard = setInterval(() => {
    if (session.spectating) return;
    const stt = station();
    if (!['bridge', 'vessel2'].includes(stt.id)) return;
    const danger = picture(st.lab).contacts.find((c) => c.cpa < 0.4 && c.tcpa > 0 && c.tcpa < 12);
    if (danger && !acked['cpa:' + danger.id]) {
      if (!document.getElementById('cpa-alert')) {
        startAlarm('cpa', 'collision');
        toast(`CPA/TCPA ALARM — ${danger.ais ? danger.name : 'radar target'}: CPA ${danger.cpa.toFixed(2)} NM in ${danger.tcpa.toFixed(0)} min`, 'error', 8000);
        const btn = h('button.btn.danger.small#cpa-alert', { onclick: () => { acked['cpa:' + danger.id] = Date.now(); stopAlarm('cpa'); btn.remove(); } }, 'ACK CPA ALARM');
        status.querySelector('.statusbar')?.append(btn);
      }
    } else stopAlarm('cpa');
    if (HELM_ROLES.includes(role()?.id) && Date.now() - lastActivity > 12 * 60000) {
      startAlarm('bnwas', 'bnwas');
      toast('BNWAS: confirma que estás de guardia (mueve el ratón o pulsa una tecla).', 'warn', 6000);
      lastActivity = Date.now() - 11 * 60000;
    }
  }, 2000);
  const activity = () => { lastActivity = Date.now(); stopAlarm('bnwas'); };
  window.addEventListener('pointerdown', activity);
  window.addEventListener('keydown', activity);

  // NPC voice
  const unsubs = [];
  unsubs.push(session.on('comms', ({ added } = {}) => {
    drawLeft();
    for (const m of added || []) {
      if (m.kind === 'npc' && voices && Date.now() - m.ts < 20000) speak(m.text, { persona: m.persona || m.from });
      if (m.kind === 'whisper' && m.toUid === session.viewer) { sfx.notify(); toast('🔒 Docente: ' + m.text, 'info', 9000); }
    }
  }));
  unsubs.push(session.on('events', ({ added } = {}) => { drawLeft(); syncAlarms(added); }));
  let lastStation = station().id;
  let endedNotified = st.lab.status === 'ended';
  unsubs.push(session.on('lab', () => {
    if (st.lab.status === 'ended' && !endedNotified) { endedNotified = true; toast('La sesión ha finalizado. Guarda tu trabajo en el portafolio y evalúa a un compañero.', 'info', 8000); }
    setAmbientWeather(st.lab.world?.seaState ?? 3);
    drawStatus(); drawLeft(); drawInstruments();
  }));
  unsubs.push(session.on('crew', () => {
    if (station().id !== lastStation) { lastStation = station().id; buildStation(); }
    drawStatus();
  }));

  const tick = setInterval(() => { drawStatus(); drawInstruments(); drawTarget(); }, 2500);

  // initial
  buildStation();
  drawStatus(); drawLeft(); drawInstruments();
  syncAlarms([]);
  startAmbient(0.6);
  unsubs.push(api.watchGlossary((terms) => setGlossaryIndex(terms)));

  // ----- peer review (formative, anonymous to the class, visible to the teacher)
  function peerReview() {
    const others = st.crew.filter((c) => c.uid !== session.viewer).sort((a, b) => a.uid.localeCompare(b.uid));
    if (!others.length) return toast('No hay compañeros que evaluar.', 'warn');
    const sorted = st.crew.map((c) => c.uid).sort();
    const peer = others.find((c) => c.uid === sorted[(sorted.indexOf(session.viewer) + 1) % sorted.length]) || others[0];
    const samples = st.comms.filter((m) => m.fromUid === peer.uid && ['radio', 'intercom'].includes(m.kind)).slice(-3);
    const rv = { clarity: 0, procedure: 0, precision: 0 };
    const crit = [['clarity', 'Claridad del mensaje'], ['procedure', 'Procedimiento SMCP (llamada, marcadores, Over)'], ['precision', 'Precisión de datos (horas, posiciones, unidades)']];
    const comment = h('textarea', { rows: 3, placeholder: 'One thing they did well + one concrete improvement (English or Spanish).' });
    modal({
      title: `Evaluación entre iguales — ${roleById(peer.roleId)?.en || 'compañero'}`,
      wide: true,
      body: h('div',
        h('p.small', 'Tu evaluación llega a tu compañero/a sin tu nombre; el docente sí la ve. Sé concreto y respetuoso.'),
        samples.length ? samples.map((m) => messageEl(m, { viewer: 'none', showAnalysis: false })) : h('p.muted', 'Aún no ha transmitido nada.'),
        crit.map(([k, label]) => h('div', { style: { margin: '10px 0' } }, h('b', label), h('div.row', [1, 2, 3, 4].map((v) => h('button.chip', { onclick: (e) => { rv[k] = v; [...e.target.parentNode.children].forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); } }, String(v)))))),
        field('Comentario', comment)),
      actions: [{ label: 'Enviar evaluación', kind: 'primary', onClick: async () => {
        if (!rv.clarity || !rv.procedure || !rv.precision || !comment.value.trim()) { toast('Completa los tres criterios y el comentario.', 'warn'); return false; }
        await session.send({ text: comment.value.trim(), channel: 'REVIEW', kind: 'review', whisperTo: peer.uid, review: rv, fromName: 'Peer' });
        sfx.success(); toast('Evaluación enviada. ¡Gracias!', 'success');
      } }],
    });
  }

  // ----- raise event (students create events)
  function raiseEvent() {
    const r = role();
    const pool = eventsForScenario(st.lab.scenarioId).filter((e) => (e.tasks || []).some((t) => roleMatches(t.who, r)));
    const custom = h('textarea', { rows: 3, placeholder: 'Describe lo que observas (en inglés): what, where, when.' });
    const sev = h('select', ['routine', 'safety', 'urgency', 'distress'].map((s) => h('option', { value: s }, SEVERITY[s].es)));
    const { close } = modal({
      title: 'Notificar un evento a toda la tripulación',
      wide: true,
      body: h('div',
        h('p.small', 'Lo que notifiques aparecerá como alarma para el resto de puestos y quedará registrado. Úsalo para informar de algo que «ves» en tu puesto.'),
        h('div.event-grid', pool.map((e) => h('button.event-btn.' + e.severity, { onclick: async () => {
          await fireEvent(st.lab, { eventId: e.id, by: { uid: user.uid, name: me()?.name, role: r?.en }, applyFx: false });
          sfx.notify(); close(); toast('Evento notificado.', 'success');
        } }, h('b', e.es), h('span.small', e.en)))),
        h('hr'),
        h('h4', 'Observación propia'),
        field('Descripción', custom), field('Gravedad', sev),
        h('button.btn.warn', { onclick: async () => {
          if (!custom.value.trim()) return;
          await fireEvent(st.lab, { custom: { title: 'Report from ' + (r?.en || 'crew'), en: 'Report from ' + (r?.en || 'crew'), es: 'Aviso de ' + (r?.es || 'tripulante'), description: custom.value.trim(), severity: sev.value, alarm: sev.value === 'distress' ? 'general' : sev.value === 'urgency' ? 'caution' : null, tasks: [{ who: '*', task: 'Acknowledge the report and decide what to communicate next.' }] }, by: { uid: user.uid, name: me()?.name, role: r?.en }, applyFx: false });
          close(); toast('Observación notificada.', 'success');
        } }, icon('flag'), 'Notificar observación')),
    });
  }

  async function saveToPortfolio() {
    const reflection = h('textarea', { rows: 5, placeholder: 'What did you communicate well? What will you do differently next time? (English or Spanish)' });
    modal({
      title: 'Guardar esta sesión en tu portafolio',
      body: h('div', h('p.small', 'Se guardan tus transmisiones, entradas de diario, estadísticas y tu reflexión.'), field('Reflexión', reflection)),
      actions: [{ label: 'Guardar', kind: 'primary', onClick: async () => {
        const report = buildSessionReport({ lab: st.lab, crew: st.crew, comms: st.comms, events: st.events, focusUid: session.viewer });
        await api.addPortfolioEntry(session.viewer, {
          type: 'lab',
          title: `${st.lab.title || 'Communication Lab'} — ${role()?.en || ''}`,
          labId: st.lab.id,
          roleId: me()?.roleId,
          careerId: me()?.careerId,
          stats: participantStats(myMsgs()),
          transcript: myMsgs().map((m) => ({ ts: m.ts, channel: m.channel, to: m.to, text: m.text, spoken: m.spoken, issues: (m.analysis?.issues || []).map((i) => i.code) })),
          reflection: reflection.value.trim(),
          reportMarkdown: report.markdown,
        });
        sfx.success();
        toast('Guardado en tu portafolio.', 'success');
      } }],
    });
  }

  return () => {
    unsubs.forEach((u) => u());
    clearInterval(tick); clearInterval(guard);
    window.removeEventListener('pointerdown', activity);
    window.removeEventListener('keydown', activity);
    radar?.destroy();
    radioEl.destroy?.();
  };
}

export { messageEl, careerById, ROLES };
