// Firebase backend (Auth + Firestore), loaded from the official gstatic ESM CDN.
// Same interface as local.js.
import { seedGlossary } from '../data/glossary-seed.js';
import { joinCode, uid as makeId } from '../core/util.js';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBFseGjXL2_B3ATN3RxL6hw7NBHEbbt3uc',
  authDomain: 'maritime-comms.firebaseapp.com',
  projectId: 'maritime-comms',
  storageBucket: 'maritime-comms.firebasestorage.app',
  appId: '1:419765608013:web:a6906c716590d1c2490604',
};

// Tried in order; the first version the CDN serves is used.
const VERSIONS = ['12.19.0', '12.6.0', '11.10.0'];
const cdn = (v, m) => `https://www.gstatic.com/firebasejs/${v}/firebase-${m}.js`;

let sdk = null;
export async function loadFirebaseSDK() {
  if (sdk) return sdk;
  let lastErr;
  for (const v of VERSIONS) {
    try {
      const [app, auth, fs] = await Promise.all([import(cdn(v, 'app')), import(cdn(v, 'auth')), import(cdn(v, 'firestore'))]);
      sdk = { v, app, auth, fs };
      return sdk;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Firebase SDK unavailable');
}

export async function loadFirebaseAI() {
  const { v } = await loadFirebaseSDK();
  return import(cdn(v, 'ai'));
}

export async function createFirebaseBackend() {
  const { app: A, auth: Au, fs: F } = await loadFirebaseSDK();
  const app = A.getApps().length ? A.getApps()[0] : A.initializeApp(FIREBASE_CONFIG);
  const auth = Au.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }
  const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, onSnapshot, getDocs, writeBatch } = F;

  let profileCache = null;
  const withId = (s) => ({ id: s.id, ...s.data() });

  async function isInstructor(email) {
    if (!email) return false;
    try {
      const s = await getDoc(doc(db, 'config', 'instructors'));
      const list = (s.exists() && s.data().emails) || [];
      return list.map((e) => e.toLowerCase()).includes(email.toLowerCase());
    } catch {
      return false;
    }
  }

  async function ensureProfile(user, extra = {}) {
    const ref = doc(db, 'profiles', user.uid);
    const snap = await getDoc(ref);
    const teacher = await isInstructor(user.email);
    if (!snap.exists()) {
      const p = {
        uid: user.uid,
        name: extra.name || user.displayName || (user.email || 'Usuario').split('@')[0],
        email: user.email || '',
        role: teacher ? 'teacher' : 'student',
        createdAt: Date.now(),
        careerId: null,
        roleId: null,
      };
      await setDoc(ref, p);
      return p;
    }
    const p = snap.data();
    // Promote/demote according to the allowlist so the console stays in sync with the rules.
    const want = teacher ? 'teacher' : 'student';
    if (p.role !== want) {
      try { await updateDoc(ref, { role: want }); p.role = want; } catch { /* rules may forbid; keep stored role */ }
    }
    return p;
  }

  const api = {
    mode: 'firebase',
    label: 'Conectado a Firebase (maritime-comms)',

    onAuth(cb) {
      return Au.onAuthStateChanged(auth, async (user) => {
        if (!user) { profileCache = null; cb(null); return; }
        try {
          profileCache = await ensureProfile(user);
          cb(profileCache);
        } catch (e) {
          console.error(e);
          cb({ uid: user.uid, name: user.displayName || user.email, email: user.email, role: 'student', offline: true });
        }
      });
    },
    async signIn(email, password) { await Au.signInWithEmailAndPassword(auth, email, password); },
    async signUp({ name, email, password }) {
      const cred = await Au.createUserWithEmailAndPassword(auth, email, password);
      await Au.updateProfile(cred.user, { displayName: name });
      profileCache = await ensureProfile(cred.user, { name });
    },
    async signInGoogle() { await Au.signInWithPopup(auth, new Au.GoogleAuthProvider()); },
    async resetPassword(email) { await Au.sendPasswordResetEmail(auth, email); },
    async signOut() { await Au.signOut(auth); },
    async idToken() { return auth.currentUser ? auth.currentUser.getIdToken() : null; },
    async getProfile(id) { const s = await getDoc(doc(db, 'profiles', id)); return s.exists() ? s.data() : null; },
    async updateProfile(id, patch) { await updateDoc(doc(db, 'profiles', id), patch); return { ...(profileCache || {}), ...patch }; },
    async listProfiles(filter = {}) {
      const q = filter.role ? query(collection(db, 'profiles'), where('role', '==', filter.role)) : collection(db, 'profiles');
      return (await getDocs(q)).docs.map((d) => d.data());
    },

    // ---------- labs ----------
    async createLab(data) {
      const id = makeId('lab_');
      const lab = { id, code: joinCode(), status: 'briefing', createdAt: Date.now(), updatedAt: Date.now(), ...data };
      await setDoc(doc(db, 'labs', id), lab);
      return lab;
    },
    async getLab(id) { const s = await getDoc(doc(db, 'labs', id)); return s.exists() ? withId(s) : null; },
    async findLabByCode(code) {
      const s = await getDocs(query(collection(db, 'labs'), where('code', '==', code.trim().toUpperCase())));
      return s.docs.map(withId).find((l) => l.status !== 'archived') || null;
    },
    async listLabs({ ownerUid } = {}) {
      const q = ownerUid ? query(collection(db, 'labs'), where('ownerUid', '==', ownerUid)) : collection(db, 'labs');
      return (await getDocs(q)).docs.map(withId).sort((a, b) => b.createdAt - a.createdAt);
    },
    async updateLab(id, patch) { await updateDoc(doc(db, 'labs', id), { ...patch, updatedAt: Date.now() }); },
    watchLab(id, cb) { return onSnapshot(doc(db, 'labs', id), (s) => cb(s.exists() ? withId(s) : null), (e) => console.error(e)); },
    watchLabs(cb) { return onSnapshot(collection(db, 'labs'), (s) => cb(s.docs.map(withId).sort((a, b) => b.createdAt - a.createdAt))); },

    async joinLab(labId, member) {
      const ref = doc(db, 'labs', labId, 'crew', member.uid);
      const s = await getDoc(ref);
      const data = { ...(s.exists() ? s.data() : {}), ...member, joinedAt: s.exists() ? s.data().joinedAt : Date.now(), lastSeen: Date.now() };
      await setDoc(ref, data);
      return data;
    },
    async updateCrew(labId, memberUid, patch) { await updateDoc(doc(db, 'labs', labId, 'crew', memberUid), patch); },
    async removeCrew(labId, memberUid) { await deleteDoc(doc(db, 'labs', labId, 'crew', memberUid)); },
    watchCrew(labId, cb) { return onSnapshot(collection(db, 'labs', labId, 'crew'), (s) => cb(s.docs.map((d) => d.data()))); },
    async getCrew(labId) { return (await getDocs(collection(db, 'labs', labId, 'crew'))).docs.map((d) => d.data()); },

    async sendComm(labId, msg) {
      const id = makeId('m_');
      const data = { id, ts: Date.now(), ...msg };
      await setDoc(doc(db, 'labs', labId, 'comms', id), data);
      return data;
    },
    async updateComm(labId, id, patch) { await updateDoc(doc(db, 'labs', labId, 'comms', id), patch); },
    watchComms(labId, cb) {
      return onSnapshot(query(collection(db, 'labs', labId, 'comms'), orderBy('ts')), (s) => cb(s.docs.map((d) => d.data())));
    },
    async getComms(labId) { return (await getDocs(query(collection(db, 'labs', labId, 'comms'), orderBy('ts')))).docs.map((d) => d.data()); },

    async addEvent(labId, ev) {
      const id = makeId('e_');
      const data = { id, ts: Date.now(), status: 'active', acks: {}, ...ev };
      await setDoc(doc(db, 'labs', labId, 'events', id), data);
      return data;
    },
    async updateEvent(labId, id, patch) {
      const flat = { ...patch };
      if (patch.acks) { delete flat.acks; for (const [k, v] of Object.entries(patch.acks)) flat[`acks.${k}`] = v; }
      await updateDoc(doc(db, 'labs', labId, 'events', id), flat);
    },
    watchEvents(labId, cb) {
      return onSnapshot(query(collection(db, 'labs', labId, 'events'), orderBy('ts')), (s) => cb(s.docs.map((d) => d.data())));
    },
    async getEvents(labId) { return (await getDocs(query(collection(db, 'labs', labId, 'events'), orderBy('ts')))).docs.map((d) => d.data()); },

    // ---------- glossary ----------
    watchGlossary(cb) {
      let seeded = false;
      return onSnapshot(collection(db, 'glossaryTerms'), async (s) => {
        if (s.empty && !seeded && profileCache?.role === 'teacher') {
          seeded = true;
          await api.importTerms(seedGlossary());
          return;
        }
        cb(s.docs.map((d) => d.data()));
      });
    },
    async saveTerm(term) {
      const t = { ...term, id: term.id || makeId('t_'), updatedAt: Date.now(), createdAt: term.createdAt || Date.now() };
      await setDoc(doc(db, 'glossaryTerms', t.id), t);
      return t;
    },
    async deleteTerm(id) { await deleteDoc(doc(db, 'glossaryTerms', id)); },
    async importTerms(terms) {
      for (let i = 0; i < terms.length; i += 400) {
        const b = writeBatch(db);
        terms.slice(i, i + 400).forEach((t) => b.set(doc(db, 'glossaryTerms', t.id), { ...t, updatedAt: Date.now() }, { merge: true }));
        await b.commit();
      }
      return terms.length;
    },

    // ---------- portfolio ----------
    async listPortfolio(ownerUid) {
      return (await getDocs(collection(db, 'portfolios', ownerUid, 'entries'))).docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt);
    },
    watchPortfolio(ownerUid, cb) {
      return onSnapshot(collection(db, 'portfolios', ownerUid, 'entries'), (s) => cb(s.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt)));
    },
    async addPortfolioEntry(ownerUid, entry) {
      const e = { id: makeId('p_'), createdAt: Date.now(), ownerUid, ...entry };
      await setDoc(doc(db, 'portfolios', ownerUid, 'entries', e.id), e);
      return e;
    },
    async updatePortfolioEntry(ownerUid, id, patch) { await updateDoc(doc(db, 'portfolios', ownerUid, 'entries', id), patch); },
    async deletePortfolioEntry(ownerUid, id) { await deleteDoc(doc(db, 'portfolios', ownerUid, 'entries', id)); },

    // ---------- missions ----------
    async saveMissionRun(run) {
      const r = { id: run.id || makeId('r_'), updatedAt: Date.now(), ...run };
      await setDoc(doc(db, 'missionRuns', r.id), r);
      return r;
    },
    async listMissionRuns({ uid: owner } = {}) {
      const q = owner ? query(collection(db, 'missionRuns'), where('uid', '==', owner)) : collection(db, 'missionRuns');
      return (await getDocs(q)).docs.map((d) => d.data()).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async getConfig(name) { const s = await getDoc(doc(db, 'config', name)); return s.exists() ? s.data() : null; },
    async setConfig(name, value) { await setDoc(doc(db, 'config', name), value, { merge: true }); return value; },
    firebaseApp: app,
  };
  return api;
}
