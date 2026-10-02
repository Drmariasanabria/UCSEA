// Live session controller shared by the student console and the teacher console.
// Subscribes to the lab, crew, comms and events; sends messages; triggers NPC replies;
// keeps presence; exposes derived state.
import { db } from '../backend/index.js';
import { Emitter } from '../core/store.js';
import { analyze } from '../ai/analyzer.js';
import { npcReply } from '../ai/ai.js';
import { resolveAddressee, isCoveredByHuman, PERSONAS, stationName } from '../ai/npc.js';
import { roleById, STATIONS } from '../data/careers.js';

export const ONLINE_MS = 45000;

export function createSession(labId, user, { asUid = null, isHost = false } = {}) {
  const api = db();
  const em = new Emitter();
  const s = { lab: null, crew: [], comms: [], events: [], me: null, ready: false };
  const viewer = asUid || user.uid;
  const unsubs = [];
  const pendingReplies = new Set();
  const got = { lab: false, crew: false };
  let resolveReady;
  const readyP = new Promise((r) => { resolveReady = r; });
  const mark = (k) => { got[k] = true; if (got.lab && got.crew) resolveReady(); };

  unsubs.push(api.watchLab(labId, (lab) => { s.lab = lab; mark('lab'); emit('lab'); }));
  unsubs.push(api.watchCrew(labId, (crew) => {
    s.crew = crew;
    s.me = crew.find((c) => c.uid === viewer) || null;
    mark('crew');
    emit('crew');
  }));
  unsubs.push(api.watchComms(labId, (comms) => {
    const before = s.comms.length;
    s.comms = comms;
    emit('comms', { added: comms.slice(before) });
  }));
  unsubs.push(api.watchEvents(labId, (events) => {
    const prevIds = new Set(s.events.map((e) => e.id));
    s.events = events;
    emit('events', { added: events.filter((e) => !prevIds.has(e.id)) });
  }));

  function emit(what, payload) {
    if (!s.ready && s.lab) s.ready = true;
    em.emit(what, payload);
    em.emit('change', what);
  }

  // Presence heartbeat (only for real participants, not spectators).
  let beat = null;
  if (!asUid) {
    beat = setInterval(() => {
      if (s.me) api.updateCrew(labId, user.uid, { lastSeen: Date.now() }).catch(() => {});
      if (isHost && s.lab) api.updateLab(labId, { hostSeen: Date.now() }).catch(() => {});
    }, 20000);
  }

  const online = (c) => Date.now() - (c.lastSeen || 0) < ONLINE_MS;

  function visibleComms(channels = null) {
    return s.comms.filter((m) => {
      if (m.kind === 'whisper') return m.toUid === viewer || m.fromUid === viewer || user.role === 'teacher' && !asUid;
      if (m.kind === 'review') return m.toUid === viewer || m.fromUid === viewer || (user.role === 'teacher' && !asUid);
      if (m.kind === 'log') return m.fromUid === viewer || (user.role === 'teacher' && !asUid);
      if (m.kind === 'system' || !channels) return true;
      return channels.includes(String(m.channel));
    });
  }

  async function join(member) {
    await api.joinLab(labId, { uid: user.uid, name: user.name, email: user.email || '', ...member, lastSeen: Date.now() });
  }

  /**
   * Send a transmission. opts: { text, channel, to, kind, spoken, confidence, audioUrl, whisperTo }
   */
  async function send(opts) {
    const lab = s.lab;
    const me = s.me;
    const role = roleById(me?.roleId);
    const text = String(opts.text || '').trim();
    if (!text) return null;
    const channel = String(opts.channel || '16');
    const kind = opts.kind || (['INT', 'UHF'].includes(channel) ? 'intercom' : channel === 'LOG' ? 'log' : 'radio');
    const analysis = analyze(text, { channel, roleAuthority: role?.authority });
    const msg = await api.sendComm(labId, {
      kind,
      channel,
      from: opts.fromName || (me ? `${me.name} · ${role?.en || ''}` : user.name),
      fromName: me?.name || user.name,
      fromUid: user.uid,
      fromRoleId: me?.roleId || (user.role === 'teacher' ? 'instructor' : null),
      fromStation: role?.station || null,
      to: opts.to || '',
      toUid: opts.whisperTo || null,
      text,
      markers: analysis.markers,
      analysis: { structures: analysis.structures, issues: analysis.issues, words: analysis.words, markers: analysis.markers },
      spoken: !!opts.spoken,
      confidence: opts.confidence ?? null,
      speechMs: opts.speechMs ?? null,
      review: opts.review || null,
      eventRef: opts.eventRef || null,
    });
    if (kind === 'radio' || kind === 'intercom') maybeNpcReply(msg).catch((e) => console.error('[npc]', e));
    return msg;
  }

  // Decide whether an NPC station must answer this transmission and produce the reply.
  async function maybeNpcReply(msg) {
    const lab = s.lab;
    if (!lab || lab.status === 'ended') return;
    const key = resolveAddressee(lab, msg.text, msg.to, msg.channel);
    if (!key) return;
    if (isCoveredByHuman(key, s.crew.filter(online))) return; // a student plays that station
    const mode = lab.ai?.mode || 'auto';
    if (mode !== 'auto') {
      await api.updateComm(labId, msg.id, { needsReply: key, aiStatus: mode === 'approve' ? 'draft-requested' : 'manual' });
      return;
    }
    if (pendingReplies.has(msg.id)) return;
    pendingReplies.add(msg.id);
    em.emit('npcThinking', { key, on: true });
    try {
      const reply = await generateReply(msg, key);
      await new Promise((r) => setTimeout(r, 600 + Math.min(2200, reply.text.length * 12))); // realistic radio delay
      await postNpc(key, reply, msg);
    } finally {
      em.emit('npcThinking', { key, on: false });
    }
  }

  async function generateReply(msg, key) {
    const lab = s.lab;
    const role = roleById(s.me?.roleId);
    const shoreSender = role && ['vts', 'mrcc', 'port', 'office'].includes(role.station);
    return npcReply({
      lab,
      personaKey: key,
      events: s.events,
      history: s.comms.filter((m) => m.kind === 'radio' || m.kind === 'npc' || m.kind === 'intercom').slice(-20),
      sender: { name: msg.fromName, roleId: msg.fromRoleId, ship: shoreSender ? stationName(lab, role.station === 'office' ? 'company' : role.station) : lab.ownShip?.name },
      text: msg.text,
      channel: msg.channel,
    });
  }

  async function postNpc(key, reply, inReplyTo) {
    const lab = s.lab;
    const [base, id] = key.split(':');
    const target = id && id !== 'nearest' ? (lab.targets || []).find((t) => t.id === id) : null;
    const name = target?.name || stationName(lab, base) || PERSONAS[base]?.label || key;
    await api.sendComm(labId, {
      kind: 'npc',
      channel: inReplyTo?.channel || '16',
      from: name,
      fromUid: 'npc:' + base,
      persona: base,
      text: reply.text,
      replyTo: inReplyTo?.id || null,
      aiProvider: reply.provider,
      aiModel: reply.model || null,
    });
    if (inReplyTo) api.updateComm(labId, inReplyTo.id, { replied: true, aiStatus: 'answered' }).catch(() => {});
  }

  return {
    state: s,
    ready: () => Promise.race([readyP, new Promise((r) => setTimeout(r, 6000))]),
    on: (e, fn) => em.on(e, fn),
    online,
    visibleComms,
    join,
    send,
    generateReply,
    postNpc,
    isTeacher: user.role === 'teacher',
    viewer,
    spectating: !!asUid,
    stationOf: (m) => STATIONS[roleById(m?.roleId)?.station],
    destroy() { unsubs.forEach((u) => { try { u(); } catch { /* noop */ } }); clearInterval(beat); },
  };
}
