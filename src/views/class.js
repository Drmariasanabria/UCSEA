// Teacher: class analytics + research toolkit (pre/post questionnaire, pseudonymised exports).
import { h, mount, icon, tabs } from '../core/dom.js';
import { go } from '../core/store.js';
import { db } from '../backend/index.js';
import { barChart } from '../ui/charts.js';
import { careerById, roleById, CAREERS } from '../data/careers.js';
import { MISSIONS } from '../data/missions.js';
import { structureById } from '../data/smcp.js';
import { QUESTIONNAIRE, pseudonym, scale } from '../data/research.js';
import { download, csvEscape, initials, fmtDate } from '../core/util.js';
import { analyze } from '../ai/analyzer.js';

export default async function render(root, { user }) {
  if (user.role !== 'teacher') { go(''); return; }
  const api = db();
  mount(root, h('div.page', h('div.empty', h('div.sonar', { style: { margin: '0 auto' } }), h('p', 'Calculando analíticas…'))));
  const [students, labs, runs] = await Promise.all([api.listProfiles({ role: 'student' }).catch(() => []), api.listLabs({ ownerUid: user.uid }).catch(() => []), api.listMissionRuns({}).catch(() => [])]);
  const portfolios = Object.fromEntries(await Promise.all(students.map(async (s) => [s.uid, await api.listPortfolio(s.uid).catch(() => [])])));
  const labComms = await Promise.all(labs.slice(0, 30).map(async (l) => ({ lab: l, comms: await api.getComms(l.id).catch(() => []), crew: await api.getCrew(l.id).catch(() => []) })));
  let tab = 'overview';
  const body = h('div');
  const salt = localStorage.getItem('mesim10:salt') || (() => { const s = Math.random().toString(36).slice(2); localStorage.setItem('mesim10:salt', s); return s; })();

  const draw = () => {
    mount(root, h('div.page',
      h('div.page-head', h('div', h('span.eyebrow', 'Docente'), h('h2', 'Clase, analíticas e investigación'), h('p', `${students.length} estudiantes · ${labs.length} sesiones del Lab · ${runs.filter((r) => r.finished).length} misiones completadas`))),
      tabs([{ id: 'overview', label: 'Estudiantes', icon: 'users' }, { id: 'language', label: 'Estructuras', icon: 'graph' }, { id: 'missions', label: 'Misiones', icon: 'flag' }, { id: 'research', label: 'Investigación (pre/post)', icon: 'doc' }], tab, (t) => { tab = t; draw(); }),
      h('div', { style: { height: '16px' } }), body));
    ({ overview, language, missions, research })[tab]();
  };

  function overview() {
    mount(body, h('div.panel', h('table',
      h('thead', h('tr', ['Estudiante', 'Titulación', 'Sesiones Lab', 'Misiones', 'Media misiones', 'Precisión SMCP', 'Glosario', ''].map((x) => h('th', x)))),
      h('tbody', students.map((s) => {
        const p = portfolios[s.uid] || [];
        const labsP = p.filter((e) => e.type === 'lab' && e.stats);
        const acc = labsP.filter((e) => e.stats.smcpAccuracy != null);
        const my = runs.filter((r) => r.uid === s.uid && r.finished);
        return h('tr',
          h('td', h('div.row', h('div.avatar.sm', { style: { background: careerById(s.careerId)?.color } }, initials(s.name)), h('b', s.name))),
          h('td', careerById(s.careerId)?.short || '—'),
          h('td.mono', labComms.filter((x) => x.crew.some((c) => c.uid === s.uid)).length),
          h('td.mono', my.length),
          h('td.mono', my.length ? Math.round(my.reduce((a, r) => a + r.score, 0) / my.length) : '—'),
          h('td.mono', acc.length ? Math.round(acc.reduce((a, e) => a + e.stats.smcpAccuracy, 0) / acc.length) + '%' : '—'),
          h('td.mono', p.filter((e) => e.type === 'glossary').length),
          h('td', h('button.btn.small', { onclick: () => go('portfolio/' + s.uid) }, icon('folder'), 'Portafolio')));
      })))),
    h('div.grid.g4', { style: { marginTop: '16px' } }, CAREERS.map((c) => h('div.kpi', h('b', students.filter((s) => s.careerId === c.id).length), h('span', c.es)))));
  }

  function language() {
    const totals = {};
    let n = 0;
    for (const { comms } of labComms) for (const m of comms) {
      if (!['radio', 'intercom', 'log'].includes(m.kind) || !m.fromUid || m.fromUid.startsWith('npc')) continue;
      n++;
      for (const [k, v] of Object.entries((m.analysis || analyze(m.text)).structures || {})) totals[k] = (totals[k] || 0) + v.length;
    }
    const items = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: structureById(k)?.es.split(' (')[0] || k, value: v }));
    const issues = {};
    for (const { comms } of labComms) for (const m of comms) for (const i of m.analysis?.issues || []) issues[i.es] = (issues[i.es] || 0) + 1;
    mount(body, h('div.grid.g2',
      h('div.panel', h('h4', `Estructuras usadas por la clase (${n} mensajes)`), barChart(items, { title: 'Usos' })),
      h('div.panel', h('h4', 'Errores de procedimiento más frecuentes'), barChart(Object.entries(issues).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k.split(':')[0].slice(0, 60), value: v })), { title: 'Incidencias', color: '#ffb547' }))));
  }

  function missions() {
    mount(body, h('div.panel', h('table',
      h('thead', h('tr', ['Misión', 'Intentos', 'Completadas', 'Media', 'Mejor', 'Tiempo medio'].map((x) => h('th', x)))),
      h('tbody', MISSIONS.map((m) => {
        const r = runs.filter((x) => x.missionId === m.id);
        const f = r.filter((x) => x.finished);
        return h('tr', h('td', h('b', m.title), h('div.small', m.es)), h('td.mono', r.length), h('td.mono', f.length),
          h('td.mono', f.length ? Math.round(f.reduce((a, x) => a + x.score, 0) / f.length) : '—'), h('td.mono', f.length ? Math.max(...f.map((x) => x.score)) : '—'),
          h('td.mono', f.length ? Math.round(f.reduce((a, x) => a + (x.durationMs || 0), 0) / f.length / 60000) + ' min' : '—'));
      }))),
      h('button.btn', { style: { marginTop: '12px' }, onclick: () => {
        const rows = [['pseudonym', 'career', 'mission', 'finished', 'score', 'duration_min', 'phase_scores', 'date']];
        for (const r of runs) { const s = students.find((x) => x.uid === r.uid); rows.push([pseudonym(r.uid, salt), s?.careerId || '', r.missionId, r.finished ? 1 : 0, r.score, Math.round((r.durationMs || 0) / 60000), (r.scores || []).map((x) => (x == null ? '' : Math.round(x * 100))).join('|'), new Date(r.startedAt || r.updatedAt).toISOString()]); }
        download('mission-results-pseudonymised.csv', '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv');
      } }, icon('download'), 'Exportar resultados (CSV seudonimizado)')));
  }

  function research() {
    const resp = [];
    for (const s of students) for (const e of portfolios[s.uid] || []) if (e.type === 'research' && e.consent) resp.push({ s, e });
    const by = (phase) => resp.filter((r) => r.e.phase === phase);
    const mean = (list, item) => { const v = list.map((r) => scale(r.e.answers, item)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const pre = by('pre');
    const post = by('post');
    const rows = QUESTIONNAIRE.map((q) => ({ q, pre: mean(pre, q), post: mean(post, q) }));
    mount(body,
      h('div.grid.g4', { style: { marginBottom: '16px' } }, h('div.kpi', h('b', pre.length), h('span', 'respuestas PRE')), h('div.kpi', h('b', post.length), h('span', 'respuestas POST')),
        h('div.kpi', h('b', new Set(pre.map((r) => r.s.uid)).size && new Set(post.map((r) => r.s.uid)).size ? [...new Set(pre.map((r) => r.s.uid))].filter((u) => post.some((p) => p.s.uid === u)).length : 0), h('span', 'pares pre/post'))),
      h('div.panel', h('h4', 'Medias por ítem (1–5; ítems inversos ya recodificados)'),
        h('table', h('thead', h('tr', h('th', 'Ítem'), h('th', 'Dimensión'), h('th', 'PRE'), h('th', 'POST'), h('th', 'Δ'))),
          h('tbody', rows.map((r) => h('tr', h('td', r.q.es), h('td.small', r.q.dim), h('td.mono', r.pre?.toFixed(2) ?? '—'), h('td.mono', r.post?.toFixed(2) ?? '—'),
            h('td.mono', { style: { color: r.pre != null && r.post != null ? (r.post >= r.pre ? 'var(--c-safety)' : 'var(--c-danger)') : '' } }, r.pre != null && r.post != null ? (r.post - r.pre >= 0 ? '+' : '') + (r.post - r.pre).toFixed(2) : '—'))))),
        h('p.small', 'Diseño pre/post intra-sujeto. Para inferencia usa la exportación (prueba de Wilcoxon de rangos con signo por ítem/dimensión). Las medias descriptivas no prueban por sí solas un efecto de aprendizaje.'),
        h('div.row', { style: { marginTop: '10px' } },
          h('button.btn.primary', { onclick: () => {
            const head = ['pseudonym', 'career', 'phase', 'date', ...QUESTIONNAIRE.map((q) => q.id), 'o1', 'o2'];
            const lines = [head];
            for (const r of resp) lines.push([pseudonym(r.s.uid, salt), r.s.careerId || '', r.e.phase, new Date(r.e.createdAt).toISOString(), ...QUESTIONNAIRE.map((q) => r.e.answers?.[q.id] ?? ''), r.e.open?.o1 || '', r.e.open?.o2 || '']);
            download('questionnaire-pre-post-pseudonymised.csv', '﻿' + lines.map((l) => l.map(csvEscape).join(',')).join('\n'), 'text/csv');
          } }, icon('download'), 'Exportar CSV seudonimizado'),
          h('button.btn', { onclick: () => {
            const lines = [['pseudonym', 'career', 'lab_code', 'time', 'kind', 'channel', 'role', 'spoken', 'words', 'structures', 'issues']];
            for (const { lab, comms, crew } of labComms) for (const m of comms) {
              if (!['radio', 'intercom', 'log'].includes(m.kind) || !crew.some((c) => c.uid === m.fromUid)) continue;
              const a = m.analysis || analyze(m.text);
              lines.push([pseudonym(m.fromUid, salt), crew.find((c) => c.uid === m.fromUid)?.careerId || '', lab.code, new Date(m.ts).toISOString(), m.kind, m.channel, m.fromRoleId || '', m.spoken ? 1 : 0, a.words, Object.keys(a.structures || {}).join(' '), (a.issues || []).map((i) => i.code).join(' ')]);
            }
            download('lab-interactions-pseudonymised.csv', '﻿' + lines.map((l) => l.map(csvEscape).join(',')).join('\n'), 'text/csv');
          } }, icon('download'), 'Exportar interacciones del Lab (sin texto)'))),
      h('p.small', { style: { marginTop: '10px' } }, `Clave de seudonimización guardada solo en este navegador (${fmtDate(Date.now())}). Los estudiantes contestan el cuestionario desde Ajustes → Investigación.`));
  }

  draw();
  void roleById;
}
