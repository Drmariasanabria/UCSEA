// AI orchestration for NPC stations and writing feedback.
// Provider chain (first that answers wins):
//   1. 'function'  – optional Firebase Cloud Function (Claude, key in Secret Manager)
//   2. 'gemini'    – Firebase AI Logic (Gemini Developer API, no key in the browser)
//   3. 'local'     – deterministic SMCP engine (always available)
import { localReply, detectIntent } from './local-engine.js';
import { PERSONAS, stationName } from './npc.js';
import { picture, shipClock, latLonText } from '../sim/engine.js';
import { eventById } from '../data/events.js';
import { roleById } from '../data/careers.js';
import { db } from '../backend/index.js';

const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-flash-latest'];
let geminiModel = null;
let geminiFailedUntil = 0;
let functionFailedUntil = 0;

export const PROVIDER_LABEL = { function: 'Claude (Cloud Function)', gemini: 'Gemini (Firebase AI Logic)', local: 'Motor SMCP local' };

function situationBrief(lab, personaKey, events) {
  const pic = picture(lab);
  const own = lab.ownShip || {};
  const w = lab.world || {};
  const lines = [];
  lines.push(`Own ship: ${own.name} (${own.type}, call sign ${own.callsign}), course ${Math.round(own.course || 0)}°, speed ${(own.speed || 0).toFixed(1)} kn, ${own.pob} persons on board, position ${latLonText(lab, pic.own || { px: 0, py: 0 })}.`);
  lines.push(`Ship's time ${shipClock(lab)}. Wind ${w.windDir}° ${w.wind} kn, sea state ${w.seaState}, visibility ${w.visibility} NM${w.fog ? ' (fog)' : ''}${w.rain ? ', rain' : ''}. GNSS ${w.gnss === false ? 'LOST' : 'normal'}.`);
  const near = (pic.contacts || []).slice(0, 5).map((c) => `${c.ais ? c.name : 'unidentified target (no AIS)'}: ${c.side}, range ${c.range.toFixed(1)} NM, course ${Math.round(c.course)}°, speed ${c.speed.toFixed(1)} kn, CPA ${c.cpa.toFixed(2)} NM, TCPA ${c.tcpa > 0 && c.tcpa < 999 ? Math.round(c.tcpa) + ' min' : 'n/a'}${c.tow ? ', towing a barge (length of tow 250 m)' : ''}`);
  if (near.length) lines.push('Radar picture:\n- ' + near.join('\n- '));
  const act = events.filter((e) => e.status === 'active');
  if (act.length) lines.push('Active incidents:\n- ' + act.map((e) => `${e.title}: ${e.situation}`).join('\n- '));
  if (lab.variables?.length) lines.push('Teacher variables: ' + lab.variables.map((v) => `${v.key} = ${v.value}`).join('; '));
  return lines.join('\n');
}

export function buildPrompt({ lab, personaKey, events = [], history = [], sender, text, channel }) {
  const [base, id] = personaKey.split(':');
  const p = PERSONAS[base] || PERSONAS.vts;
  const contact = id ? (lab.targets || []).find((t) => t.id === id) : null;
  const name = contact?.name || stationName(lab, base) || p.label;
  const senderRole = roleById(sender?.roleId);
  const system = [
    `You are ${name}, a ${p.label} station in a maritime English communication simulator for Spanish university students (Inglés Técnico Marítimo II).`,
    `Personality and duties: ${p.style}`,
    'Rules:',
    '- Answer ONLY as this station, in IMO Standard Marine Communication Phrases (SMCP) style English. One transmission, 1–4 short sentences.',
    '- On VHF radio start with "<calling ship>, this is <your station>." and end with "Over." (or "Out." when finishing). On phone/intercom speak naturally but concisely.',
    '- Use message markers (QUESTION, ANSWER, INFORMATION, ADVICE, WARNING, REQUEST, INTENTION; INSTRUCTION only if you are an authority) where they help.',
    '- Use ONLY the facts in the situation below. If something is not in the data, say it is not confirmed or ask for it. Never invent new emergencies.',
    '- If the student\'s message is unclear, ambiguous, lacks call signs or key data (position, time, persons on board), react realistically: ask them to say again or ask the missing question.',
    '- If the student reads back numbers, confirm "Read back correct" or correct them with "Mistake. I say again ...".',
    '- Never break character, never mention being an AI, never give grammar lessons inside the radio message.',
    '',
    'SITUATION',
    situationBrief(lab, personaKey, events),
    '',
    `The caller is ${sender?.name || 'a student'}${senderRole ? ', acting as ' + senderRole.en : ''}, transmitting on ${channel}.`,
    lab.ai?.persona ? `Teacher's extra instructions for NPCs: ${lab.ai.persona}` : '',
  ].filter(Boolean).join('\n');
  const msgs = history.slice(-14).map((m) => ({
    role: m.fromUid?.startsWith('npc:') && m.persona === base ? 'assistant' : 'user',
    content: `[${m.channel}] ${m.from}: ${m.text}`,
  }));
  msgs.push({ role: 'user', content: `[${channel}] ${sender?.name || 'Student'}: ${text}` });
  // Merge consecutive roles (APIs require alternation).
  const merged = [];
  for (const m of msgs) {
    if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += '\n' + m.content;
    else merged.push({ ...m });
  }
  if (merged[0]?.role === 'assistant') merged.unshift({ role: 'user', content: '(radio channel open)' });
  return { system, messages: merged, name };
}

