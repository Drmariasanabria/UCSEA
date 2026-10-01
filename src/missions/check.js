// Criteria evaluation for mission phases (pure; unit-tested).
import { analyze, sentences } from '../ai/analyzer.js';
import { extract } from '../ai/local-engine.js';
import { wordCount } from '../core/util.js';

/**
 * @param {Array} criteria  see data/missions.js DSL
 * @param {string} text
 * @param {object} ctx      { bearing, range } for radar checks
 * @returns {{ results: {label, ok, weight}[], score: number }} score 0..1
 */
export function evaluate(criteria = [], text = '', ctx = {}) {
  const t = String(text || '');
  const a = analyze(t);
  const results = criteria.map((c) => {
    let ok = false;
    const min = c.min || 1;
    if (c.re) {
      const re = new RegExp(c.re, (c.flags || 'i').includes('g') ? c.flags || 'i' : (c.flags || 'i') + 'g');
      ok = (t.match(re) || []).length >= min;
    } else if (c.not) ok = !new RegExp(c.not, c.flags || 'i').test(t);
    else if (c.structure) ok = (a.structures[c.structure] || []).length >= min;
    else if (c.marker) ok = new RegExp(`\\b${c.marker}\\b`).test(t);
    else if (c.words) { const n = wordCount(t); ok = n >= c.words[0] && n <= c.words[1]; }
    else if (c.sentences) { const n = sentences(t).length; ok = n >= c.sentences[0] && n <= c.sentences[1]; }
    else if (c.numbers) { const nums = new Set(extract(t).numbers.map((x) => x.replace(/\.0+$/, ''))); ok = c.numbers.every((n) => nums.has(n) || t.includes(n)); }
    else if (c.check === 'bearing' && ctx.bearing != null) ok = extract(t).numbers.some((n) => Math.abs(angleDiff(+n, ctx.bearing)) <= 5 && +n <= 360);
    else if (c.check === 'range' && ctx.range != null) ok = extract(t).numbers.some((n) => Math.abs(+n - ctx.range) <= 0.3);
    return { label: c.label, ok, weight: c.weight || 1 };
  });
  const total = results.reduce((s, r) => s + r.weight, 0) || 1;
  const got = results.reduce((s, r) => s + (r.ok ? r.weight : 0), 0);
  return { results, score: got / total, analysis: a };
}

const angleDiff = (a, b) => ((a - b + 540) % 360) - 180;

// Fuzzy answer check for note-taking fields.
export function fieldOk(value = '', answers = []) {
  const v = String(value).toLowerCase().replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v) return false;
  return answers.some((ans) => {
    const a = String(ans).toLowerCase();
    return v === a || v.includes(a) || (a.length > 4 && a.includes(v) && v.length >= a.length * 0.6);
  });
}

// Scripted NPC replies for radio phases: first rule whose regex matches.
export function scriptedReply(rules = [], text = '') {
  for (const r of rules) if (new RegExp(r.if, 'i').test(text)) return r.say;
  return null;
}

// Kendall-tau-like ordering score (share of correctly ordered pairs).
export function orderScore(order, correct) {
  let ok = 0, n = 0;
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
    n++;
    if (correct.indexOf(order[i]) < correct.indexOf(order[j])) ok++;
  }
  return n ? ok / n : 1;
}
