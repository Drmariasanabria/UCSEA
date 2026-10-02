// Glossary import/export: JSON, CSV, Markdown, Obsidian vault (.zip of .md with [[links]]), Anki TSV.
import { slugify, csvEscape, parseCSV } from '../core/util.js';
import { zip } from './zip.js';

const FIELDS = ['term', 'es', 'def', 'category', 'example', 'related', 'tags', 'author'];

export function toJSON(terms) {
  return JSON.stringify({ format: 'mesim-glossary', version: 1, exportedAt: new Date().toISOString(), terms: terms.map(clean) }, null, 2);
}

const clean = (t) => ({ id: t.id, term: t.term, es: t.es || '', def: t.def || '', category: t.category || 'language', example: t.example || '', related: t.related || [], tags: t.tags || [], author: t.author || '', votes: t.votes || 0 });

export function toCSV(terms, byId = new Map(terms.map((t) => [t.id, t]))) {
  const rows = [FIELDS];
  for (const t of terms) rows.push([t.term, t.es, t.def, t.category, t.example, (t.related || []).map((r) => byId.get(r)?.term || r).join('; '), (t.tags || []).join('; '), t.author || '']);
  return '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function toAnki(terms) {
  return terms.map((t) => [t.term, `${t.es || ''}<br>${t.def || ''}${t.example ? '<br><i>' + t.example + '</i>' : ''}`].map((x) => String(x).replace(/\t|\n/g, ' ')).join('\t')).join('\n');
}

export function toMarkdown(terms, byId = new Map(terms.map((t) => [t.id, t]))) {
  const lines = ['# Maritime English Glossary — MAR-ESP SIM UC', ''];
  for (const t of [...terms].sort((a, b) => a.term.localeCompare(b.term))) {
    lines.push(`## ${t.term}`);
    if (t.es) lines.push(`*ES:* ${t.es}  `);
    if (t.def) lines.push(t.def);
    if (t.example) lines.push(`> ${t.example}`);
    if (t.related?.length) lines.push(`Related: ${t.related.map((r) => byId.get(r)?.term || r).join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

function noteFor(t, byId) {
  const fm = ['---', `term: "${t.term.replace(/"/g, '\\"')}"`, `es: "${(t.es || '').replace(/"/g, '\\"')}"`, `category: ${t.category || 'language'}`, `tags: [${[...new Set([t.category, ...(t.tags || [])].filter(Boolean).map((x) => slugify(x)))].join(', ')}]`, `author: "${(t.author || '').replace(/"/g, '\\"')}"`, `id: ${t.id}`, '---', ''];
  const body = [`# ${t.term}`, '', t.es ? `**ES:** ${t.es}` : '', '', t.def || '', '', t.example ? `> ${t.example}` : '', '',
    t.related?.length ? '## Related' : '', ...(t.related || []).map((r) => `- [[${fileName(byId.get(r)?.term || r)}]]`)];
  return fm.join('\n') + body.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n') + '\n';
}

const fileName = (term) => String(term).replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();

export function toObsidianZip(terms) {
  const byId = new Map(terms.map((t) => [t.id, t]));
  const files = terms.map((t) => ({ name: `Maritime Glossary/${fileName(t.term)}.md`, data: noteFor(t, byId) }));
  const cats = [...new Set(terms.map((t) => t.category))];
  files.push({ name: 'Maritime Glossary/_Index.md', data: `# Maritime Glossary index\n\n${cats.map((c) => `## ${c}\n${terms.filter((t) => t.category === c).map((t) => `- [[${fileName(t.term)}]]`).join('\n')}`).join('\n\n')}\n` });
  return new Blob([zip(files)], { type: 'application/zip' });
}

// ---------------- import ----------------
export function fromJSON(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.terms || [];
  return normalise(arr);
}

export function fromCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map((x) => x.trim().toLowerCase().replace(/^﻿/, ''));
  const idx = (k, ...alts) => [k, ...alts].map((x) => head.indexOf(x)).find((i) => i >= 0);
  const iT = idx('term', 'término', 'termino', 'english'), iE = idx('es', 'spanish', 'español', 'espanol'), iD = idx('def', 'definition', 'definición'),
    iC = idx('category', 'categoría'), iX = idx('example', 'ejemplo'), iR = idx('related', 'relacionados'), iG = idx('tags', 'etiquetas');
  const terms = rows.slice(1).filter((r) => r[iT ?? 0]?.trim()).map((r) => ({
    term: r[iT ?? 0].trim(), es: (r[iE] || '').trim(), def: (r[iD] || '').trim(), category: (r[iC] || 'language').trim() || 'language',
    example: (r[iX] || '').trim(), relatedTerms: (r[iR] || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean), tags: (r[iG] || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean),
  }));
  return normalise(terms);
}

/** files: [{ name, text }] markdown notes (Obsidian style). */
export function fromMarkdownFiles(files) {
  const terms = [];
  for (const f of files.filter((x) => /\.md$/i.test(x.name) && !/_index\.md$/i.test(x.name))) {
    const text = f.text.replace(/\r/g, '');
    const fm = {};
    let body = text;
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (m) {
      body = text.slice(m[0].length);
      for (const line of m[1].split('\n')) {
        const kv = line.match(/^(\w+):\s*(.*)$/);
        if (kv) fm[kv[1]] = kv[2].replace(/^"|"$/g, '').replace(/\\"/g, '"');
      }
    }
    const title = fm.term || (body.match(/^#\s+(.+)$/m) || [])[1] || f.name.split('/').pop().replace(/\.md$/i, '');
    const es = fm.es || (body.match(/\*\*ES:\*\*\s*(.+)/) || [])[1] || '';
    const example = (body.match(/^>\s*(.+)$/m) || [])[1] || '';
    const links = [...body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((x) => x[1].trim());
    const def = body.replace(/^#.*$/gm, '').replace(/\*\*ES:\*\*.*$/m, '').replace(/^>.*$/gm, '').replace(/^- \[\[.*$/gm, '').replace(/^## Related$/m, '').replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').trim().split('\n\n')[0] || '';
    terms.push({ term: title.trim(), es: es.trim(), def: def.trim(), category: fm.category || 'language', example: example.trim(), relatedTerms: links, tags: [] });
  }
  return normalise(terms);
}

function normalise(arr) {
  const out = arr.filter((t) => t && (t.term || t.title)).map((t) => ({
    id: t.id || slugify(t.term || t.title),
    term: String(t.term || t.title).trim(),
    es: t.es || t.spanish || '',
    def: t.def || t.definition || '',
    category: t.category || 'language',
    example: t.example || '',
    related: Array.isArray(t.related) ? t.related : [],
    relatedTerms: t.relatedTerms || [],
    tags: t.tags || [],
    author: t.author || 'import',
    status: 'approved',
    votes: t.votes || 0,
  }));
  const byTerm = new Map(out.map((t) => [t.term.toLowerCase(), t.id]));
  for (const t of out) {
    if (t.relatedTerms.length) t.related = [...new Set([...t.related, ...t.relatedTerms.map((r) => byTerm.get(r.toLowerCase()) || slugify(r))])];
    delete t.relatedTerms;
  }
  return out;
}

// Implicit links: a term that appears in another term's definition or example.
export function implicitLinks(terms) {
  const links = [];
  const pats = terms.filter((t) => t.term.length >= 3).map((t) => ({ id: t.id, re: new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }));
  for (const t of terms) {
    const hay = `${t.def} ${t.example}`;
    for (const p of pats) if (p.id !== t.id && p.re.test(hay)) links.push({ source: t.id, target: p.id, implicit: true });
  }
  return links;
}
