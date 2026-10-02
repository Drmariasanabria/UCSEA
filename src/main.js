// App entry: boot, auth, router and global chrome.
import { h, mount, icon, toast } from './core/dom.js';
import { app, parseHash, go } from './core/store.js';
import { initBackend, db } from './backend/index.js';
import { startBackdrop } from './ui/backdrop.js';
import { logo, wordmark } from './ui/brand.js';
import { unlockAudio, setSoundEnabled, sfx, stopAllAlarms, stopAmbient } from './core/audio.js';
import { stopSpeaking } from './core/speech.js';
import { warmAiVoice } from './core/ai-voice.js';
import { initI18n, langSwitch } from './core/i18n.js';
import { initials } from './core/util.js';

const ROUTES = {
  '': () => import('./views/home.js'),
  login: () => import('./views/auth.js'),
  lab: () => import('./views/lab-hub.js'),
  control: () => import('./views/teacher-console.js'),
  debrief: () => import('./views/debrief.js'),
  bridge: () => import('./views/bridge-wall.js'),
  glossary: () => import('./views/glossary.js'),
  portfolio: () => import('./views/portfolio.js'),
  missions: () => import('./views/missions.js'),
  class: () => import('./views/class.js'),
  settings: () => import('./views/settings.js'),
};

let cleanup = null;
let backdrop = null;
export const getBackdrop = () => backdrop;

// How much of the photo shows through: clear on the landing page, dimmed where people work.
const VARIANT = { login: 'hero', '': 'hero', lab: 'focus', control: 'focus', bridge: 'focus', debrief: 'focus', missions: 'app', glossary: 'focus' };

function prefs() {
  try { return JSON.parse(localStorage.getItem('mesim10:prefs') || '{}'); } catch { return {}; }
}
export function savePrefs(p) {
  const next = { ...prefs(), ...p };
  localStorage.setItem('mesim10:prefs', JSON.stringify(next));
  applyPrefs(next);
}
function applyPrefs(p = prefs()) {
  document.documentElement.dataset.size = p.size || 'm';
  document.documentElement.dataset.contrast = p.contrast ? 'high' : '';
  setSoundEnabled(p.sound !== false);
  app.set({ sound: p.sound !== false });
}

function topbar(route) {
  const u = app.get().user;
  const isT = u?.role === 'teacher';
  const items = [
    { id: 'lab', label: isT ? 'Communication Lab' : 'Real Communication Lab', icon: 'radio' },
    { id: 'missions', label: 'Misiones', icon: 'flag' },
    { id: 'glossary', label: 'Glosario', icon: 'graph' },
    { id: 'portfolio', label: 'Portafolio', icon: 'folder' },
    ...(isT ? [{ id: 'class', label: 'Clase y analíticas', icon: 'users' }] : []),
  ];
  const soundOn = app.get().sound;
  return h('header.topbar',
    h('div.brand', { onclick: () => go(''), title: 'UCSea · Inicio' }, logo(38), wordmark()),
    h('nav.nav', { 'aria-label': 'Principal' }, items.map((it) =>
      h('a' + (route === it.id ? '.active' : ''), { href: '#/' + it.id }, icon(it.icon), it.label))),
    h('div.userbox',
      langSwitch(),
      h('span.mode-pill' + (db()?.mode === 'demo' ? '.demo' : ''), db()?.mode === 'demo' ? 'DEMO' : 'FIREBASE'),
      h('button.icon-btn', {
        title: soundOn ? 'Silenciar' : 'Activar sonido', 'aria-label': 'Sonido',
        onclick: () => { savePrefs({ sound: !soundOn }); if (!soundOn) sfx.success(); else { stopAllAlarms(); stopAmbient(); } render(); },
      }, icon(soundOn ? 'sound' : 'mute')),
      h('button.icon-btn', { title: 'Ajustes', 'aria-label': 'Ajustes', onclick: () => go('settings') }, icon('settings')),
      u ? h('div.avatar', { title: `${u.name} · ${u.role === 'teacher' ? 'Docente' : 'Estudiante'}` }, initials(u.name)) : null,
      u ? h('button.icon-btn', { title: 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: async () => { await db().signOut(); go('login'); } }, icon('logout')) : null));
}

async function render() {
  const { path, query } = parseHash();
  const route = path[0] || '';
  const user = app.get().user;
  const root = document.getElementById('app');
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  stopAllAlarms();
  stopSpeaking();
  backdrop?.setMood({ alarm: 0, fog: 0 });
  backdrop?.setVariant(VARIANT[route] || 'app');
  document.body.dataset.route = route || 'home';

  if (!user && route !== 'login') { go('login'); return; }
  if (user && route === 'login') { go(''); return; }

  const loader = ROUTES[route] || ROUTES[''];
  const mod = await loader();
  const shell = h('div');
  const content = h('main#main');
  mount(root, route === 'login' || route === 'bridge' ? null : topbar(route), content);
  try {
    cleanup = await mod.default(content, { path, query, user, rerender: render });
  } catch (e) {
    console.error(e);
    mount(content, h('div.page', h('div.panel', h('h2', 'Algo ha fallado'), h('p.muted', String(e.message || e)), h('button.btn', { onclick: () => go('') }, 'Volver al inicio'))));
  }
  void shell;
}

async function boot() {
  applyPrefs();
  initI18n();
  unlockAudio();
  backdrop = startBackdrop(document.getElementById('backdrop'));
  setTimeout(warmAiVoice, 2500);
  const api = await initBackend();
  if (api.fallbackReason) setTimeout(() => toast(api.fallbackReason, 'warn', 7000), 800);
  let first = true;
  api.onAuth((user) => {
    const prev = app.get().user;
    app.set({ user, backendMode: api.mode });
    if (first) {
      first = false;
      document.getElementById('boot')?.classList.add('out');
      setTimeout(() => document.getElementById('boot')?.remove(), 700);
      render();
    } else if ((prev?.uid || null) !== (user?.uid || null) || prev?.role !== user?.role) {
      render();
    }
  });
  window.addEventListener('hashchange', render);
}

boot();
