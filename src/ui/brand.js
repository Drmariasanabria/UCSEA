// UCSea brand: an eye drawn by the horizon and a swell line ("you see"), with a radar pupil.
import { h } from '../core/dom.js';

let n = 0;
export function logoSVG(size = 40) {
  const g = `ucg${++n}`;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7be7ff"/><stop offset=".55" stop-color="#3fc4ff"/><stop offset="1" stop-color="#5ef2d6"/></linearGradient></defs>
  <path d="M4 33 C16 14 48 14 60 33" fill="none" stroke="url(#${g})" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M4 33 C14 45 22 47 32 44 C42 41 50 46 60 33" fill="none" stroke="url(#${g})" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="32" cy="31" r="9.5" fill="none" stroke="url(#${g})" stroke-width="2.4"/>
  <path d="M32 31 L39.5 25.5" stroke="#ffd36b" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="32" cy="31" r="2.6" fill="#ffd36b"/>
</svg>`;
}

export const wordmark = (cls = '') => h('span.wordmark' + cls, h('b', 'UC'), h('span', 'Sea'));
export const logo = (size) => h('span.logo', { html: logoSVG(size) });
