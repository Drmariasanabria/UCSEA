// Speech: push-to-talk recognition (Web Speech API), radio-style TTS, and local recording.
import { sfx } from './audio.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const sttSupported = () => !!SR;
export const ttsSupported = () => 'speechSynthesis' in window;
export const recSupported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/**
 * Push-to-talk session. Call start() on press and stop() on release.
 * onInterim(text) streams partial transcript; onFinal({text, confidence}) fires once.
 */
export function createPTT({ lang = 'en-GB', onInterim, onFinal, onError, record = false } = {}) {
  let rec = null;
  let finalText = '';
  let confidences = [];
  let recorder = null;
  let chunks = [];
  let stream = null;
  let active = false;
  let audioUrl = null;
  let startedAt = 0;

  async function start() {
    if (active) return;
    active = true;
    finalText = '';
    startedAt = Date.now();
    confidences = [];
    audioUrl = null;
    sfx.squelch();
    if (record && recSupported()) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.start();
      } catch (e) {
        recorder = null;
      }
    }
    if (!SR) { onError?.('El reconocimiento de voz no está disponible en este navegador. Usa Chrome o Edge, o escribe el mensaje.'); return; }
    rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalText += r[0].transcript + ' '; confidences.push(r[0].confidence || 0); }
        else interim += r[0].transcript;
      }
      onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') onError?.(micErrorText(e.error)); };
    rec.onend = () => { if (active) { try { rec.start(); } catch { /* restarting too fast */ } } };
    try { rec.start(); } catch (e) { onError?.(String(e.message || e)); }
  }

  function stop() {
    if (!active) return Promise.resolve(null);
    active = false;
    sfx.radioOut();
    return new Promise((resolve) => {
      const finish = () => {
        const text = finalText.trim();
        const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
        const result = { text, confidence, audioUrl, durationMs: Date.now() - startedAt };
        onFinal?.(result);
        resolve(result);
      };
      const stopRec = () => {
        if (rec) { rec.onend = null; try { rec.stop(); } catch { /* not started */ } }
        setTimeout(finish, 350);
      };
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = () => {
          audioUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
          stream?.getTracks().forEach((t) => t.stop());
          stopRec();
        };
        recorder.stop();
      } else stopRec();
    });
  }

  return { start, stop, get active() { return active; } };
}

function micErrorText(code) {
  return ({
    'not-allowed': 'Permiso de micrófono denegado. Actívalo en el candado de la barra de direcciones.',
    'service-not-allowed': 'El navegador no permite el reconocimiento de voz aquí.',
    'audio-capture': 'No se encuentra ningún micrófono.',
    network: 'El reconocimiento de voz necesita conexión a Internet.',
  })[code] || 'Error de reconocimiento de voz: ' + code;
}

// ---------- TTS ----------
// Browsers ship voices of very different quality. We rank them and only use natural ones:
// Edge "Natural"/neural voices > Google network voices > Apple Premium/Enhanced/Siri > good
// system voices. Novelty and legacy robotic voices are excluded unless nothing else exists.
let voices = [];
let ranked = null;
function loadVoices() { voices = window.speechSynthesis?.getVoices() || []; ranked = null; }
if (ttsSupported()) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Princess|Deranged|Hysterical|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
const GOOD_APPLE = /\b(Daniel|Serena|Kate|Oliver|Arthur|Martha|Stephanie|Karen|Lee|Moira|Tessa|Rishi|Samantha|Alex|Ava|Allison|Susan|Tom|Evan|Nathan|Zoe|Joelle|Noelle)\b/;

export function voiceScore(v) {
  const n = v.name || '';
  if (NOVELTY.test(n)) return -1000;
  let s = 0;
  if (/natural|neural/i.test(n)) s += 120;
  else if (/online/i.test(n) && /microsoft/i.test(n)) s += 100;
  if (/google/i.test(n)) s += 80;
  if (/premium|enhanced|siri/i.test(n)) s += 75;
  if (GOOD_APPLE.test(n)) s += 40;
  if (/espeak|festival|mbrola/i.test(n)) s -= 300;
  if (/microsoft/i.test(n) && /desktop/i.test(n)) s -= 60; // legacy SAPI voices
  if (/en[-_]GB/i.test(v.lang)) s += 12; // British English suits the maritime context
  else if (/en[-_](IE|AU|NZ|ZA|IN)/i.test(v.lang)) s += 6;
  if (!v.localService) s += 5;
  return s;
}

