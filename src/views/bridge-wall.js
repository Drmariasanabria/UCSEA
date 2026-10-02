// Projector / "bridge wall" view for the classroom screen: big radar, live comms ticker,
// active alarms, crew board and the shared Ship Safety Index.
import { h, mount, icon } from '../core/dom.js';
import { createSession } from '../lab/session.js';
import { createRadar } from '../sim/radar.js';
import { messageEl, setGlossaryIndex } from '../lab/widgets.js';
import { safetyIndex, safetyColor } from '../lab/metrics.js';
import { shipClock } from '../sim/engine.js';
import { roleById, careerById, STATIONS } from '../data/careers.js';
import { scenarioById } from '../data/scenarios.js';
import { SEVERITY } from '../data/events.js';
import { initials } from '../core/util.js';
import { db } from '../backend/index.js';
import { startAlarm, stopAllAlarms, sfx } from '../core/audio.js';

export default async function render(root, { path, user }) {
  const labId = path[1];
  const session = createSession(labId, user, { asUid: 'projector' });
  const st = session.state;
  await session.ready();
  if (!st.lab) { mount(root, h('div.page', h('h2', 'Sesión no encontrada'))); return () => session.destroy(); }
  const canvas = h('canvas');
  const radar = createRadar(canvas, { mode: 'shore', getLab: () => st.lab });
  const head = h('div');
  const alarms = h('div');
  const ticker = h('div.comms.ticker', { style: { flex: 1, maxHeight: 'none' } });
  const crewBox = h('div.grid.g3');
  mount(root, h('div.wall',
    h('div.col', head, h('div.panel', { style: { flex: 1, display: 'grid', placeItems: 'center' } }, h('div.radar-wrap', { style: { width: 'min(100%, calc(100vh - 260px))' } }, canvas)), alarms),
    h('div.col', h('div.panel', { style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }, h('h4', icon('radio'), 'Radio en directo'), ticker), h('div.panel', h('h4', icon('users'), 'Tripulación'), crewBox))));

  const draw = () => {
    const lab = st.lab;
    const si = safetyIndex({ events: st.events, comms: st.comms, crew: st.crew.filter(session.online) });
    mount(head, h('div.panel', h('div.row.between',
      h('div', h('span.eyebrow', `${scenarioById(lab.scenarioId).area} · ${lab.ownShip.name}`), h('h1', lab.title || 'Communication Lab')),
      h('div.row', { style: { gap: '28px' } },
        h('div', h('div.small', 'CÓDIGO'), h('div.big-code', lab.code)),
        h('div', h('div.small', "SHIP'S TIME"), h('div.timer', { style: { fontSize: '2.6rem' } }, shipClock(lab))),
        h('div.safety-ring', { style: { '--v': si.score, '--c': safetyColor(si.score), width: '110px', height: '110px' }, title: 'Índice de seguridad del buque' }, h('b', { style: { fontSize: '2rem' } }, si.score))))));
    const act = st.events.filter((e) => e.status === 'active');
    mount(alarms, act.length ? act.slice(-3).map((e) => h('div.alarm-banner.' + e.severity, icon('alarm', 'lg'), h('div', h('h3', `${SEVERITY[e.severity].es.toUpperCase()} · ${e.titleEs}`), h('div', e.situation)))) : h('div.alarm-banner.routine', icon('check', 'lg'), h('h3', 'Sin alarmas activas')));
    const online = st.crew.filter(session.online);
    mount(crewBox, online.map((c) => h('div.row', h('div.avatar', { style: { background: careerById(c.careerId)?.color } }, initials(c.name)),
      h('div', h('b', c.name), h('div.small', `${roleById(c.roleId)?.en || ''} · ${STATIONS[roleById(c.roleId)?.station]?.es || ''}`)))));
  };
  const drawTicker = () => {
    mount(ticker, st.comms.filter((m) => ['radio', 'npc', 'system', 'intercom'].includes(m.kind)).slice(-14).map((m) => messageEl(m, { viewer: 'projector', showAnalysis: false })));
    ticker.scrollTop = ticker.scrollHeight;
  };
  const unsubs = [
    session.on('lab', draw), session.on('crew', draw),
    session.on('comms', () => { drawTicker(); draw(); }),
    session.on('events', ({ added } = {}) => { draw(); for (const e of added || []) if (Date.now() - e.ts < 30000) { sfx.notify(); if (e.alarm) startAlarm('wall' + e.id, e.alarm); setTimeout(stopAllAlarms, 6000); } }),
    db().watchGlossary((t) => setGlossaryIndex(t)),
  ];
  draw(); drawTicker();
  const tick = setInterval(draw, 5000);
  return () => { unsubs.forEach((u) => u()); clearInterval(tick); radar.destroy(); session.destroy(); stopAllAlarms(); };
}