function cleanReply(text = '') {
  return String(text)
    .replace(/^\s*\[[^\]]*\]\s*/g, '')
    .replace(/^[A-Z][\w\s'-]{0,40}:\s+/, '')
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

async function viaGemini(prompt, cfg) {
  if (Date.now() < geminiFailedUntil) throw new Error('gemini cooling down');
  const api = db();
  if (api.mode !== 'firebase' || !api.firebaseApp) throw new Error('Gemini requires Firebase mode');
  const { loadFirebaseAI } = await import('../backend/firebase.js');
  const AI = await loadFirebaseAI();
  // Last model that answered first, then the teacher's choice, then the defaults (a busy model fails fast with 500/503).
  const models = [...new Set([geminiModel, cfg?.geminiModel, ...DEFAULT_GEMINI_MODELS].filter(Boolean))];
  const ai = AI.getAI(api.firebaseApp, { backend: new AI.GoogleAIBackend() });
  let lastErr;
  for (const model of models) {
    try {
      const m = AI.getGenerativeModel(ai, { model, systemInstruction: prompt.system, generationConfig: { maxOutputTokens: 400, temperature: 0.6 } });
      const res = await withTimeout(m.generateContent({
        contents: prompt.messages.map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
      }), 10000);
      const out = res.response.text();
      if (!out?.trim()) throw new Error('empty');
      geminiModel = model;
      return { text: out, model };
    } catch (e) {
      lastErr = e;
    }
  }
  geminiFailedUntil = Date.now() + 60000;
  throw lastErr || new Error('gemini failed');
}

async function viaFunction(prompt, cfg) {
  if (!cfg?.functionUrl) throw new Error('no function configured');
  if (Date.now() < functionFailedUntil) throw new Error('function cooling down');
  const api = db();
  const token = await api.idToken?.();
  const res = await fetch(cfg.functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ system: prompt.system, messages: prompt.messages }),
  });
  if (!res.ok) { functionFailedUntil = Date.now() + 30000; throw new Error('function ' + res.status); }
  const data = await res.json();
  if (!data.text) throw new Error('empty');
  return { text: data.text, model: data.model };
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

/**
 * Generate an NPC reply. Returns { text, provider, model, intent }.
 * ctx: { lab, personaKey, events, history, sender, text, channel }
 */
export async function npcReply(ctx) {
  const cfg = ctx.lab.ai || {};
  const order = cfg.provider === 'local' ? ['local'] : cfg.provider === 'gemini' ? ['gemini', 'local'] : ['function', 'gemini', 'local'];
  const intent = detectIntent(ctx.text);
  const prompt = order.some((p) => p !== 'local') ? buildPrompt(ctx) : null;
  for (const p of order) {
    try {
      if (p === 'function') {
        const r = await withTimeout(viaFunction(prompt, cfg), 12000);
        return { text: cleanReply(r.text), provider: 'function', model: r.model, intent };
      }
      if (p === 'gemini') {
        const r = await withTimeout(viaGemini(prompt, cfg), 22000);
        return { text: cleanReply(r.text), provider: 'gemini', model: r.model, intent };
      }
    } catch (e) {
      // fall through to the next provider
    }
  }
  const r = localReply({ ...ctx, picture: picture(ctx.lab), senderShip: ctx.sender?.ship || ctx.lab.ownShip?.name });
  return { text: r.text, provider: 'local', model: 'smcp-rules', intent: r.intent };
}

// Short coaching feedback on a written message (missions & debrief). Uses the same chain.
export async function coachFeedback({ text, task, lab, cfg = {} }) {
  const system = 'You are a maritime English teacher (CEFR B1–B2, IMO SMCP). Give feedback in Spanish, max 90 words: 1) what works, 2) the most important correction with a corrected English example, 3) one SMCP/precision tip. Do not rewrite the whole text.';
  const prompt = { system, messages: [{ role: 'user', content: `Task: ${task}\n\nStudent text:\n${text}` }] };
  for (const p of cfg.provider === 'local' ? [] : ['function', 'gemini']) {
    try {
      const r = p === 'function' ? await withTimeout(viaFunction(prompt, cfg), 12000) : await withTimeout(viaGemini(prompt, cfg), 22000);
      return { text: r.text.trim(), provider: p };
    } catch { /* next */ }
  }
  return null;
}

export { eventById };
