// DEMO backend: localStorage persistence + BroadcastChannel realtime between tabs.
// Same interface as firebase.js, so the whole app (teacher + students in several tabs)
// works with zero configuration.
import { uid, joinCode } from '../core/util.js';
import { seedGlossary } from '../data/glossary-seed.js';

const NS = 'mesim10:';
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('mesim10') : null;
const listeners = new Map(); // key -> Set(fn)

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage full?', e);
  }
  notify(key);
  bc?.postMessage({ key });
}
function notify(key) {
  listeners.get(key)?.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}
bc && (bc.onmessage = (e) => notify(e.data.key));
window.addEventListener('storage', (e) => { if (e.key?.startsWith(NS)) notify(e.key.slice(NS.length)); });

function listen(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  fn();
  return () => listeners.get(key)?.delete(fn);
}

// collection helpers: stored as { [id]: doc }
const col = (name) => read(name, {});
const putDoc = (name, id, data) => { const c = col(name); c[id] = data; write(name, c); return data; };
const patchDoc = (name, id, patch) => {
  const c = col(name);
  if (!c[id]) return null;
  c[id] = { ...c[id], ...patch };
  write(name, c);
  return c[id];
};
const delDoc = (name, id) => { const c = col(name); delete c[id]; write(name, c); };
const sortTs = (arr) => arr.sort((a, b) => (a.ts || a.createdAt || 0) - (b.ts || b.createdAt || 0));

