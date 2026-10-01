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
let voices = [];
function loadVoices() { voices = window.speechSynthesis?.getVoices() || []; }
if (ttsSupported()) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export function englishVoices() {
  return voices.filter((v) => /^en[-_]/i.test(v.lang));
}

// Persona -> stable voice (by hash) so each NPC keeps its own voice.
export function voiceFor(personaKey = '') {
  const list = englishVoices();
  if (!list.length) return null;
  const preferred = list.filter((v) => /GB|IE|AU|IN|ZA|US/i.test(v.lang));
  const pool = preferred.length ? preferred : list;
  let hsh = 0;
  for (const c of personaKey) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return pool[hsh % pool.length];
}

let speaking = Promise.resolve();
export function speak(text, { persona = 'default', rate = 1.02, pitch = 1, radio = true } = {}) {
  if (!ttsSupported() || !text) return Promise.resolve();
  speaking = speaking.then(() => new Promise((resolve) => {
    if (radio) sfx.radioIn();
    const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' '));
    const v = voiceFor(persona);
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-GB';
    u.rate = rate;
    u.pitch = pitch;
    u.onend = u.onerror = () => { if (radio) sfx.radioOut(); resolve(); };
    setTimeout(() => window.speechSynthesis.speak(u), radio ? 180 : 0);
  }));
  return speaking;
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
  speaking = Promise.resolve();
}
