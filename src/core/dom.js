// Tiny hyperscript + UI primitives (toasts, modal, confirm). No framework.
import { escapeHtml } from './util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * h('div.card#id', { onclick, class, style, dataset, html }, ...children)
 * Children may be strings, numbers, nodes, arrays, null/false (skipped).
 */
export function h(tag, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = {};
  }
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(root, ...children) {
  root.replaceChildren();
  appendChildren(root, children);
  return root;
}

export const icon = (name, cls = '') => {
  const span = document.createElement('span');
  span.className = 'ico ' + cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name] || ICONS.dot;
  return span;
};

// Line icons (24px viewBox), drawn for this app.
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
export const ICONS = {
  dot: svg('<circle cx="12" cy="12" r="3"/>'),
  radar: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="16" cy="9" r="1" fill="currentColor"/>'),
  radio: svg('<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M8 9l9-5"/><circle cx="9" cy="14.5" r="2.2"/><path d="M14 13h3M14 16h3"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  alarm: svg('<path d="M12 3a6 6 0 016 6v4l2 3H4l2-3V9a6 6 0 016-6z"/><path d="M10 19a2 2 0 004 0"/>'),
  ship: svg('<path d="M3 15l2 4h14l2-4H3z"/><path d="M6 15V9h12v6M9 9V5h6v4"/><path d="M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>'),
  anchor: svg('<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0014 0M9 10h6"/>'),
  wheel: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
  engine: svg('<rect x="4" y="8" width="13" height="9" rx="1"/><path d="M17 11h3v3h-3M8 8V5h5v3M7 12h7"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .7 3.3 2.3 4 5"/>'),
  book: svg('<path d="M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4z"/><path d="M20 4h-6a3 3 0 00-3 3"/><path d="M20 4v14h-7"/>'),
  graph: svg('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><circle cx="19" cy="17" r="1.6"/><path d="M8 7l7.6.6M7.2 8.2l3.8 7.6M16.8 9.1l-3.6 6.8M14.4 18l3-1"/>'),
  folder: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  wave: svg('<path d="M2 9c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>'),
  fog: svg('<path d="M4 9h16M2 13h20M5 17h14M8 5h8"/>'),
  wind: svg('<path d="M3 8h11a3 3 0 10-3-3M3 12h16a3 3 0 11-3 3M3 16h8"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  send: svg('<path d="M4 12l16-8-6 16-2-7z"/><path d="M12 13l8-9"/>'),
  log: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
  fire: svg('<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'),
  sos: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.5"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  map: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  logout: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>'),
  mute: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8 21h8M9 17h6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  link: svg('<path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1"/><path d="M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  doc: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  lifebuoy: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>'),
};

// ---------- toasts ----------
let toastHost;
export function toast(message, kind = 'info', ms = 3800) {
  if (!toastHost) {
    toastHost = h('div.toast-host', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const t = h('div.toast.' + kind, message);
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

// ---------- modal ----------
export function modal({ title, body, actions = [], wide = false, onClose } = {}) {
  const close = () => {
    overlay.classList.remove('in');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 250);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const footer = h('div.modal-actions',
    actions.map((a) => h('button.btn' + (a.kind ? '.' + a.kind : ''), {
      onclick: async () => { const r = await a.onClick?.(close); if (r !== false && !a.keepOpen) close(); },
    }, a.label)));
  const box = h('div.modal' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Diálogo' },
    h('div.modal-head', h('h3', title || ''), h('button.icon-btn', { 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
    h('div.modal-body', body),
    actions.length ? footer : null);
  const overlay = h('div.modal-overlay', { onclick: (e) => { if (e.target === overlay) close(); } }, box);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('in'));
  setTimeout(() => box.querySelector('input,textarea,select,button.btn')?.focus(), 60);
  return { close, box };
}

export function confirmDialog(title, text, okLabel = 'Confirmar', kind = 'danger') {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title,
      body: h('p', text),
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => { done = true; resolve(false); } },
        { label: okLabel, kind, onClick: () => { done = true; resolve(true); } },
      ],
    });
  });
}

export function promptDialog(title, label, value = '', { multiline = false, placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = multiline
      ? h('textarea', { rows: 5, placeholder }, value)
      : h('input', { value, placeholder });
    modal({
      title,
      body: h('label.field', h('span', label), input),
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => { done = true; resolve(null); } },
        { label: 'Aceptar', kind: 'primary', onClick: () => { done = true; resolve(input.value); } },
      ],
    });
  });
}

// Field helpers
export const field = (label, control, hint) =>
  h('label.field', h('span', label), control, hint ? h('small.hint', hint) : null);

export function select(options, value, onChange, attrs = {}) {
  return h('select', { ...attrs, onchange: (e) => onChange?.(e.target.value) },
    options.map((o) => {
      const opt = typeof o === 'string' ? { value: o, label: o } : o;
      return h('option', { value: opt.value, selected: opt.value === value }, opt.label);
    }));
}

export const safe = escapeHtml;

export function tabs(items, active, onChange) {
  return h('div.tabs', { role: 'tablist' },
    items.map((it) => h('button.tab' + (it.id === active ? '.active' : ''), {
      role: 'tab', 'aria-selected': it.id === active ? 'true' : 'false',
      onclick: () => onChange(it.id),
    }, it.icon ? icon(it.icon) : null, h('span', it.label), it.badge ? h('b.badge', it.badge) : null)));
}

export function emptyState(iconName, title, text, action) {
  return h('div.empty', icon(iconName, 'xl'), h('h3', title), text ? h('p', text) : null, action || null);
}
