// Chooses the backend: Firebase (default for class use) or local demo mode.
import { createLocalBackend } from './local.js';

const PREF = 'mesim10:backend';
let backend = null;

export const preferredMode = () => {
  const q = new URLSearchParams(location.search).get('mode');
  if (q === 'demo' || q === 'firebase') return q;
  return localStorage.getItem(PREF) || 'firebase';
};

export function setPreferredMode(mode) {
  localStorage.setItem(PREF, mode);
  location.reload();
}

export async function initBackend() {
  const mode = preferredMode();
  if (mode === 'firebase') {
    try {
      const { createFirebaseBackend } = await import('./firebase.js');
      backend = await withTimeout(createFirebaseBackend(), 9000);
      return backend;
    } catch (e) {
      console.warn('Firebase unavailable, using demo mode.', e);
      backend = createLocalBackend();
      backend.fallbackReason = 'No se pudo conectar con Firebase; se usa el modo demostración en este navegador.';
      return backend;
    }
  }
  backend = createLocalBackend();
  return backend;
}

export const db = () => backend;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
