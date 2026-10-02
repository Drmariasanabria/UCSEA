// Collaborative glossary: list, flashcards and Obsidian-style dynamic graph; import/export.
import { h, mount, icon, toast, modal, field, select, confirmDialog, tabs } from '../core/dom.js';
import { db } from '../backend/index.js';
import { GLOSSARY_CATEGORIES } from '../data/glossary-seed.js';
import { createForceGraph } from '../ui/force-graph.js';
import { toJSON, toCSV, toMarkdown, toObsidianZip, toAnki, fromJSON, fromCSV, fromMarkdownFiles, implicitLinks } from '../export/glossary-io.js';
import { unzipText } from '../export/zip.js';
import { download, readFileAsText, readFileAsArrayBuffer, slugify, fmtDate, shuffle } from '../core/util.js';
import { speak } from '../core/speech.js';
import { sfx } from '../core/audio.js';

const catColor = (c) => GLOSSARY_CATEGORIES[c]?.color || '#9bb6c9';

export default function render(root, { user, query }) {
  const api = db();
  let terms = [];
  let view = query.view || 'graph';
  let q = '';
  let cats = new Set();
  let showImplicit = true;
  let graph = null;
  let selected = null;

  const side = h('div.col');
  const main = h('div');
  mount(root, h('div.page',
    h('div.page-head',
      h('div', h('span.eyebrow', 'Colaborativo · todo el grupo'), h('h2', 'Glosario de inglés marítimo'),
        h('p', 'Cada término se conecta con otros: explora el grafo, añade términos, vota y enlaza. Exporta a Obsidian, Anki, Word o CSV, o importa tus notas.')),
      h('div.row', h('button.btn.primary', { onclick: () => editTerm(null) }, icon('plus'), 'Nuevo término'), h('button.btn', { onclick: importDialog }, icon('upload'), 'Importar'), h('button.btn', { onclick: exportDialog }, icon('download'), 'Exportar'))),
    h('div.gloss-layout', side, main)));

  function filtered() {
    const s = q.trim().toLowerCase();
    return terms.filter((t) => (!cats.size || cats.has(t.category)) &&
      (!s || [t.term, t.es, t.def, t.example].some((x) => (x || '').toLowerCase().includes(s))))
      .sort((a, b) => a.term.localeCompare(b.term));
  }

  function drawSide() {
    const search = h('input', { placeholder: 'Buscar término, traducción…', value: q, oninput: (e) => { q = e.target.value; graph?.setSearch(q); if (view !== 'graph') drawMain(); } });
    const counts = {};
    for (const t of terms) counts[t.category] = (counts[t.category] || 0) + 1;
    mount(side,
      h('div.panel', tabs([{ id: 'graph', label: 'Grafo', icon: 'graph' }, { id: 'list', label: 'Lista', icon: 'book' }, { id: 'cards', label: 'Tarjetas', icon: 'sparkle' }], view, (v) => { view = v; drawSide(); drawMain(); }),
        h('div', { style: { height: '12px' } }), search,
        h('div.small', { style: { marginTop: '8px' } }, `${terms.length} términos · ${terms.reduce((a, t) => a + (t.related?.length || 0), 0)} enlaces`)),
      h('div.panel', h('h4', 'Categorías'),
        h('div.col', { style: { gap: '4px' } }, Object.entries(GLOSSARY_CATEGORIES).map(([k, v]) => h('label.check',
          h('input', { type: 'checkbox', checked: cats.has(k), onchange: (e) => { e.target.checked ? cats.add(k) : cats.delete(k); drawMain(); } }),
          h('i', { style: { width: '12px', height: '12px', borderRadius: '50%', background: v.color, display: 'inline-block' } }),
          h('span.grow', v.es), h('span.small', counts[k] || 0))))),
      view === 'graph' ? h('div.panel', h('h4', 'Grafo'),
        h('label.check', h('input', { type: 'checkbox', checked: showImplicit, onchange: (e) => { showImplicit = e.target.checked; feedGraph(); } }), h('span', 'Enlaces implícitos (menciones)')),
        h('label.check', h('input', { type: 'checkbox', checked: true, onchange: (e) => graph?.setLabels(e.target.checked) }), h('span', 'Etiquetas')),
        h('div.row', h('button.btn.small', { onclick: () => graph?.reheat() }, 'Reorganizar'), h('button.btn.small', { onclick: () => graph?.fit() }, 'Centrar'),
          h('button.btn.small', { onclick: () => { const a = document.createElement('a'); a.href = graph.snapshot(); a.download = 'glossary-graph.png'; a.click(); } }, 'PNG')),
        h('p.small', 'Arrastra para orbitar en 3D · Mayús + arrastrar para desplazar · rueda para zoom · clic para seleccionar · doble clic para abrir. «Grafo local» ilumina solo los vecinos del término.')) : null);
  }

  function feedGraph() {
    if (!graph) return;
    const list = filtered();
    const ids = new Set(list.map((t) => t.id));
    const links = [];
    for (const t of list) for (const r of t.related || []) if (ids.has(r)) links.push({ source: t.id, target: r });
    if (showImplicit) for (const l of implicitLinks(list)) if (!links.some((x) => (x.source === l.source && x.target === l.target) || (x.source === l.target && x.target === l.source))) links.push(l);
    graph.setData(list.map((t) => ({ id: t.id, label: t.term, alt: t.es, category: t.category })), links);
  }

  const detail = h('div.panel.graph-side');
  function showDetail(t) {
    selected = t;
    if (!t) { detail.classList.add('hidden'); return; }
    detail.classList.remove('hidden');
    const byId = new Map(terms.map((x) => [x.id, x]));
    mount(detail, termCard(t, byId, { compact: true }),
      h('div.row', { style: { marginTop: '10px' } },
        h('button.btn.small', { onclick: () => { graph.setFocus(graph.focus?.id === t.id ? null : t.id, 1); } }, icon('target'), graph?.focus?.id === t.id ? 'Grafo global' : 'Grafo local'),
        h('button.btn.small', { onclick: () => graph.setFocus(t.id, 2) }, 'Profundidad 2'),
        h('button.btn.small.ghost', { onclick: () => showDetail(null) }, icon('x'))));
  }

  function drawMain() {
    graph?.destroy();
    graph = null;
    const list = filtered();
    const byId = new Map(terms.map((t) => [t.id, t]));
    if (view === 'graph') {
      const canvas = h('canvas');
      const legend = h('div.legend.panel', { style: { padding: '8px 12px' } }, Object.entries(GLOSSARY_CATEGORIES).map(([, v]) => h('span', h('i', { style: { background: v.color } }), v.es)));
      mount(main, h('div.graph-wrap', canvas, h('div.graph-hud', legend), detail));
      detail.classList.add('hidden');
      graph = createForceGraph(canvas, {
        colorOf: (n) => catColor(n.category),
        onSelect: (n) => { sfx.tick(); showDetail(byId.get(n.id)); },
        onOpen: (n) => editTerm(byId.get(n.id)),
      });
      feedGraph();
      if (q) graph.setSearch(q);
    } else if (view === 'list') {
      mount(main, list.length ? h('div.grid.g2', list.map((t) => h('div.panel', termCard(t, byId)))) : h('div.panel.empty', h('h3', 'Sin resultados')));
    } else {
      flashcards(main, list);
    }
  }

  function termCard(t, byId, { compact = false } = {}) {
    const mine = t.authorUid === user.uid || user.role === 'teacher';
    const voted = (t.voters || []).includes(user.uid);
    return h('div.term-card',
      h('div.row.between', h('span.t', t.term), h('span.badge', { style: { color: catColor(t.category), borderColor: catColor(t.category) } }, GLOSSARY_CATEGORIES[t.category]?.es || t.category)),
      t.es ? h('span.es', t.es) : null,
      h('p', { style: { margin: 0 } }, t.def),
      t.example ? h('div.ex', t.example) : null,
      t.related?.length ? h('div.row', { style: { gap: '4px' } }, t.related.map((r) => byId.get(r)).filter(Boolean).map((r) => h('button.chip', { onclick: () => { if (graph) { graph.select(r.id); showDetail(r); } else { q = r.term; drawSide(); drawMain(); } } }, r.term))) : null,
      h('div.row.between', { style: { marginTop: '6px' } },
        h('span.small', `${t.author || '—'}${t.updatedAt ? ' · ' + fmtDate(t.updatedAt) : ''}`),
        h('div.row', { style: { gap: '4px' } },
          h('button.icon-btn', { title: 'Pronunciar', onclick: () => speak(t.term + (t.example ? '. ' + t.example : ''), { radio: false }) }, icon('sound')),
          h('button.btn.small' + (voted ? '.primary' : ''), { title: 'Útil', onclick: () => vote(t) }, '▲ ' + (t.votes || 0)),
          mine && !compact ? h('button.icon-btn', { title: 'Editar', onclick: () => editTerm(t) }, icon('edit')) : null,
          compact ? h('button.icon-btn', { title: 'Editar', onclick: () => editTerm(t) }, icon('edit')) : null,
          mine && !compact ? h('button.icon-btn', { title: 'Borrar', onclick: async () => { if (await confirmDialog('Borrar término', `¿Borrar «${t.term}»?`, 'Borrar')) await api.deleteTerm(t.id); } }, icon('trash')) : null)));
  }

  async function vote(t) {
    const voters = new Set(t.voters || []);
    if (voters.has(user.uid)) voters.delete(user.uid); else voters.add(user.uid);
    await api.saveTerm({ ...t, voters: [...voters], votes: voters.size });
  }

  function editTerm(t) {
    const st = t ? { ...t } : { term: '', es: '', def: '', category: 'radar', example: '', related: [], tags: [] };
    const relBox = h('div.row', { style: { gap: '4px' } });
    const byId = new Map(terms.map((x) => [x.id, x]));
    const drawRel = () => mount(relBox, st.related.map((r) => h('span.chip.on', { onclick: () => { st.related = st.related.filter((x) => x !== r); drawRel(); } }, (byId.get(r)?.term || r) + ' ✕')));
    drawRel();
    const relIn = h('input', { list: 'gl-terms', placeholder: 'Escribe y pulsa Enter para enlazar…' });
    relIn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const target = terms.find((x) => x.term.toLowerCase() === relIn.value.trim().toLowerCase());
      if (target && !st.related.includes(target.id)) { st.related.push(target.id); drawRel(); relIn.value = ''; }
      else if (!target) toast('Ese término no existe todavía: créalo primero.', 'warn');
    });
    const inp = (k, ph) => h('input', { value: st[k] || '', placeholder: ph, oninput: (e) => (st[k] = e.target.value) });
    modal({
      title: t ? `Editar «${t.term}»` : 'Nuevo término',
      wide: true,
      body: h('div',
        h('div.grid.g2', field('Término (EN)', inp('term', 'close-quarters situation')), field('Traducción (ES)', inp('es', 'situación de aproximación excesiva'))),
        field('Definición (EN)', h('textarea', { rows: 3, oninput: (e) => (st.def = e.target.value) }, st.def || '')),
        field('Ejemplo de uso (frase real)', inp('example', 'The display suggests a developing close-quarters situation.')),
        field('Categoría', select(Object.entries(GLOSSARY_CATEGORIES).map(([k, v]) => ({ value: k, label: v.es })), st.category, (v) => (st.category = v))),
        field('Enlaces a otros términos', h('div', relIn, h('datalist#gl-terms', terms.map((x) => h('option', { value: x.term }))), h('div', { style: { marginTop: '6px' } }, relBox)))),
      actions: [{ label: 'Guardar', kind: 'primary', onClick: async () => {
        if (!st.term.trim()) { toast('Escribe el término', 'warn'); return false; }
        const id = t?.id || slugify(st.term);
        if (!t && terms.some((x) => x.id === id)) { toast('Ese término ya existe.', 'warn'); return false; }
        await api.saveTerm({ ...st, id, term: st.term.trim(), author: t?.author || user.name, authorUid: t?.authorUid || user.uid, status: 'approved' });
        // keep links bidirectional
        for (const r of st.related) {
          const other = terms.find((x) => x.id === r);
          if (other && !(other.related || []).includes(id)) await api.saveTerm({ ...other, related: [...(other.related || []), id] });
        }
        if (!t) await api.addPortfolioEntry(user.uid, { type: 'glossary', title: `Término añadido: ${st.term}`, term: st.term, es: st.es, def: st.def }).catch(() => {});
        sfx.success();
        toast('Término guardado', 'success');
      } }],
    });
  }

  function flashcards(container, list) {
    let deck = shuffle(list);
    let i = 0;
    let flipped = false;
    let known = 0;
    const box = h('div');
    const draw = () => {
      if (!deck.length) return mount(box, h('div.panel.empty', h('h3', 'No hay tarjetas')));
      const t = deck[i % deck.length];
      mount(box, h('div.panel', { style: { minHeight: '320px', display: 'grid', placeItems: 'center', textAlign: 'center', cursor: 'pointer' }, onclick: () => { flipped = !flipped; sfx.whoosh(); draw(); } },
        flipped
          ? h('div', h('div.t', { style: { font: '800 2rem var(--display)' } }, t.term), h('p', { style: { color: 'var(--accent-2)', fontSize: '1.3rem' } }, t.es), h('p.muted', t.def), t.example ? h('p', h('i', t.example)) : null)
          : h('div', h('span.eyebrow', GLOSSARY_CATEGORIES[t.category]?.es), h('div', { style: { font: '800 2.4rem var(--display)' } }, t.es || t.def), h('p.muted', 'Pulsa para ver el término en inglés'))),
        h('div.row', { style: { justifyContent: 'center', marginTop: '14px' } },
          h('button.btn', { onclick: () => { flipped = false; i++; draw(); } }, 'Repasar luego'),
          h('button.btn.success', { onclick: () => { known++; flipped = false; deck.splice(i % deck.length, 1); sfx.success(); draw(); } }, `Lo sé (${known})`),
          h('button.icon-btn', { onclick: () => speak(t.term, { radio: false }) }, icon('sound'))));
    };
    draw();
    mount(container, box);
  }

  function exportDialog() {
    const list = filtered();
    const byId = new Map(terms.map((t) => [t.id, t]));
    modal({
      title: `Exportar ${list.length} términos`,
      body: h('div.col',
        h('button.btn', { onclick: () => download('maritime-glossary.json', toJSON(list), 'application/json') }, icon('download'), 'JSON (reimportable)'),
        h('button.btn', { onclick: () => download('maritime-glossary.csv', toCSV(list, byId), 'text/csv;charset=utf-8') }, icon('download'), 'CSV (Excel / Google Sheets)'),
        h('button.btn', { onclick: () => download('maritime-glossary.md', toMarkdown(list, byId), 'text/markdown') }, icon('download'), 'Markdown (un archivo)'),
        h('button.btn.primary', { onclick: () => download('maritime-glossary-obsidian.zip', toObsidianZip(list)) }, icon('graph'), 'Bóveda de Obsidian (.zip con [[enlaces]])'),
        h('button.btn', { onclick: () => download('maritime-glossary-anki.txt', toAnki(list), 'text/plain') }, icon('sparkle'), 'Anki (tarjetas, TSV)'),
        h('p.small', 'Se exporta lo que estás viendo (aplica los filtros de búsqueda y categoría).')),
    });
  }

  function importDialog() {
    const input = h('input', { type: 'file', accept: '.json,.csv,.md,.zip,.txt', multiple: true });
    const out = h('div');
    modal({
      title: 'Importar términos',
      body: h('div', h('p.small', 'Acepta: JSON exportado por el simulador, CSV (columnas term, es, def, category, example, related), notas Markdown de Obsidian (.md) o una bóveda comprimida (.zip). Los términos existentes se fusionan.'), input, out),
      actions: [{ label: 'Importar', kind: 'primary', keepOpen: true, onClick: async (close) => {
        const files = [...input.files];
        if (!files.length) return toast('Elige uno o más archivos', 'warn');
        let parsed = [];
        try {
          const md = [];
          for (const f of files) {
            if (/\.json$/i.test(f.name)) parsed.push(...fromJSON(await readFileAsText(f)));
            else if (/\.(csv|txt)$/i.test(f.name)) parsed.push(...fromCSV(await readFileAsText(f)));
            else if (/\.md$/i.test(f.name)) md.push({ name: f.name, text: await readFileAsText(f) });
            else if (/\.zip$/i.test(f.name)) md.push(...(await unzipText(await readFileAsArrayBuffer(f))));
          }
          if (md.length) parsed.push(...fromMarkdownFiles(md));
        } catch (e) {
          return toast('No se pudo leer: ' + e.message, 'error');
        }
        parsed = parsed.map((t) => ({ ...t, author: t.author && t.author !== 'import' ? t.author : user.name, authorUid: user.uid }));
        const n = await api.importTerms(parsed);
        sfx.success();
        toast(`${n} términos importados`, 'success');
        close();
      } }],
    });
  }

  const unsub = api.watchGlossary((list) => {
    terms = list;
    drawSide();
    if (graph) feedGraph(); else drawMain();
    if (selected) showDetail(terms.find((t) => t.id === selected.id) || null);
  });
  drawSide();
  drawMain();
  return () => { unsub(); graph?.destroy(); };
}