export function createLocalBackend() {
  if (!read('glossary-seeded', false)) {
    const g = {};
    for (const t of seedGlossary()) g[t.id] = t;
    write('glossary', g);
    write('glossary-seeded', true);
  }

  const authSubs = new Set();
  // The signed-in user is per tab (sessionStorage) so one browser can host a teacher tab and student tabs.
  const SKEY = NS + 'session';
  const currentUser = () => { try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch { return null; } };
  const setSession = (p) => { if (p) sessionStorage.setItem(SKEY, JSON.stringify(p)); else sessionStorage.removeItem(SKEY); };

  const api = {
    mode: 'demo',
    label: 'Modo demostración (datos en este navegador)',

    // ---------- auth ----------
    onAuth(cb) {
      authSubs.add(cb);
      cb(currentUser());
      return () => authSubs.delete(cb);
    },
    async signInDemo({ name, role, email }) {
      const users = col('profiles');
      let profile = Object.values(users).find((u) => u.name.toLowerCase() === name.trim().toLowerCase() && u.role === role);
      if (!profile) {
        profile = { uid: uid('u_'), name: name.trim(), email: email || '', role, createdAt: Date.now(), careerId: null, roleId: null };
        putDoc('profiles', profile.uid, profile);
      }
      setSession(profile);
      authSubs.forEach((fn) => fn(profile));
      return profile;
    },
    async signOut() {
      setSession(null);
      authSubs.forEach((fn) => fn(null));
    },
    async getProfile(id) { return col('profiles')[id] || null; },
    async updateProfile(id, patch) {
      const p = patchDoc('profiles', id, patch);
      if (currentUser()?.uid === id) { setSession(p); authSubs.forEach((fn) => fn(p)); }
      return p;
    },
    async listProfiles(filter = {}) {
      return Object.values(col('profiles')).filter((p) => !filter.role || p.role === filter.role);
    },

    // ---------- labs ----------
    async createLab(data) {
      const id = uid('lab_');
      const lab = { id, code: joinCode(), status: 'briefing', createdAt: Date.now(), updatedAt: Date.now(), ...data };
      putDoc('labs', id, lab);
      return lab;
    },
    async getLab(id) { return col('labs')[id] || null; },
    async findLabByCode(code) {
      return Object.values(col('labs')).find((l) => l.code === code.trim().toUpperCase() && l.status !== 'archived') || null;
    },
    async listLabs({ ownerUid, active } = {}) {
      return Object.values(col('labs'))
        .filter((l) => (!ownerUid || l.ownerUid === ownerUid) && (!active || (l.status !== 'ended' && l.status !== 'archived')))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async updateLab(id, patch) { return patchDoc('labs', id, { ...patch, updatedAt: Date.now() }); },
    watchLab(id, cb) { return listen('labs', () => cb(col('labs')[id] || null)); },
    watchLabs(cb) { return listen('labs', () => cb(Object.values(col('labs')).sort((a, b) => b.createdAt - a.createdAt))); },

    async joinLab(labId, member) {
      const key = `crew:${labId}`;
      const crew = read(key, {});
      crew[member.uid] = { ...(crew[member.uid] || {}), ...member, joinedAt: crew[member.uid]?.joinedAt || Date.now(), lastSeen: Date.now() };
      write(key, crew);
      return crew[member.uid];
    },
    async updateCrew(labId, memberUid, patch) {
      const key = `crew:${labId}`;
      const crew = read(key, {});
      if (!crew[memberUid]) return null;
      crew[memberUid] = { ...crew[memberUid], ...patch };
      write(key, crew);
      return crew[memberUid];
    },
    async removeCrew(labId, memberUid) {
      const key = `crew:${labId}`;
      const crew = read(key, {});
      delete crew[memberUid];
      write(key, crew);
    },
    watchCrew(labId, cb) { return listen(`crew:${labId}`, () => cb(Object.values(read(`crew:${labId}`, {})))); },

    async sendComm(labId, msg) {
      const key = `comms:${labId}`;
      const list = read(key, []);
      const doc = { id: uid('m_'), ts: Date.now(), ...msg };
      list.push(doc);
      write(key, list.slice(-1500));
      return doc;
    },
    async updateComm(labId, id, patch) {
      const key = `comms:${labId}`;
      const list = read(key, []);
      const i = list.findIndex((m) => m.id === id);
      if (i >= 0) { list[i] = { ...list[i], ...patch }; write(key, list); }
    },
    watchComms(labId, cb) { return listen(`comms:${labId}`, () => cb(read(`comms:${labId}`, []))); },
    async getComms(labId) { return read(`comms:${labId}`, []); },

    async addEvent(labId, ev) {
      const key = `events:${labId}`;
      const list = read(key, []);
      const doc = { id: uid('e_'), ts: Date.now(), status: 'active', acks: {}, ...ev };
      list.push(doc);
      write(key, list);
      return doc;
    },
    async updateEvent(labId, id, patch) {
      const key = `events:${labId}`;
      const list = read(key, []);
      const i = list.findIndex((e) => e.id === id);
      if (i >= 0) { list[i] = { ...list[i], ...patch, acks: { ...(list[i].acks || {}), ...(patch.acks || {}) } }; write(key, list); }
    },
    watchEvents(labId, cb) { return listen(`events:${labId}`, () => cb(sortTs(read(`events:${labId}`, [])))); },
    async getEvents(labId) { return read(`events:${labId}`, []); },
    async getCrew(labId) { return Object.values(read(`crew:${labId}`, {})); },

    async addTrack(labId, sample) {
      const key = `track:${labId}`;
      const list = read(key, []);
      list.push(sample);
      write(key, list.slice(-1200));
    },
    async getTrack(labId) { return read(`track:${labId}`, []); },

    // ---------- glossary ----------
    watchGlossary(cb) { return listen('glossary', () => cb(Object.values(col('glossary')))); },
    async saveTerm(term) {
      const t = { ...term, id: term.id || uid('t_'), updatedAt: Date.now(), createdAt: term.createdAt || Date.now() };
      putDoc('glossary', t.id, t);
      return t;
    },
    async deleteTerm(id) { delDoc('glossary', id); },
    async importTerms(terms) {
      const c = col('glossary');
      for (const t of terms) c[t.id] = { ...(c[t.id] || {}), ...t, updatedAt: Date.now() };
      write('glossary', c);
      return terms.length;
    },

    // ---------- portfolio ----------
    async listPortfolio(ownerUid) {
      return Object.values(read(`portfolio:${ownerUid}`, {})).sort((a, b) => b.createdAt - a.createdAt);
    },
    watchPortfolio(ownerUid, cb) {
      return listen(`portfolio:${ownerUid}`, () => cb(Object.values(read(`portfolio:${ownerUid}`, {})).sort((a, b) => b.createdAt - a.createdAt)));
    },
    async addPortfolioEntry(ownerUid, entry) {
      const key = `portfolio:${ownerUid}`;
      const c = read(key, {});
      const e = { id: uid('p_'), createdAt: Date.now(), ownerUid, ...entry };
      c[e.id] = e;
      write(key, c);
      return e;
    },
    async updatePortfolioEntry(ownerUid, id, patch) {
      const key = `portfolio:${ownerUid}`;
      const c = read(key, {});
      if (c[id]) { c[id] = { ...c[id], ...patch }; write(key, c); }
    },
    async deletePortfolioEntry(ownerUid, id) {
      const key = `portfolio:${ownerUid}`;
      const c = read(key, {});
      delete c[id];
      write(key, c);
    },

    // ---------- missions ----------
    async saveMissionRun(run) {
      const r = { id: run.id || uid('r_'), updatedAt: Date.now(), ...run };
      putDoc('missionRuns', r.id, r);
      return r;
    },
    async listMissionRuns({ uid: owner } = {}) {
      return Object.values(col('missionRuns')).filter((r) => !owner || r.uid === owner).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    // ---------- settings ----------
    async getConfig(name) { return read(`config:${name}`, null); },
    async setConfig(name, value) { write(`config:${name}`, value); return value; },

    // Utility for the "reset demo" button
    resetAll() {
      Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k));
      location.reload();
    },
  };
  return api;
}
