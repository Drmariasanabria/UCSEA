// AI voice (Gemini text-to-speech through Firebase AI Logic, free tier, protected by App Check).
// Context-aware: the tone follows the station and the message (VTS, MRCC, distress, glossary…).
// Returns decoded AudioBuffers; speech.js falls back to browser voices whenever this fails,
// is slow, or the free quota is exhausted. Audio is cached so repeated phrases cost nothing.
import { FIREBASE_CONFIG, appCheckToken } from '../backend/firebase.js';
import { audioContext } from './audio.js';

const MODELS = ['gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];
const ENDPOINT = (m) => `https://firebasevertexai.googleapis.com/v1beta/projects/${FIREBASE_CONFIG.projectId}/models/${m}:generateContent`;
const CACHE = 'ucsea-tts-v1';

// Gemini prebuilt voices per station; unknown personas get a stable voice from the pool.
const VOICES = {
  vts: 'Kore', mrcc: 'Charon', pilot: 'Puck', agent: 'Aoede', 'agent-laura': 'Aoede', port: 'Leda', tug: 'Algenib', barge: 'Algenib',
  vessel: 'Orus', engine: 'Iapetus', master: 'Fenrir', company: 'Despina', distressed: 'Enceladus', narrator: 'Schedar', party: 'Umbriel', default: 'Kore',
};
const POOL = ['Puck', 'Charon', 'Orus', 'Fenrir', 'Algenib', 'Rasalgethi', 'Achird', 'Sadaltager', 'Leda', 'Aoede', 'Despina', 'Erinome'];
const voiceOf = (persona = 'default') => {
  if (VOICES[persona]) return VOICES[persona];
  let h = 0;
  for (const c of persona) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return POOL[h % POOL.length];
};

// Delivery instructions from context (station + content). The model reads only the text after the colon.
function styleFor(persona, text, radio) {
  const T = text.toUpperCase();
  if (/MAYDAY/.test(T)) return 'Say as a seafarer making a distress call on VHF radio: urgent and tense but controlled, clear, slightly fast';
  if (/PAN[\s-]?PAN/.test(T)) return 'Say as an officer making an urgency call on VHF radio: serious, clear and controlled';
  if (/S[ÉE]CURIT[ÉE]|\bWARNING\b/.test(T)) return 'Say as a navigational safety broadcast on VHF radio: firm, clear and measured';
  if (!radio) return persona === 'narrator'
    ? 'Say as a clear, warm documentary narrator with a British English accent'
    : 'Say clearly, with neutral British English pronunciation for language learners, at a calm pace';
  const base = {
    vts: 'a calm, professional VTS operator',
    mrcc: 'a calm, authoritative maritime rescue coordinator',
    pilot: 'a friendly, experienced harbour pilot',
    agent: 'a polite ship agent on the phone',
    'agent-laura': 'a polite ship agent on a noisy phone line',
    port: 'a port control officer',
    tug: 'a busy tug master',
    engine: 'a ship engineer on the internal phone, with engine noise around',
    master: 'an experienced ship master',
    distressed: 'a stressed skipper of a small vessel',
    party: 'a deck team leader on a portable radio',
  }[persona] || 'a professional seafarer';
  return `Say as ${base} on VHF radio, with clear SMCP diction at a natural, efficient radio pace`;
}

const prefs = () => { try { return JSON.parse(localStorage.getItem('mesim10:prefs') || '{}'); } catch { return {}; } };
export const aiVoiceEnabled = () => prefs().aiVoice !== false;

// Cool-downs so a missing quota or an outage does not slow every message down.
const cool = new Map(); // model -> until (ms)
const COOL_KEY = 'ucsea:ttsCool';
try { for (const [k, v] of Object.entries(JSON.parse(sessionStorage.getItem(COOL_KEY) || '{}'))) cool.set(k, v); } catch {}
const setCool = (m, ms) => { cool.set(m, Date.now() + ms); try { sessionStorage.setItem(COOL_KEY, JSON.stringify(Object.fromEntries(cool))); } catch {} };
const usable = (m) => (cool.get(m) || 0) < Date.now();
export const aiVoiceStatus = () => (MODELS.some(usable) ? 'ready' : 'cooling');

async function hashKey(s) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const memory = new Map(); // key -> { bytes, mime }
async function cacheGet(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(`/__tts/${key}`);
    if (!r) return null;
    const v = { bytes: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'audio/wav' };
    memory.set(key, v);
    return v;
  } catch { return null; }
}
async function cachePut(key, v) {
  memory.set(key, v);
  try { const c = await caches.open(CACHE); await c.put(`/__tts/${key}`, new Response(v.bytes, { headers: { 'content-type': v.mime } })); } catch {}
}

function decode(v) {
  const c = audioContext();
  if (!c) throw new Error('no audio');
  if (/L16|pcm/i.test(v.mime)) {
    const rate = +(/rate=(\d+)/.exec(v.mime)?.[1] || 24000);
    const n = Math.floor(v.bytes.length / 2);
    const buf = c.createBuffer(1, n, rate);
    const out = buf.getChannelData(0);
    const dv = new DataView(v.bytes.buffer, v.bytes.byteOffset, v.bytes.byteLength);
    for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
    return Promise.resolve(buf);
  }
  return c.decodeAudioData(v.bytes.slice().buffer);
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

/** Synthesize `text` for a persona. Resolves to an AudioBuffer or throws (caller falls back). */
export async function synthesize(text, { persona = 'default', radio = true, timeoutMs = 18000 } = {}) {
  if (!aiVoiceEnabled()) throw new Error('ai voice off');
  const voice = voiceOf(persona);
  const prompt = `${styleFor(persona, text, radio)}: ${text}`;
  const key = await hashKey(`${voice}|${prompt}`);
  const hit = await cacheGet(key);
  if (hit) return decode(hit);
  const models = MODELS.filter(usable);
  if (!models.length) throw new Error('ai voice cooling down');
  const deadline = Date.now() + timeoutMs;
  const token = await Promise.race([appCheckToken(), new Promise((_, r) => setTimeout(() => r(new Error('app check timeout')), Math.max(2000, deadline - Date.now() - 4000)))]);
  let lastErr;
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), left);
    try {
      const res = await fetch(ENDPOINT(model), {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': FIREBASE_CONFIG.apiKey, 'X-Firebase-AppCheck': token },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        }),
      });
      if (res.status === 429) { setCool(model, 20 * 60000); throw new Error('quota'); }
      if (res.status === 404 || res.status === 400) { setCool(model, 6 * 3600000); throw new Error('model unavailable'); }
      if (!res.ok) { setCool(model, 2 * 60000); throw new Error('http ' + res.status); }
      const data = await res.json();
      const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part) throw new Error('no audio in response');
      const v = { bytes: b64ToBytes(part.inlineData.data), mime: part.inlineData.mimeType || 'audio/wav' };
      cachePut(key, v);
      return decode(v);
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') break;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr || new Error('ai voice failed');
}

// Warm App Check in the background so the first AI voice does not wait for it.
export function warmAiVoice() {
  if (!aiVoiceEnabled() || !MODELS.some(usable)) return;
  appCheckToken().catch(() => {});
}
