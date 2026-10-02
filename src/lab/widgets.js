// Reusable UI blocks for the Communication Lab (student and teacher consoles).
import { h, mount, icon, toast, modal } from '../core/dom.js';
import { hhmm, debounce, escapeHtml, fmtDuration } from '../core/util.js';
import { MARKERS, CHANNELS, PHRASEBANK, structureById } from '../data/smcp.js';
import { SEVERITY, tasksForRole, eventById } from '../data/events.js';
import { roleById, careerById } from '../data/careers.js';
import { scenarioById } from '../data/scenarios.js';
import { analyze, goalProgress } from '../ai/analyzer.js';
import { createPTT, sttSupported } from '../core/speech.js';
import { picture, shipClock, latLonText, engineReadings } from '../sim/engine.js';
import { sfx } from '../core/audio.js';
import { stationName } from '../ai/npc.js';

const markerColor = Object.fromEntries(MARKERS.map((m) => [m.id, m.color]));

// ---------- glossary in context ----------
let glossRe = null;
let glossMap = new Map();
const MARKER_WORDS = new Set(MARKERS.map((m) => m.id.toLowerCase()));
/** Feed the collaborative glossary so technical terms are highlighted in messages with their Spanish meaning. */
export function setGlossaryIndex(terms = []) {
  const usable = terms.filter((t) => t.term && t.term.length >= 3 && !MARKER_WORDS.has(t.term.toLowerCase())).sort((a, b) => b.term.length - a.term.length).slice(0, 400);
  glossMap = new Map(usable.map((t) => [t.term.toLowerCase(), t]));
  glossRe = usable.length ? new RegExp(`\\b(${usable.map((t) => escapeHtml(t.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi') : null;
}
function highlightGlossary(html) {
  if (!glossRe) return html;
  return html.replace(glossRe, (w) => {
    const t = glossMap.get(w.toLowerCase());
    if (!t) return w;
    return `<abbr class="gloss" title="${escapeHtml(`${t.term} = ${t.es || ''}${t.def ? ' — ' + t.def : ''}`)}">${w}</abbr>`;
  });
}

// ---------- message ----------
export function messageEl(m, { viewer, showAnalysis = true, onPlay, extra } = {}) {
  const mine = m.fromUid === viewer;
  const cls = ['msg', mine ? 'mine' : '', m.kind === 'npc' ? 'npc' : '', m.kind === 'system' ? 'system' : '', m.kind === 'whisper' ? 'whisper' : '',
    /\b(mayday|pan[- ]?pan)\b/i.test(m.text) ? 'distress' : '', m.kind === 'review' ? 'whisper' : ''].filter(Boolean).join('.');
  const textHtml = highlightGlossary(escapeHtml(m.text)).replace(/\b(INSTRUCTION|ADVICE|WARNING|INFORMATION|QUESTION|ANSWER|REQUEST|INTENTION)\b/g,
    (x) => `<b style="color:${markerColor[x]}">${x}</b>`);
  const a = m.analysis;
  return h('div.' + cls, { dataset: { id: m.id } },
    h('div.meta',
      h('span.mono', hhmm(new Date(m.ts))),
      m.channel && m.kind !== 'system' ? h('span.badge', m.channel === 'LOG' ? 'LOG' : m.channel === 'INT' ? 'INT' : 'CH ' + m.channel) : null,
      h('span.who', m.kind === 'whisper' ? '🔒 ' + (m.from || '') : m.from || ''),
      m.to ? h('span', '→ ' + m.to) : null,
      m.spoken ? h('span', { title: 'Transmitido por voz' }, '🎙') : null,
      m.kind === 'npc' && m.aiProvider ? h('span.dim', { title: m.aiModel || '' }, m.aiProvider === 'local' ? 'SMCP-engine' : m.aiProvider === 'gemini' ? 'Gemini' : 'Claude') : null,
      m.kind === 'npc' && onPlay ? h('button.icon-btn', { style: { width: '26px', height: '26px' }, title: 'Escuchar', onclick: () => onPlay(m) }, icon('sound')) : null),
    h('div.text', { html: textHtml }),
    showAnalysis && a && (mine || viewer === 'teacher') ? h('div.tags',
      Object.keys(a.structures || {}).filter((k) => k !== 'past_simple' || (a.structures[k] || []).length).slice(0, 8).map((k) => h('span.badge', { title: (a.structures[k] || []).join(' · ') }, structureById(k)?.es.split(' (')[0] || k))) : null,
    showAnalysis && a?.issues?.length && (mine || viewer === 'teacher') ? h('div.issues', a.issues.slice(0, 3).map((i) => h('div', '⚠ ' + i.es))) : null,
    extra || null);
}

// ---------- status bar ----------
export function statusBar(lab, me, { onRaise, onLog, onHelp, extra = [] } = {}) {
  const sc = scenarioById(lab.scenarioId);
  const role = roleById(me?.roleId);
  const w = lab.world || {};
  const own = lab.ownShip || {};
  const cell = (label, value, cls = '') => h('div.cell' + cls, h('small', label), h('b', value));
  return h('div.statusbar',
    cell('Ship\'s time', shipClock(lab), '.clock'),
    cell(role?.station && ['vts', 'mrcc', 'port', 'office'].includes(role.station) ? 'Estación' : 'Buque', role?.station && ['vts', 'mrcc', 'port', 'office'].includes(role.station) ? stationName(lab, role.station === 'office' ? 'company' : role.station) : own.name),
    cell('Puesto', role ? role.en : 'Instructor'),
    cell('Rumbo/Vel', `${String(Math.round(own.course || 0)).padStart(3, '0')}° / ${(own.speed || 0).toFixed(1)} kn`),
    cell('Viento', `${String(w.windDir ?? 0).padStart(3, '0')}° ${w.wind ?? 0} kn`),
    cell('Visibilidad', `${w.visibility ?? '—'} NM${w.fog ? ' · FOG' : ''}`),
    cell('Mar', `SS ${w.seaState ?? '—'}`),
    cell('GNSS', w.gnss === false ? 'NO FIX' : 'OK'),
    own.signal ? cell('Señal', own.signal) : null,
    own.list ? cell('Escora', `${own.list}° STBD`) : null,
    h('div.grow'),
    ...extra,
    onLog ? h('button.btn.small', { onclick: onLog }, icon('log'), 'Diario') : null,
    onHelp ? h('button.btn.small', { onclick: onHelp }, icon('book'), 'SMCP') : null,
    onRaise ? h('button.btn.small.warn', { onclick: onRaise }, icon('flag'), 'Notificar evento') : null);
}

// ---------- alarms ----------
export function alarmBanner(events, roleId, { onAck, acked = {} } = {}) {
  const active = events.filter((e) => e.status === 'active').sort((a, b) => (SEVERITY[b.severity]?.rank || 0) - (SEVERITY[a.severity]?.rank || 0));
  if (!active.length) return h('div.alarm-banner.routine', icon('check', 'lg'), h('div.grow', h('h3', 'Sin alarmas activas'), h('span.small', 'Mantén la escucha en tus canales.')));
  const top = active[0];
  return h('div.col', active.slice(0, 3).map((e) => h('div.alarm-banner.' + e.severity,
    icon(e.alarm === 'fire' ? 'fire' : e.severity === 'distress' ? 'sos' : 'alarm', 'lg'),
    h('div.grow', h('h3', (e.titleEs || e.title).toUpperCase()), h('div.small', e.situation)),
    onAck && !acked[e.id] ? h('button.btn.small' + (e === top ? '.danger' : ''), { onclick: () => onAck(e) }, 'ACK') : h('span.badge', '✓ ACK'))));
}

// ---------- tasks & goals ----------
export function tasksPanel(lab, events, me, myMessages) {
  const roleId = me?.roleId;
  const active = events.filter((e) => e.status === 'active');
  const items = [];
  for (const e of active) {
    const tasks = e.custom?.tasks
      ? e.custom.tasks.filter((t) => !t.who || t.who === '*' || t.who === roleId || t.who === roleById(roleId)?.station || t.who === roleById(roleId)?.career).map((t, i) => ({ id: e.id + i, text: t.task, to: t.to, markers: t.markers || [], include: t.include || [] }))
      : tasksForRole(e, roleId, e.vars || {});
    for (const t of tasks) {
      const after = myMessages.filter((m) => m.ts >= e.ts);
      const usedMarkers = new Set(after.flatMap((m) => m.markers || []));
      const done = after.length > 0 && t.markers.every((mk) => usedMarkers.has(mk));
      items.push(h('div.task' + (done ? '.done' : ''),
        h('div.row.between', h('span.badge.sev-' + e.severity, e.titleEs || e.title), done ? h('span.badge.sev-safety', '✓') : null),
        h('div', { style: { marginTop: '6px' } }, t.text),
        t.to ? h('div.to', '→ ' + t.to) : null,
        t.markers.length || t.include.length ? h('div.need',
          t.markers.map((mk) => h('span.badge', { style: { color: markerColor[mk], borderColor: markerColor[mk] } }, mk)),
          t.include.map((x) => h('span.badge', x))) : null));
    }
  }
  return items.length ? items : [h('p.muted', 'Sin tareas de evento. Sigue las instrucciones generales y mantén la escucha.')];
}

export function goalsPanel(goals = [], messages = []) {
  if (!goals.length) return h('p.muted', 'El docente no ha fijado estructuras obligatorias.');
  const prog = goalProgress(messages, goals);
  return h('div', prog.map((g) => h('div.goal' + (g.ok ? '.ok' : ''),
    h('span', structureById(g.id)?.es || g.id), h('b.mono', `${g.total}/${g.count}`),
    h('div.meter', h('i', { style: { width: `${Math.min(100, (g.total / (g.count || 1)) * 100)}%` } })))));
}

// ---------- conning / helm ----------
export const TELEGRAPH = [
  { id: 'FULL', es: 'Full ahead', kn: null },
  { id: 'HALF', es: 'Half ahead', kn: 0.7 },
  { id: 'SLOW', es: 'Slow ahead', kn: 0.45 },
  { id: 'DSLOW', es: 'Dead slow ahead', kn: 0.25 },
  { id: 'STOP', es: 'Stop engine', kn: 0 },
];

export function conningPanel(lab, { canHelm, onOrder }) {
  const own = lab.ownShip || {};
  const service = lab.serviceSpeed || own.serviceSpeed || Math.max(12, own.speed || 12);
  const courseIn = h('input', { type: 'number', min: 0, max: 359, value: Math.round(own.course || 0), style: { fontFamily: 'var(--mono)', fontSize: '1.3rem' } });
  const speedIn = h('input', { type: 'number', min: 0, max: 25, step: 0.5, value: (own.speed || 0).toFixed(1), style: { fontFamily: 'var(--mono)', fontSize: '1.3rem' } });
  const dis = !canHelm;
  return h('div.col',
    h('div.conning',
      gauge('HDG', `${String(Math.round(own.course || 0)).padStart(3, '0')}°`),
      gauge('SOG', `${(own.speed || 0).toFixed(1)} kn`),
      gauge('RUDDER', own.rudderStuck ? `${Math.abs(own.rudderStuck)}° ${own.rudderStuck < 0 ? 'P' : 'S'} ⚠` : 'MID', own.rudderStuck ? true : false),
      gauge('DEPTH', `${lab.world?.depth ?? '—'} m`, (lab.world?.depth ?? 99) < 12),
      gauge('LIST', `${own.list || 0}°`, (own.list || 0) > 5),
      gauge('NAV SIGNAL', own.signal || '—', !!own.signal)),
    h('div.helm',
      h('div', h('small.dim', 'NEW COURSE (°)'), courseIn, h('div', { style: { height: '6px' } }),
        h('button.btn.small', { disabled: dis, style: { width: '100%' }, onclick: () => onOrder({ course: ((+courseIn.value % 360) + 360) % 360 }) }, icon('wheel'), 'Gobernar')),
      h('div', h('small.dim', 'SPEED (kn)'), speedIn, h('div', { style: { height: '6px' } }),
        h('button.btn.small', { disabled: dis, style: { width: '100%' }, onclick: () => onOrder({ speed: Math.max(0, +speedIn.value) }) }, icon('engine'), 'Ordenar'))),
    h('div.telegraph', h('small.dim', 'ENGINE TELEGRAPH'),
      h('div.row', { style: { gap: '4px' } }, TELEGRAPH.map((t) => h('button', {
        disabled: dis, style: { flex: 1 },
        onclick: () => onOrder({ speed: t.kn == null ? service : Math.round(service * t.kn * 10) / 10, telegraph: t.es }),
      }, t.id)))),
    dis ? h('p.small', 'Solo el puente (Capitán u oficiales) puede dar órdenes de gobierno y máquina.') : null);
}

export function gauge(label, value, alarm = false, pct = null) {
  return h('div.gauge' + (alarm ? '.alarm' : ''), h('small', label), h('b', value), pct != null ? h('div.bar', h('i', { style: { width: `${Math.max(0, Math.min(100, pct))}%` } })) : null);
}

export function enginePanel(lab) {
  const r = engineReadings(lab.engine, lab.ownShip);
  const e = lab.engine || {};
  return h('div.conning',
    gauge('M/E RPM', r.rpm.toFixed(0), e.blackout || e.slowdown, r.rpm / 1.2),
    gauge('L.O. PRESS', `${r.loPressure.toFixed(2)} bar`, r.loPressure < 2.5, r.loPressure / 4 * 100),
    gauge('JCW TEMP', `${r.cwTemp.toFixed(0)} °C`, r.cwTemp > 90, r.cwTemp),
    gauge('EXH. GAS', `${r.exhaust.toFixed(0)} °C`, r.exhaust > 450, r.exhaust / 5),
    gauge('GEN LOAD', `${r.genLoad.toFixed(0)} %`, e.blackout || r.genLoad > 92, r.genLoad),
    gauge('BILGE', `${r.bilge.toFixed(0)} %`, r.bilge > 50, r.bilge),
    gauge('FO TEMP', `${r.fuelTemp.toFixed(0)} °C`, false, r.fuelTemp / 1.6),
    gauge('FIRE DET.', e.fire ? 'FIRE' : 'NORMAL', !!e.fire),
    gauge('MAIN POWER', e.blackout ? 'BLACKOUT' : 'ON', !!e.blackout));
}

export function targetCard(c) {
  if (!c) return h('p.small', 'Pulsa un eco del radar para adquirirlo (ARPA) y ver sus datos.');
  return h('div.target-card',
    h('span', 'NAME'), h('b', c.ais ? c.name : 'UNKNOWN (radar only)'),
    h('span', 'TYPE'), h('span', c.ais ? c.type : '—'),
    h('span', 'BRG'), h('span', `${String(Math.round(c.bearing)).padStart(3, '0')}° (${c.side})`),
    h('span', 'RNG'), h('span', `${c.range.toFixed(2)} NM`),
    h('span', 'CSE/SPD'), h('span', `${String(Math.round(c.course)).padStart(3, '0')}° / ${c.speed.toFixed(1)} kn`),
    h('span', 'CPA'), h('b', { style: { color: c.cpa < 0.5 && c.tcpa > 0 ? 'var(--c-danger)' : 'var(--gold)' } }, `${c.cpa.toFixed(2)} NM`),
    h('span', 'TCPA'), h('span', c.tcpa > 0 && c.tcpa < 999 ? `${c.tcpa.toFixed(1)} min` : 'opening'),
    h('span', 'AIS'), h('span', c.ais ? `MMSI ${c.mmsi || '—'}` : 'NOT TRANSMITTING'));
}

// ---------- documents (office / port stations) ----------
export function docsPanel(lab, events) {
  const own = lab.ownShip || {};
  const p = picture(lab);
  const act = events.filter((e) => e.status === 'active');
  return h('div.col',
    h('div.target-card',
      h('span', 'VESSEL'), h('b', own.name), h('span', 'TYPE'), h('span', own.type), h('span', 'CALL SIGN'), h('span', own.callsign),
      h('span', 'MMSI'), h('span', own.mmsi), h('span', 'LOA / DRAUGHT'), h('span', `${own.length} m / ${own.draught} m`),
      h('span', 'POB'), h('span', String(own.pob)), h('span', 'CARGO'), h('span', own.cargo),
      h('span', 'POSITION'), h('span', latLonText(lab, p.own || { px: 0, py: 0 })),
      h('span', 'LIST'), h('b', `${own.list || 0}°`), h('span', 'GM (approx.)'), h('span', `${(1.2 - (own.list || 0) * 0.05).toFixed(2)} m`)),
    h('h4', 'Situación comunicada por el buque'),
    act.length ? act.map((e) => h('div.task', h('b', e.titleEs), h('div.small', e.situation))) : h('p.muted', 'Sin incidencias abiertas.'));
}

// ---------- radio console ----------
export function radioPanel(session, { channels, defaultChannel = '16', compact = false, teacherVoices = null } = {}) {
  const st = session.state;
  let tx = defaultChannel;
  let watch = new Set([...channels.map(String)]);
  let watchAll = false;
  const list = h('div.comms', { 'aria-live': 'polite' });
  const toIn = h('input', { placeholder: 'Destinatario (p. ej. Channel Traffic, Master, Engine Room)', list: 'addr-list' });
  const datalist = h('datalist#addr-list');
  const ta = h('textarea', { placeholder: 'Escribe la transmisión… o mantén pulsado PTT y habla en inglés', rows: 3 });
  const preview = h('div.small', { style: { minHeight: '1.6em' } });
  const thinking = h('span.typing');
  const chanRow = h('div.channels');
  const fromLab = st.lab;

  function addrOptions() {
    const sc = scenarioById(st.lab?.scenarioId);
    const opts = [...Object.values(sc.stations || {}), 'Master', 'Engine Room', 'Bridge', 'All ships', ...(st.lab?.targets || []).filter((t) => t.ais).map((t) => t.name), ...st.crew.map((c) => `${c.name} (${roleById(c.roleId)?.en || ''})`)];
    mount(datalist, [...new Set(opts)].map((o) => h('option', { value: o })));
  }

  function drawChannels() {
    mount(chanRow, CHANNELS.filter((c) => channels.map(String).includes(c.id)).map((c) => {
      const unread = st.comms.some((m) => String(m.channel) === c.id && m.ts > (lastSeenTs[c.id] || 0) && c.id !== tx);
      return h('button.channel' + (tx === c.id ? '.on' : ''), { title: c.es, onclick: () => { tx = c.id; lastSeenTs[c.id] = Date.now(); sfx.squelch(); drawChannels(); drawList(); } }, c.label, unread ? h('span.live') : null);
    }), h('label.check.small', { style: { marginLeft: 'auto' } }, h('input', { type: 'checkbox', checked: watchAll, onchange: (e) => { watchAll = e.target.checked; drawList(); } }), h('span', 'Escucha múltiple')));
  }
  const lastSeenTs = {};

  function drawList() {
    const chs = watchAll ? [...watch] : [tx, '16'];
    const msgs = session.visibleComms(chs).slice(-160);
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    mount(list, msgs.map((m) => messageEl(m, { viewer: session.viewer, onPlay: teacherVoices })));
    if (nearBottom || !list.dataset.init) { list.scrollTop = list.scrollHeight; list.dataset.init = '1'; }
  }

  const doPreview = debounce(() => {
    const t = ta.value.trim();
    if (!t) { mount(preview); return; }
    const a = analyze(t, { channel: tx, roleAuthority: roleById(st.me?.roleId)?.authority });
    mount(preview,
      Object.keys(a.structures).slice(0, 6).map((k) => h('span.badge', { style: { marginRight: '4px' } }, '✓ ' + (structureById(k)?.es.split(' (')[0] || k))),
      a.issues.slice(0, 2).map((i) => h('div', { style: { color: 'var(--c-warn)' } }, '⚠ ' + i.es)));
  }, 350);
  ta.addEventListener('input', doPreview);

  async function doSend(extra = {}) {
    if (session.spectating) return toast('Estás viendo la consola de un estudiante (solo lectura).', 'warn');
    const text = ta.value.trim();
    if (!text) return;
    if (st.lab?.speakingRequired && !extra.spoken && ['16', '13', 'VTS', '12', '70'].includes(tx) && !session.isTeacher) {
      return toast('En esta sesión las transmisiones de radio deben hacerse por voz: mantén pulsado PTT.', 'warn', 5000);
    }
    sfx.radioOut();
    ta.value = '';
    mount(preview);
    await session.send({ text, channel: tx, to: toIn.value.trim(), ...extra });
  }
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });

  // PTT
  const pttBtn = h('button.ptt', { title: 'Mantén pulsado para hablar (barra espaciadora fuera del texto)' }, icon('mic', 'lg'));
  let lastResult = null;
  const ptt = createPTT({
    lang: 'en-GB',
    record: true,
    onInterim: (t) => { ta.value = t; doPreview(); },
    onError: (msg) => toast(msg, 'warn', 6000),
  });
  const down = async (e) => { e.preventDefault(); pttBtn.classList.add('live'); await ptt.start(); };
  const up = async () => {
    if (!ptt.active) return;
    pttBtn.classList.remove('live');
    lastResult = await ptt.stop();
    if (lastResult?.text) {
      ta.value = lastResult.text;
      doPreview();
      if (st.lab?.autoSendVoice !== false) await doSend({ spoken: true, confidence: lastResult.confidence, speechMs: lastResult.durationMs });
    }
  };
  pttBtn.addEventListener('pointerdown', down);
  pttBtn.addEventListener('pointerup', up);
  pttBtn.addEventListener('pointerleave', up);
  const keyDown = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !e.repeat) down(e); };
  const keyUp = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) up(); };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);

  const insert = (txt) => {
    const s = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + txt + ta.value.slice(ta.selectionEnd ?? s);
    ta.focus();
    doPreview();
  };
  const markerBar = h('div.marker-bar', MARKERS.map((m) => h('button.marker', { style: { color: m.color }, title: m.es, onclick: () => insert(m.id + '. ') }, m.id)),
    h('button.marker', { onclick: () => insert('Over.') }, 'OVER'), h('button.marker', { onclick: () => insert('Out.') }, 'OUT'),
    h('button.marker', { onclick: () => insert('Say again. ') }, 'SAY AGAIN'), h('button.marker', { onclick: () => phrasebook(st, insert, toIn.value) }, '📖 FRASES'));

  const unsubs = [
    session.on('comms', ({ added } = {}) => {
      drawList(); drawChannels();
      for (const m of added || []) if (m.fromUid !== session.viewer && (m.kind === 'npc' || m.kind === 'radio') && (watchAll ? watch.has(String(m.channel)) : [tx, '16'].includes(String(m.channel)))) sfx.radioIn();
    }),
    session.on('crew', addrOptions),
    session.on('lab', addrOptions),
    session.on('npcThinking', ({ key, on }) => { thinking.textContent = on ? `${key.split(':')[0].toUpperCase()} is responding…` : ''; }),
  ];
  drawChannels();
  drawList();
  addrOptions();
  void fromLab;

  const el = h('div.radio',
    chanRow, list, thinking,
    compact ? null : markerBar,
    h('div.row', { style: { gap: '8px' } }, h('span.small', 'Para:'), h('div.grow', toIn), datalist),
    h('div.composer', h('div', ta, preview), h('div.col', { style: { gap: '6px', alignItems: 'center' } }, pttBtn,
      h('button.btn.primary.small', { onclick: () => doSend() }, icon('send'), 'TX'))),
    !sttSupported() ? h('p.small', 'Tu navegador no tiene reconocimiento de voz: usa Chrome o Edge para el PTT.') : null);
  el.destroy = () => { unsubs.forEach((u) => u()); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
  el.setChannel = (c) => { tx = String(c); drawChannels(); drawList(); };
  el.insert = insert;
  return el;
}

function phrasebook(st, insert, to) {
  const own = st.lab?.ownShip || {};
  const fillP = (s) => s.replace(/\{ship\}/g, own.name || 'own ship').replace(/\{to\}/g, to || '[station]').replace(/\{cs\}/g, own.callsign || '[call sign]')
    .replace(/\{pob\}/g, String(own.pob || '[number]')).replace(/\{pos\}/g, latLonText(st.lab, picture(st.lab).own || { px: 0, py: 0 }));
  const { close } = modal({
    title: 'Frases SMCP',
    wide: true,
    body: h('div.grid.g2', PHRASEBANK.map((g) => h('div.panel', h('h4', g.es), g.items.map((it) => h('button.option', { onclick: () => { insert(fillP(it)); close(); } }, fillP(it)))))),
  });
}

// ---------- logbook ----------
export function openLogbook(session) {
  const ta = h('textarea', { rows: 4, placeholder: 'At 0154, ... (hora, hecho, lugar, acción)' });
  const mine = session.state.comms.filter((m) => m.kind === 'log' && m.fromUid === session.viewer);
  modal({
    title: 'Diario de navegación (log book)',
    body: h('div',
      h('p.small', 'Entradas privadas que verá tu docente y que irán a tu portafolio. Formato recomendado: hora en 4 cifras + hecho + lugar + acción.'),
      ta,
      h('div', { style: { maxHeight: '260px', overflow: 'auto', marginTop: '12px' } }, mine.map((m) => messageEl(m, { viewer: session.viewer })))),
    actions: [{ label: 'Añadir entrada', kind: 'primary', onClick: async () => { if (ta.value.trim()) { await session.send({ text: ta.value.trim(), channel: 'LOG', kind: 'log' }); toast('Entrada registrada.', 'success'); } } }],
  });
}

export function reactionTime(ev, uid, comms) {
  const first = comms.find((m) => m.fromUid === uid && m.ts >= ev.ts && (m.kind === 'radio' || m.kind === 'intercom'));
  return first ? first.ts - ev.ts : null;
}
export const fmtReaction = (ms) => (ms == null ? '—' : fmtDuration(ms));

export { careerById, eventById };