export function englishVoices() {
  if (!ranked) ranked = voices.filter((v) => /^en[-_]/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
  return ranked;
}

const prefVoice = () => { try { return JSON.parse(localStorage.getItem('mesim10:prefs') || '{}').voice || null; } catch { return null; } };

// Persona -> stable voice from the best tier only, so each NPC keeps its own (good) voice.
export function voiceFor(personaKey = '') {
  const list = englishVoices();
  if (!list.length) return null;
  const pref = prefVoice() && list.find((v) => v.name === prefVoice());
  if (pref && ['default', 'narrator'].includes(personaKey)) return pref;
  const best = voiceScore(list[0]);
  let pool = list.filter((v) => voiceScore(v) >= best - 45 && voiceScore(v) > -100);
  if (pool.length < 2) pool = list.filter((v) => voiceScore(v) > -100).slice(0, 4);
  if (!pool.length) pool = list;
  let hsh = 0;
  for (const c of personaKey) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return pool[hsh % pool.length];
}

// ---------- maritime text normalisation (SMCP-style reading) ----------
const DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const digits = (s) => s.split('').map((c) => (/\d/.test(c) ? DIG[+c] : c)).join(' ');
const SPELL = ['VTS', 'MRCC', 'RCC', 'CPA', 'TCPA', 'AIS', 'ETA', 'ETD', 'OOW', 'VHF', 'UHF', 'MF', 'HF', 'DSC', 'GMDSS', 'SAR', 'MOB', 'POB', 'PSC', 'ISM', 'SMS', 'DPA', 'COG', 'SOG', 'HDG', 'UKC', 'GM', 'ECR', 'MCC', 'LT', 'UTC', 'TSS', 'DST', 'IMO', 'MV', 'MT', 'ROV', 'ECDIS', 'GNSS', 'GPS', 'SART', 'LNG', 'LPG', 'ISPS', 'MSDS', 'SDS', 'PPE', 'CO2', 'NO'];
const SPELL_SET = new Set(SPELL.filter((x) => x !== 'NO' && x !== 'ECDIS'));

export function radioText(raw = '') {
  let t = ` ${raw} `;
  t = t.replace(/[⚑⚠✓•·]/g, ' ').replace(/\s[—–-]\s/g, ', ').replace(/\s+/g, ' ');
  // Spanish severity labels from system messages are not read out
  t = t.replace(/^\s*(URGENCIA|SOCORRO|SEGURIDAD|RUTINA)\b[\s,:]*/i, ' ');
  t = t.replace(/(?<![\p{L}])S[ÉE]CURIT[ÉE](?![\p{L}])/giu, 'Say-cure-ee-tay');
  t = t.replace(/\bMAYDAY\b/gi, 'Mayday').replace(/\bPAN[\s-]?PAN\b/gi, 'Pan Pan');
  t = t.replace(/\bNo\.\s?(\d)/g, 'number $1');
  t = t.replace(/\bPOB\b/g, 'persons on board').replace(/\bLT\b/g, 'local time');
  // times like 1400 / 0942 -> digit by digit
  t = t.replace(/\b([01]\d|2[0-3])([0-5]\d)\b(?!\.\d)/g, (m) => digits(m));
  // bearings/courses: 3-digit with degree sign, or leading zero -> digit by digit
  t = t.replace(/\b(\d{3})\s?°(?!\s?C)/g, (_, d) => `${digits(d)} degrees`);
  t = t.replace(/\b0\d{2}\b(?!\.\d)/g, (m) => digits(m));
  t = t.replace(/(\d)\s?°\s?C\b/g, '$1 degrees Celsius').replace(/(\d)\s?°/g, '$1 degrees');
  // channels: channel 16 / VHF 16 / CH 13 -> "channel one six"
  t = t.replace(/\b(?:channel|ch\.?|VHF)\s?(\d{1,2})\b/gi, (_, d) => `channel ${digits(d)}`);
  // units (before decimals are spelt out)
  t = t.replace(/(\d)\s?NM\b/g, '$1 nautical miles').replace(/\bNM\b/g, 'nautical miles');
  t = t.replace(/(\d)\s?kn\b/g, '$1 knots').replace(/(\d)\s?kts?\b/g, '$1 knots');
  t = t.replace(/(\d)\s?m\b/g, '$1 metres').replace(/(\d)\s?t\b/g, '$1 tonnes').replace(/(\d)\s?%/g, '$1 percent');
  // decimals -> "two decimal four"
  t = t.replace(/\b(\d+)\.(\d+)\b/g, (_, a, b) => `${a.length > 1 ? digits(a) : DIG[+a]} decimal ${digits(b)}`);
  // acronyms spelt letter by letter; long ALL-CAPS words (SMCP markers) read as words
  t = t.replace(/\b[A-Z][A-Z0-9]{1,5}\b/g, (w) => (SPELL_SET.has(w) ? w.split('').join(' ') : w));
  t = t.replace(/\b[A-Z]{5,}\b/g, (w) => (w === 'ECDIS' ? 'Ek-dis' : w[0] + w.slice(1).toLowerCase()));
  return t.replace(/\s+/g, ' ').replace(/\s([,.?!])/g, '$1').replace(/^[,\s]+/, '').trim();
}

// Split into sentences so the voice breathes (and long texts are not cut off by Chrome).
const sentences = (t) => t.match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) || [t];

let speaking = Promise.resolve();
let generation = 0;
export function speak(text, { persona = 'default', rate = 0.98, pitch = 1, radio = true } = {}) {
  if (!ttsSupported() || !text) return Promise.resolve();
  const gen = generation;
  const v = voiceFor(persona);
  const parts = sentences(radioText(text));
  speaking = speaking.then(() => new Promise((resolve) => {
    if (gen !== generation) return resolve();
    if (radio) sfx.radioIn();
    let i = 0;
    const next = () => {
      if (gen !== generation || i >= parts.length) { if (radio) sfx.radioOut(); return resolve(); }
      const u = new SpeechSynthesisUtterance(parts[i++]);
      if (v) u.voice = v;
      u.lang = v?.lang || 'en-GB';
      u.rate = rate;
      u.pitch = pitch;
      u.onend = u.onerror = () => setTimeout(next, 120);
      window.speechSynthesis.speak(u);
    };
    setTimeout(next, radio ? 200 : 0);
  }));
  return speaking;
}

export function stopSpeaking() {
  generation++;
  if (ttsSupported()) window.speechSynthesis.cancel();
  speaking = Promise.resolve();
}
