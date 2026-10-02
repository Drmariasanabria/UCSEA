// Personal portfolio (student) and portfolio browser (teacher).
import { h, mount, icon, toast, modal, field, confirmDialog } from '../core/dom.js';
import { go } from '../core/store.js';
import { db } from '../backend/index.js';
import { lineChart } from '../ui/charts.js';
import { careerById, roleById } from '../data/careers.js';
import { fmtDate, download, slugify, initials, readFileAsText } from '../core/util.js';
import { markdownToHtml, printHtml } from '../export/report.js';
import { buildDocx, markdownToBlocks } from '../export/docx.js';
import { RUBRIC } from './teacher-console.js';
import { sfx } from '../core/audio.js';

const TYPE = {
  lab: { icon: 'radio', es: 'Communication Lab' },
  mission: { icon: 'flag', es: 'Misión' },
  glossary: { icon: 'graph', es: 'Glosario' },
  assessment: { icon: 'trophy', es: 'Evaluación docente' },
  reflection: { icon: 'edit', es: 'Reflexión' },
  research: { icon: 'doc', es: 'Cuestionario' },
};

export default async function render(root, { path, user }) {
  const api = db();
  const target = path[1] || (user.role === 'teacher' ? null : user.uid);
  if (!target) return teacherIndex(root);
  const profile = target === user.uid ? user : await api.getProfile(target);
  const own = target === user.uid;
  const isT = user.role === 'teacher';
  let entries = [];

  const head = h('div');
  const stats = h('div');
  const list = h('div.timeline');
  mount(root, h('div.page', head, stats, h('div.panel', h('div.panel-head', h('h3', icon('log'), 'Evidencias'), own ? h('button.btn.small', { onclick: addReflection }, icon('plus'), 'Añadir reflexión') : null), list)));

  function drawHead() {
    const car = careerById(profile?.careerId);
    mount(head, h('div.page-head',
      h('div.row', h('div.avatar', { style: { width: '64px', height: '64px', fontSize: '1.4rem', background: car?.color } }, initials(profile?.name)),
        h('div', h('span.eyebrow', own ? 'Mi portafolio' : 'Portafolio del estudiante'), h('h2', { style: { margin: 0 } }, profile?.name || '—'),
          h('p', car ? `${car.es}${profile.roleId ? ' · ' + roleById(profile.roleId)?.es : ''}` : 'Titulación sin definir'))),
      h('div.row',
        h('button.btn', { onclick: () => exportPortfolio('pdf') }, icon('doc'), 'PDF'),
        h('button.btn', { onclick: () => exportPortfolio('docx') }, icon('doc'), 'Word'),
        h('button.btn', { onclick: () => exportPortfolio('md') }, icon('download'), 'Markdown'),
        h('button.btn', { onclick: () => exportPortfolio('json') }, icon('download'), 'JSON'),
        own ? h('button.btn.ghost', { onclick: importBackup }, icon('upload'), 'Importar copia') : null)));
  }

  function drawStats() {
    const labs = entries.filter((e) => e.type === 'lab' && e.stats).sort((a, b) => a.createdAt - b.createdAt);
    const missions = entries.filter((e) => e.type === 'mission');
    const terms = entries.filter((e) => e.type === 'glossary');
    const tx = labs.reduce((a, e) => a + (e.stats.messages || 0), 0);
    const acc = labs.filter((e) => e.stats.smcpAccuracy != null);
    const avg = acc.length ? Math.round(acc.reduce((a, e) => a + e.stats.smcpAccuracy, 0) / acc.length) : null;
    const pts = (k) => labs.map((e, i) => ({ label: `#${i + 1} · ${new Date(e.createdAt).toLocaleDateString('es-ES')}`, y: e.stats[k] ?? 0 }));
    mount(stats,
      h('div.grid.g4', { style: { marginBottom: '18px' } },
        h('div.kpi', h('b', labs.length), h('span', 'sesiones del Lab')),
        h('div.kpi', h('b', missions.length), h('span', 'misiones')),
        h('div.kpi', h('b', tx), h('span', 'transmisiones')),
        h('div.kpi', h('b', avg != null ? avg + '%' : '—'), h('span', 'precisión SMCP media')),
        h('div.kpi', h('b', terms.length), h('span', 'términos aportados'))),
      labs.length >= 1 ? h('div.grid.g2', { style: { marginBottom: '18px' } },
        h('div.panel', h('h4', 'Precisión SMCP por sesión'), lineChart(pts('smcpAccuracy'), { title: 'Precisión SMCP', yMax: 100, unit: '%' })),
        h('div.panel', h('h4', 'Variedad de estructuras por sesión'), lineChart(pts('variety'), { title: 'Estructuras distintas', color: '#5ff0d0' }))) : null);
  }

  function drawList() {
    if (!entries.length) return mount(list, h('p.muted', own ? 'Aún no hay evidencias. Guarda una sesión del Lab o completa una misión.' : 'Sin evidencias.'));
    mount(list, entries.map((e) => {
      const t = TYPE[e.type] || TYPE.reflection;
      const reportBox = h('div');
      return h('div.tl-item', h('div.panel',
        h('div.row.between', h('div.row', icon(t.icon, 'lg'), h('div', h('b', e.title), h('div.small', `${t.es} · ${fmtDate(e.createdAt)}`))),
          h('div.row', { style: { gap: '4px' } },
            own ? h('label.check.small', { title: 'Visible para compañeros con el enlace' }, h('input', { type: 'checkbox', checked: !!e.shared, onchange: (ev) => api.updatePortfolioEntry(target, e.id, { shared: ev.target.checked }) }), h('span', 'Compartir')) : null,
            own ? h('button.icon-btn', { onclick: async () => { if (await confirmDialog('Borrar evidencia', '¿Seguro?', 'Borrar')) { await api.deletePortfolioEntry(target, e.id); load(); } } }, icon('trash')) : null)),
        e.stats ? h('div.row', { style: { margin: '8px 0' } },
          h('span.badge', `✉ ${e.stats.messages ?? '—'}`), h('span.badge', `🎙 ${e.stats.spoken ?? 0}`), h('span.badge', `SMCP ${e.stats.smcpAccuracy ?? '—'}%`), h('span.badge', `variedad ${e.stats.variety ?? '—'}`)) : null,
        e.score != null ? h('div.row', h('span.badge.sev-safety', `Puntuación ${e.score}/${e.maxScore || 100}`), e.duration ? h('span.badge', e.duration) : null) : null,
        e.def ? h('p', h('b', e.term), ' — ', e.es ? h('i', e.es + '. ') : null, e.def) : null,
        e.rubric ? h('div.grid.g3', RUBRIC.map((r) => h('div.small', `${r.es}: `, h('b', e.rubric[r.id] ? `${e.rubric[r.id]}/4` : '—')))) : null,
        e.reflection ? h('div', h('h4', 'Reflexión'), h('p', { style: { whiteSpace: 'pre-wrap' } }, e.reflection)) : null,
        e.answers ? h('details', h('summary', 'Respuestas'), h('div', Object.entries(e.answers).map(([k, v]) => h('p.small', h('b', k + ': '), typeof v === 'string' ? v : JSON.stringify(v))))) : null,
        e.teacherComment ? h('div.task', { style: { borderColor: 'var(--gold)' } }, h('b', 'Comentario docente: '), e.teacherComment) : null,
        h('div.row', { style: { marginTop: '8px' } },
          e.reportMarkdown ? h('button.btn.small', { onclick: () => { if (reportBox.childElementCount) mount(reportBox); else mount(reportBox, h('div', { style: { background: '#fff', borderRadius: '12px', marginTop: '10px', maxHeight: '480px', overflow: 'auto' } }, h('iframe', { srcdoc: markdownToHtml(e.reportMarkdown, e.title), style: { width: '100%', height: '460px', border: 0 } }))); } }, icon('eye'), 'Informe') : null,
          own ? h('button.btn.small.ghost', { onclick: () => editReflection(e) }, icon('edit'), e.reflection ? 'Editar reflexión' : 'Añadir reflexión') : null,
          isT && !own ? h('button.btn.small', { onclick: () => commentDialog(e) }, icon('chat'), 'Comentar') : null),
        reportBox));
    }));
  }

  async function load() {
    entries = await api.listPortfolio(target).catch(() => []);
    if (!own && !isT) entries = entries.filter((e) => e.shared);
    drawStats();
    drawList();
  }

  function editReflection(e) {
    const ta = h('textarea', { rows: 6 }, e.reflection || '');
    modal({ title: 'Reflexión', body: field('¿Qué hiciste bien? ¿Qué cambiarías? ¿Qué estructuras quieres practicar?', ta), actions: [{ label: 'Guardar', kind: 'primary', onClick: async () => { await api.updatePortfolioEntry(target, e.id, { reflection: ta.value }); load(); } }] });
  }
  function addReflection() {
    const title = h('input', { placeholder: 'Mi progreso en comunicaciones VHF' });
    const ta = h('textarea', { rows: 6 });
    modal({ title: 'Nueva reflexión', body: h('div', field('Título', title), field('Texto', ta)), actions: [{ label: 'Guardar', kind: 'primary', onClick: async () => { await api.addPortfolioEntry(target, { type: 'reflection', title: title.value || 'Reflexión', reflection: ta.value }); sfx.success(); load(); } }] });
  }
  function commentDialog(e) {
    const ta = h('textarea', { rows: 4 }, e.teacherComment || '');
    modal({ title: 'Comentario docente', body: ta, actions: [{ label: 'Guardar', kind: 'primary', onClick: async () => { await api.updatePortfolioEntry(target, e.id, { teacherComment: ta.value }); load(); } }] });
  }

  function portfolioMarkdown() {
    const md = [`# Portfolio — ${profile?.name || ''}`, '', `${careerById(profile?.careerId)?.es || ''}`, `Exported ${fmtDate(Date.now())} · UCSea`, ''];
    for (const e of [...entries].reverse()) {
      md.push(`## ${e.title}`, `_${TYPE[e.type]?.es || e.type} · ${fmtDate(e.createdAt)}_`, '');
      if (e.stats) md.push(`Messages ${e.stats.messages} · spoken ${e.stats.spoken} · SMCP accuracy ${e.stats.smcpAccuracy ?? '—'}% · variety ${e.stats.variety}`, '');
      if (e.score != null) md.push(`**Score:** ${e.score}/${e.maxScore || 100}`, '');
      if (e.def) md.push(`**${e.term}** (${e.es || ''}): ${e.def}`, '');
      if (e.rubric) md.push(RUBRIC.map((r) => `- ${r.es}: ${e.rubric[r.id] || '—'}/4`).join('\n'), '');
      if (e.reflection) md.push('### Reflection', e.reflection, '');
      if (e.teacherComment) md.push(`> Teacher: ${e.teacherComment}`, '');
      if (e.answers) md.push(...Object.entries(e.answers).map(([k, v]) => `- **${k}:** ${typeof v === 'string' ? v : JSON.stringify(v)}`), '');
      if (e.transcript?.length) {
        md.push('| Time | Channel | To | Message |', '|---|---|---|---|');
        for (const m of e.transcript) md.push(`| ${new Date(m.ts).toTimeString().slice(0, 5)} | ${m.channel} | ${m.to || ''} | ${String(m.text).replace(/\|/g, '/')} |`);
        md.push('');
      }
    }
    return md.join('\n');
  }

  function exportPortfolio(fmt) {
    const name = `portfolio-${slugify(profile?.name || 'student')}`;
    const md = portfolioMarkdown();
    if (fmt === 'md') download(name + '.md', md, 'text/markdown');
    if (fmt === 'pdf') printHtml(markdownToHtml(md, 'Portfolio'));
    if (fmt === 'docx') download(name + '.docx', buildDocx(markdownToBlocks(md), { title: 'Portfolio ' + (profile?.name || '') }));
    if (fmt === 'json') download(name + '.json', JSON.stringify({ format: 'mesim-portfolio', profile: { name: profile?.name, careerId: profile?.careerId }, entries }, null, 2), 'application/json');
  }

  function importBackup() {
    const inp = h('input', { type: 'file', accept: '.json' });
    modal({ title: 'Importar copia del portafolio', body: inp, actions: [{ label: 'Importar', kind: 'primary', onClick: async () => {
      const f = inp.files[0];
      if (!f) return false;
      const data = JSON.parse(await readFileAsText(f));
      const have = new Set(entries.map((e) => e.id));
      let n = 0;
      for (const e of data.entries || []) if (!have.has(e.id)) { const { id, ...rest } = e; await api.addPortfolioEntry(target, rest); n++; }
      toast(`${n} evidencias importadas`, 'success');
      load();
    } }] });
  }

  drawHead();
  await load();
}

async function teacherIndex(root) {
  const api = db();
  const students = await api.listProfiles({ role: 'student' }).catch(() => []);
  const rows = await Promise.all(students.map(async (s) => ({ s, entries: await api.listPortfolio(s.uid).catch(() => []) })));
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', 'Docente'), h('h2', 'Portafolios del alumnado'), h('p', 'Abre cualquier portafolio, revisa evidencias y deja comentarios.'))),
    h('div.grid.g3', rows.length ? rows.map(({ s, entries }) => h('div.card.hoverable', { onclick: () => go('portfolio/' + s.uid) },
      h('div.row', h('div.avatar', { style: { background: careerById(s.careerId)?.color } }, initials(s.name)), h('div', h('b', s.name), h('div.small', careerById(s.careerId)?.short || '—'))),
      h('div.row', { style: { marginTop: '10px' } }, h('span.badge', `${entries.length} evidencias`), h('span.badge', `${entries.filter((e) => e.type === 'lab').length} labs`), h('span.badge', `${entries.filter((e) => e.type === 'mission').length} misiones`)))) : h('p.muted', 'Todavía no hay estudiantes registrados.'))));
}
