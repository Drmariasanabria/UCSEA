// Minimal observable store + hash router.

export function createStore(initial = {}) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// Tiny event emitter used by the simulation and backends.
export class Emitter {
  constructor() { this.handlers = new Map(); }
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt)?.delete(fn);
  }
  emit(evt, payload) {
    this.handlers.get(evt)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[emitter:${evt}]`, e); }
    });
  }
}

export const app = createStore({
  user: null, // { uid, name, email, role: 'student'|'teacher' }
  profile: null,
  backendMode: 'demo', // 'demo' | 'firebase'
  sound: true,
  lang: 'es',
});

// Hash router: '#/lab/ABC123' -> { path: ['lab','ABC123'], query }
export function parseHash(hash = location.hash) {
  const [p, q = ''] = hash.replace(/^#\/?/, '').split('?');
  return {
    path: p.split('/').filter(Boolean).map(decodeURIComponent),
    query: Object.fromEntries(new URLSearchParams(q)),
  };
}

export const go = (path) => {
  const next = '#/' + path.replace(/^#?\/?/, '');
  if (location.hash === next) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = next;
};
