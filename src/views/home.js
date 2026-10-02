// Home dashboard (student or teacher).
import { h, mount, icon } from '../core/dom.js';
import { go } from '../core/store.js';
import { db } from '../backend/index.js';
import { careerById, roleById } from '../data/careers.js';
import { scenarioById } from '../data/scenarios.js';
import { fmtDate } from '../core/util.js';
import { joinByCode } from './lab-hub.js';

export default async function render(root, { user }) {
  const api = db();
  const isT = user.role === 'teacher';
  const labs = await api.listLabs(isT ? { ownerUid: user.uid } : { active: true }).catch(() => []);
  const live = labs.filter((l) => l.status === 'running' || l.status === 'briefing');
  const portfolio = await api.listPortfolio(user.uid).catch(() => []);
  const career = careerById(user.careerId);
  const role = roleById(user.roleId);

  const codeInput = h('input', { placeholder: 'CÓDIGO', maxlength: 6, style: { fontFamily: 'var(--mono)', fontSize: '1.4rem', letterSpacing: '.3em', textTransform: 'uppercase', maxWidth: '220px' } });
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && joinByCode(codeInput.value));

  const labTile = h('div.panel.tile.primary',
    h('span.corner.tl'), h('span.corner.br'),
    icon('radio', 'xl'),
    h('span.eyebrow', 'Prioridad del curso'),
    h('h3', 'Real Communication Lab'),
    h('p.muted', isT
      ? 'Crea una sesión en directo, controla meteorología, tráfico, alarmas y eventos aleatorios, y evalúa cada intervención.'
      : 'Únete a la sesión de tu docente con el código y elige tu puesto: puente, máquinas, VTS, MRCC, oficina técnica, puerto…'),
    isT
      ? h('div.row', h('button.btn.primary.big', { onclick: () => go('lab?new=1') }, icon('plus'), 'Nueva sesión'), h('button.btn.big', { onclick: () => go('lab') }, 'Mis sesiones'))
      : h('div.row', codeInput, h('button.btn.primary.big', { onclick: () => joinByCode(codeInput.value) }, icon('anchor'), 'Embarcar')));

  const tiles = [
    { r: 'missions', ic: 'flag', t: 'Misiones ITM II', d: 'Simulaciones guiadas de ~15 minutos inspiradas en los casos de clase.' },
    { r: 'glossary', ic: 'graph', t: 'Glosario colaborativo', d: 'Lista y grafo dinámico estilo Obsidian. Importa, exporta y conecta términos.' },
    { r: 'portfolio', ic: 'folder', t: isT ? 'Portafolios' : 'Mi portafolio', d: isT ? 'Revisa y comenta el portafolio de cada estudiante.' : `${portfolio.length} evidencias guardadas. Exporta a PDF, Word o Markdown.` },
    ...(isT ? [{ r: 'class', ic: 'users', t: 'Clase y analíticas', d: 'Progreso por estudiante, estructuras dominadas y datos para investigación.' }] : []),
  ];

  mount(root, h('div.page',
    h('div.page-head',
      h('div', h('span.eyebrow', isT ? 'Consola docente' : 'Cuaderno de bitácora'), h('h2', `Bienvenida/o a bordo, ${user.name.split(' ')[0]}`),
        h('p', isT ? 'Todo lo que pasa en el simulador, bajo tu control.' : career ? `${career.es}${role ? ' · ' + role.es : ''}` : 'Elige tu titulación y tu puesto preferido en Ajustes para personalizar tareas y alarmas.')),
      !isT && !career ? h('button.btn', { onclick: () => go('settings') }, icon('user'), 'Elegir titulación') : null),
    live.length ? h('div.panel', { style: { marginBottom: '18px' } },
      h('div.panel-head', h('h4', icon('bolt'), isT ? 'Tus sesiones activas' : 'Sesiones en directo ahora')),
      h('div.grid.g3', live.slice(0, 6).map((l) => h('div.card.hoverable', { onclick: () => go(isT ? `control/${l.id}` : `lab/${l.id}`) },
        h('div.row.between', h('b', l.title || scenarioById(l.scenarioId).es), h('span.badge.' + (l.status === 'running' ? 'sev-safety' : 'sev-routine'), l.status === 'running' ? 'EN CURSO' : 'BRIEFING')),
        h('div.small', scenarioById(l.scenarioId).area),
        h('div.row.between', h('span.mono', { style: { color: 'var(--gold)' } }, l.code), h('span.small', fmtDate(l.createdAt))))))) : null,
    h('div.grid.g3', labTile, tiles.map((t) => h('div.panel.tile.card.hoverable', { onclick: () => go(t.r) }, icon(t.ic, 'xl'), h('h3', t.t), h('p.muted', t.d))))));
}
