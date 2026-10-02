// Scenario director: fires catalogue/custom events, resolves them, runs the random-event
// generator and the teacher's timeline. Runs in the teacher console (the "host").
import { db } from '../backend/index.js';
import { EVENTS, eventById, fill, SEVERITY } from '../data/events.js';
import { scenarioById } from '../data/scenarios.js';
import { applyEffects, revertEffects } from './engine.js';
import { pick } from '../core/util.js';

// Events that make no sense while the ship is alongside.
const AT_SEA_ONLY = new Set(['close_quarters', 'dark_tow', 'gnss_failure', 'grounding_risk', 'steering_failure', 'mob', 'mayday_relay', 'bnwas', 'piracy', 'crane_barge_traffic', 'cargo_shift', 'restricted_visibility', 'oil_sighting']);
const ALONGSIDE_ONLY = new Set(['bunker_spill', 'psc_inspection', 'berth_delay', 'loose_lashings']);

export function eventsForScenario(scenarioId) {
  const alongside = scenarioId === 'alongside_bunkering';
  return EVENTS.filter((e) => (alongside ? !AT_SEA_ONLY.has(e.id) : !ALONGSIDE_ONLY.has(e.id) || e.id === 'loose_lashings'));
}

export function npcName(lab, key, vars = {}) {
  const st = scenarioById(lab.scenarioId).stations || {};
  if (key === 'tug') return vars.tug || st.tug;
  if (key === 'distressed') return vars.vessel || 'Distressed vessel';
  return st[key] || key;
}

export function eventVars(lab, def, vars = {}) {
  return { ship: lab.ownShip?.name || 'own ship', ...(def?.vars || {}), ...vars };
}

/**
 * Fire an event (catalogue id or custom definition) into a live lab.
 * by: { uid, name, role } of who triggered it (teacher, student, director).
 */
export async function fireEvent(lab, { eventId, custom, vars = {}, by = {}, silentBroadcast = false, applyFx = true }) {
  const api = db();
  const def = custom || eventById(eventId);
  if (!def) throw new Error('Unknown event ' + eventId);
  const v = eventVars(lab, def, vars);
  const { patch, notes } = applyFx ? applyEffects(lab, def.effects, v) : { patch: {}, notes: [] };
  if (Object.keys(patch).length) await api.updateLab(lab.id, patch);
  const ev = await api.addEvent(lab.id, {
    eventId: custom ? null : def.id,
    custom: custom || null,
    title: custom ? custom.en || custom.title : def.en,
    titleEs: custom ? custom.es || custom.title : def.es,
    severity: def.severity || 'safety',
    alarm: def.alarm || null,
    category: def.category || 'safety',
    situation: fill(def.situation || custom?.description || '', v),
    vars: v,
    by: { uid: by.uid || 'director', name: by.name || 'Director', role: by.role || 'system' },
    status: 'active',
    effectsApplied: applyFx,
  });
  await api.sendComm(lab.id, {
    kind: 'system', channel: 'SYS', from: 'SYSTEM', fromUid: 'system',
    text: `⚑ ${SEVERITY[ev.severity]?.es?.toUpperCase() || 'EVENTO'} — ${ev.titleEs}: ${ev.situation}${notes.length ? ' (' + notes.join(', ') + ')' : ''}`,
    eventRef: ev.id,
  });
  if (def.broadcast && !silentBroadcast) {
    const b = def.broadcast;
    await api.sendComm(lab.id, {
      kind: 'npc', channel: String(b.channel), from: npcName(lab, b.from, v), fromUid: 'npc:' + b.from, persona: b.from,
      text: fill(b.text, v), eventRef: ev.id,
    });
  }
  return ev;
}

export async function resolveEvent(lab, ev, by = {}) {
  const api = db();
  const def = ev.custom || eventById(ev.eventId);
  const patch = revertEffects(lab, def?.effects);
  if (Object.keys(patch).length) await api.updateLab(lab.id, patch);
  await api.updateEvent(lab.id, ev.id, { status: 'resolved', resolvedAt: Date.now(), resolvedBy: by.name || 'Instructor' });
  await api.sendComm(lab.id, {
    kind: 'system', channel: 'SYS', from: 'SYSTEM', fromUid: 'system',
    text: `✓ Resuelto: ${ev.titleEs}`, eventRef: ev.id,
  });
}

/**
 * The host loop: random events + timeline. Call tick() every few seconds from the teacher console.
 */
export function createDirector(getLab, by) {
  let busy = false;
  async function tick() {
    const lab = getLab();
    if (!lab || lab.status !== 'running' || busy) return;
    busy = true;
    try {
      const now = Date.now();
      // Timeline
      const schedule = lab.schedule || [];
      const startedAt = lab.startedAt || lab.createdAt;
      const due = schedule.filter((s) => !s.fired && startedAt + s.atMin * 60000 <= now);
      if (due.length) {
        for (const s of due) await fireEvent(lab, { eventId: s.eventId, vars: s.vars || {}, by: { ...by, name: 'Cronograma' } });
        await db().updateLab(lab.id, { schedule: schedule.map((s) => (due.includes(s) ? { ...s, fired: true } : s)) });
      }
      // Random generator
      const r = lab.random;
      if (r?.enabled) {
        if (!r.nextAt) {
          await db().updateLab(lab.id, { random: { ...r, nextAt: now + jitter(r.everyMin) } });
        } else if (now >= r.nextAt) {
          const pool = eventsForScenario(lab.scenarioId).filter((e) =>
            (r.severities || ['routine', 'safety', 'urgency']).includes(e.severity) &&
            (!r.categories?.length || r.categories.includes(e.category)));
          const recent = new Set((lab.recentRandom || []).slice(-4));
          const fresh = pool.filter((e) => !recent.has(e.id));
          const choice = pick(fresh.length ? fresh : pool);
          if (choice) {
            await fireEvent(lab, { eventId: choice.id, by: { ...by, name: 'Evento aleatorio' } });
            await db().updateLab(lab.id, {
              random: { ...r, nextAt: now + jitter(r.everyMin) },
              recentRandom: [...(lab.recentRandom || []), choice.id].slice(-8),
            });
          }
        }
      }
    } catch (e) {
      console.error('[director]', e);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(tick, 4000);
  return { tick, stop: () => clearInterval(timer) };
}

const jitter = (min = 6) => Math.round(min * 60000 * (0.6 + Math.random() * 0.8));
