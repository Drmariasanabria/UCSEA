// Interface language. Spanish ("ES") is the source UI; "EN" shows the whole interface in English
// by translating rendered text with the dictionary in ../i18n/en.js (plus data that has its own
// English field). Glossary translations, radio messages and user-written text are never touched:
// anything inside [data-keep], .msg .text, inputs or textareas is skipped.
import { EN } from '../i18n/en.js';
import { STATIONS, CAREERS, ROLES } from '../data/careers.js';
import { SCENARIOS } from '../data/scenarios.js';
import { EVENTS } from '../data/events.js';
import { QUESTIONNAIRE } from '../data/research.js';
import { MISSIONS } from '../data/missions.js';

const prefs = () => { try { return JSON.parse(localStorage.getItem('mesim10:prefs') || '{}'); } catch { return {}; } };
let lang = prefs().lang === 'en' ? 'en' : 'es';
export const getLang = () => lang;
export const isEN = () => lang === 'en';

export function setLang(l) {
  const p = prefs();
  p.lang = l === 'en' ? 'en' : 'es';
  try { localStorage.setItem('mesim10:prefs', JSON.stringify(p)); } catch {}
  location.reload(); // a clean re-render in the chosen language
}

// ---------- dictionary ----------
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const exact = new Map();
const lower = new Map();
const templates = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PH = /\$\{[^}]*\}/g;

function add(es, en) {
  if (!es || en == null) return;
  if (es.includes('${')) {
    const vars = es.match(PH);
    const parts = es.split(PH);
    const re = new RegExp('^' + parts.map((p) => esc(norm(p) === '' ? p : p.replace(/\s+/g, ' '))).join('(.*?)') + '$', 's');
    templates.push({ re, vars, en, lit: parts.join('').length });
  } else if (!exact.has(norm(es))) exact.set(norm(es), en);
}
function build() {
  for (const [es, en] of Object.entries(EN)) add(es, en);
  for (const s of Object.values(STATIONS)) add(s.es, s.en);
  for (const c of CAREERS) { add(c.es, c.en); if (c.short) add(c.short, c.en.split(' ')[0]); }
  for (const r of ROLES) add(r.es, r.en);
  for (const s of SCENARIOS) add(s.es, s.en);
  for (const e of EVENTS) add(e.es, e.en);
  for (const q of QUESTIONNAIRE) add(q.es, q.en);
  for (const m of MISSIONS) add(m.es, ''); // the English title is already shown above it
  // short labels such as message tags use the part before the parenthesis
  for (const [k, v] of [...exact]) if (k.includes(' (') && typeof v === 'string') add(k.split(' (')[0], v.split(' (')[0]);
  for (const [k, v] of exact) lower.set(k.toLowerCase(), v);
}

let sorted = false;
const SEP = /(\n| · |: | — | – | \| )/;

function lookup(key) {
  let out = exact.get(key);
  if (out != null) return out;
  if (!sorted) { templates.sort((x, y) => y.lit - x.lit); sorted = true; }
  for (const tpl of templates) {
    const m = tpl.re.exec(key);
    if (!m) continue;
    const groups = m.slice(1).map((g) => exact.get(norm(g)) ?? g);
    out = tpl.en.replace(PH, (ph) => { const i = tpl.vars.indexOf(ph); return i >= 0 ? groups[i] ?? '' : ''; });
    if (out !== key) return out; // a generic pattern that changed nothing: keep looking
  }
  // ALL-CAPS headings built from data (e.g. alarm titles)
  if (key === key.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(key)) {
    const low = lower.get(key.toLowerCase());
    if (low != null) return low.toUpperCase();
  }
  // "1153 Something", "⚠ Something" — number or symbol prefix
  const pre = /^([^A-Za-zÁÉÍÓÚÑáéíóúñ¿¡]+)(.+)$/.exec(key);
  if (pre && pre[2] !== key) { const r = lookup(pre[2]); if (r != null) return pre[1] + r; }
  // "Transcurrido 27 s" — label followed by a number
  const suf = /^(.+?)(\s+[-+−]?\d[\s\S]*)$/.exec(key);
  if (suf) { const r = exact.get(suf[1]) ?? exact.get(suf[1] + ':'); if (r != null) return String(r).trim() + suf[2]; }
  // a piece that appears in the dictionary with a trailing colon ("Evento disparado: …")
  const c = exact.get(key + ':');
  if (c != null) return String(c).trim().replace(/:$/, '');
  return null;
}
export function t(s, depth = 0) {
  if (lang !== 'en' || typeof s !== 'string') return s;
  if (!exact.size) build();
  const key = norm(s);
  if (!key) return s;
  let out = lookup(key);
  // composite strings: translate the pieces around separators (·, :, —, new lines)
  if (out == null && depth < 2 && SEP.test(s)) {
    const parts = s.split(SEP);
    const tr = parts.map((p, i) => (i % 2 ? p : t(p, depth + 1)));
    if (tr.some((p, i) => p !== parts[i])) return tr.join('');
  }
  if (out == null) return s;
  const lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
  return lead + String(out).trim() + trail; // keep the original spacing so re-translation is stable
}

// ---------- live DOM translation ----------
const SKIP = '[data-keep], .msg:not(.system) .text, textarea, input, script, style, code, pre, .typewriter, [contenteditable]';
const ATTRS = ['placeholder', 'title', 'aria-label'];

const HAS_TEXT = /[A-Za-zÁÉÍÓÚÑáéíóúñ¿¡]/;
function translateText(n) {
  const p = n.parentElement;
  if (!p || p.closest(SKIP)) return;
  const v = n.data;
  if (!HAS_TEXT.test(v)) return;
  const out = t(v);
  if (out !== v) n.data = out;
}
function translateAttrs(el) {
  if (el.closest(SKIP) && !el.matches('input, textarea')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const out = t(v); if (out !== v) el.setAttribute(a, out); }
  }
}
function translateNode(n) {
  if (n.nodeType === 3) return translateText(n);
  if (n.nodeType !== 1) return;
  translateAttrs(n);
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
  for (let x = w.nextNode(); x; x = w.nextNode()) translateText(x);
  n.querySelectorAll?.('[placeholder], [title], [aria-label]').forEach(translateAttrs);
}

export function initI18n() {
  document.documentElement.lang = lang;
  if (lang !== 'en') return;
  build();
  translateNode(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else for (const n of m.addedNodes) translateNode(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// ---------- flag switch ----------
const FLAG_ES = '<svg viewBox="0 0 30 20" width="22" height="15" aria-hidden="true"><rect width="30" height="20" fill="#c60b1e"/><rect y="5" width="30" height="10" fill="#ffc400"/></svg>';
const FLAG_GB = '<svg viewBox="0 0 60 30" width="22" height="15" aria-hidden="true"><clipPath id="gbc"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="gbt"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#gbc)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#gbt)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>';

/** Two-flag language switch (ES = interface as designed, EN = full English interface). */
export function langSwitch() {
  const wrap = document.createElement('div');
  wrap.className = 'lang-switch';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Language / Idioma');
  wrap.setAttribute('data-keep', '');
  for (const [code, flag, label, title] of [['es', FLAG_ES, 'ES', 'Interfaz en español'], ['en', FLAG_GB, 'EN', 'Full English interface']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = code === lang ? 'on' : '';
    b.title = title;
    b.setAttribute('aria-pressed', String(code === lang));
    b.innerHTML = `${flag}<span>${label}</span>`;
    b.addEventListener('click', () => { if (code !== lang) setLang(code); });
    wrap.appendChild(b);
  }
  return wrap;
}
