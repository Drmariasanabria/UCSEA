// Team-level and fluency metrics for the Communication Lab.
import { analyze } from '../ai/analyzer.js';

const WINDOW = { distress: 60000, urgency: 120000, safety: 300000, routine: 600000 };
const PENALTY = { distress: 12, urgency: 7, safety: 3, routine: 1 };

/**
 * Ship Safety Index (0–100): a shared crew score. It falls when alarms are not acknowledged
 * or not answered on the radio within a realistic time, and rises with procedural quality.
 */
export function safetyIndex({ events = [], comms = [], crew = [], now = Date.now() }) {
  const factors = [];
  let score = 100;
  const human = (m) => ['radio', 'intercom'].includes(m.kind) && m.fromUid && !String(m.fromUid).startsWith('npc');
  for (const e of events) {
    const win = WINDOW[e.severity] || WINDOW.safety;
    const deadline = e.ts + win;
    const answered = comms.some((m) => human(m) && m.ts >= e.ts && m.ts <= deadline);
    if (!answered && now > deadline) {
      score -= PENALTY[e.severity] || 3;
      factors.push({ sign: -1, es: `Sin respuesta por radio a «${e.titleEs}» en ${Math.round(win / 60000)} min`, value: -(PENALTY[e.severity] || 3) });
    } else if (answered) {
      factors.push({ sign: 1, es: `Respuesta a tiempo: ${e.titleEs}`, value: 0 });
    }
    if (e.alarm && crew.length) {
      const acks = Object.keys(e.acks || {}).length;
      const rate = acks / crew.length;
      if (now - e.ts > 60000 && rate < 0.5) {
        const p = Math.round((0.5 - rate) * 8);
        score -= p;
        factors.push({ sign: -1, es: `Alarma «${e.titleEs}» reconocida solo por ${acks}/${crew.length}`, value: -p });
      }
    }
  }
  const recent = comms.filter(human).slice(-30);
  if (recent.length >= 3) {
    const warn = recent.reduce((s, m) => s + ((m.analysis || analyze(m.text, { channel: m.channel })).issues || []).filter((i) => i.level === 'warn').length, 0);
    const q = Math.round(10 - (warn / recent.length) * 20);
    score += Math.max(-10, Math.min(10, q));
    factors.push({ sign: q >= 0 ? 1 : -1, es: `Calidad de procedimiento SMCP (últimos ${recent.length} mensajes)`, value: Math.max(-10, Math.min(10, q)) });
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), factors };
}

export function safetyColor(score) {
  return score >= 80 ? 'var(--c-safety)' : score >= 55 ? 'var(--c-warn)' : 'var(--c-danger)';
}

/** Fluency from spoken messages: words per minute and mean recognition confidence. */
export function fluency(messages = []) {
  const spoken = messages.filter((m) => m.spoken && m.speechMs > 800);
  if (!spoken.length) return { spoken: 0, wpm: null, confidence: null };
  const words = spoken.reduce((s, m) => s + (m.text.match(/\b[\w'-]+\b/g) || []).length, 0);
  const minutes = spoken.reduce((s, m) => s + m.speechMs, 0) / 60000;
  const conf = spoken.filter((m) => m.confidence != null);
  return {
    spoken: spoken.length,
    wpm: Math.round(words / Math.max(minutes, 0.05)),
    confidence: conf.length ? Math.round((conf.reduce((s, m) => s + m.confidence, 0) / conf.length) * 100) : null,
  };
}

// Watch-handover rotation: next role inside the same degree track (wraps around).
export function rotationPlan(crew, roles) {
  const byCareer = {};
  for (const r of roles) (byCareer[r.career] ||= []).push(r.id);
  const taken = new Set();
  return crew.map((c) => {
    const list = byCareer[c.careerId] || [];
    if (!list.length) return { uid: c.uid, from: c.roleId, to: c.roleId };
    let i = list.indexOf(c.roleId);
    for (let k = 1; k <= list.length; k++) {
      const cand = list[(i + k) % list.length];
      if (!taken.has(cand)) { taken.add(cand); return { uid: c.uid, from: c.roleId, to: cand }; }
    }
    return { uid: c.uid, from: c.roleId, to: c.roleId };
  });
}
