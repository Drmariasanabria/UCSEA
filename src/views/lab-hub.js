// Lab hub: list/create sessions (teacher), join by code (student). /lab/:id opens the console.
import { h, mount, icon, toast, field, select, confirmDialog } from '../core/dom.js';
import { go, app } from '../core/store.js';
import { db } from '../backend/index.js';
import { SCENARIOS, scenarioById } from '../data/scenarios.js';
import { STRUCTURES } from '../data/smcp.js';
import { initialState } from '../sim/engine.js';
import { fmtDate } from '../core/util.js';
import { sfx } from '../core/audio.js';

export async function joinByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (c.length < 4) return toast('Introduce el código de 6 caracteres que muestra tu docente.', 'warn');
  const lab = await db().findLabByCode(c);
  if (!lab) { sfx.error(); return toast('No hay ninguna sesión activa con ese código.', 'error'); }
  sfx.success();
  go('lab/' + lab.id);
}

export const PRESET_GOALS = {
  radio: [{ id: 'callsign', count: 3 }, { id: 'marker', count: 4 }, { id: 'proword', count: 3 }],
  report: [{ id: 'data', count: 3 }, { id: 'hedge', count: 2 }, { id: 'time4', count: 2 }, { id: 'passive', count: 2 }],
  safety: [{ id: 'modal_obligation', count: 2 }, { id: 'no_need', count: 1 }, { id: 'sequence', count: 2 }, { id: 'imperative', count: 2 }],
  incident: [{ id: 'past_simple', count: 3 }, { id: 'cause', count: 2 }, { id: 'conditional', count: 2 }, { id: 'reported', count: 1 }],
};

export default async function render(root, ctx) {
  const id = ctx.path[1];
  if (id) {
    const mod = await import('./lab-console.js');
    return mod.default(root, ctx);
  }
  const user = ctx.user;
  if (user.role === 'teacher') return teacherHub(root, ctx);
  return studentHub(root, ctx);
}

async function studentHub(root) {
  const api = db();
  const code = h('input', { placeholder: 'ABC123', maxlength: 6, style: { fontFamily: 'var(--mono)', fontSize: '2rem', letterSpacing: '.35em', textAlign: 'center', textTransform: 'uppercase' } });
  code.addEventListener('keydown', (e) => e.key === 'Enter' && joinByCode(code.value));
  const list = h('div.grid.g3');
  const unsub = api.watchLabs((labs) => {
    const live = labs.filter((l) => l.status === 'running' || l.status === 'briefing');
    mount(list, live.length ? live.map((l) => h('div.card.hoverable', { onclick: () => go('lab/' + l.id) },
      h('b', l.title || scenarioById(l.scenarioId).es), h('div.small', `${l.ownerName || 'Docente'} · ${scenarioById(l.scenarioId).area}`),
      h('div.row.between', h('span.badge.sev-' + (l.status === 'running' ? 'safety' : 'routine'), l.status === 'running' ? 'EN CURSO' : 'BRIEFING'), h('span.small', fmtDate(l.createdAt)))))
      : h('p.muted', 'No hay sesiones abiertas ahora mismo.'));
  });
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', 'Real Communication Lab'), h('h2', 'Embarcar en una sesión'), h('p', 'Tu docente proyecta un código. Escríbelo aquí y elige tu puesto a bordo o en tierra.'))),
    h('div.grid.g2',
      h('div.panel', h('h3', 'Código de sesión'), code, h('div', { style: { height: '14px' } }), h('button.btn.primary.big', { style: { width: '100%' }, onclick: () => joinByCode(code.value) }, icon('anchor'), 'Embarcar')),
      h('div.panel', h('h3', 'Sesiones abiertas'), list))));
  return unsub;
}

async function teacherHub(root, ctx) {
  const api = db();
  const user = ctx.user;
  const listBox = h('div');
  async function refresh() {
    const labs = await api.listLabs({ ownerUid: user.uid });
    mount(listBox, labs.length ? h('table',
      h('thead', h('tr', ['Sesión', 'Escenario', 'Código', 'Estado', 'Creada', ''].map((x) => h('th', x)))),
      h('tbody', labs.map((l) => h('tr',
        h('td', h('b', l.title || '—')), h('td', scenarioById(l.scenarioId).es), h('td.mono', { style: { color: 'var(--gold)' } }, l.code),
        h('td', h('span.badge.sev-' + ({ running: 'safety', briefing: 'routine', paused: 'urgency', ended: 'routine' }[l.status] || 'routine'), statusEs(l.status))),
        h('td.small', fmtDate(l.createdAt)),
        h('td', h('div.row.end',
          h('button.btn.small.primary', { onclick: () => go('control/' + l.id) }, icon('sliders'), 'Consola'),
          h('button.btn.small', { onclick: () => go('debrief/' + l.id) }, icon('log'), 'Debriefing'),
          l.status !== 'archived' ? h('button.btn.small.ghost', { title: 'Archivar', onclick: async () => { if (await confirmDialog('Archivar sesión', '¿Archivar esta sesión? Seguirá disponible en el debriefing.', 'Archivar', 'warn')) { await api.updateLab(l.id, { status: 'archived' }); refresh(); } } }, icon('trash')) : null))))))
      : h('p.muted', 'Aún no has creado ninguna sesión.'));
  }
  refresh();
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', 'Consola docente'), h('h2', 'Sesiones del Communication Lab'), h('p', 'Prepara el escenario, las instrucciones de la tarea y los objetivos lingüísticos; después controla todo en directo.')),
      h('button.btn.primary.big', { onclick: () => wizard(root, user) }, icon('plus'), 'Nueva sesión')),
    h('div.panel', listBox)));
  if (ctx.query.new) wizard(root, user);
}

const statusEs = (s) => ({ briefing: 'Briefing', running: 'En curso', paused: 'Pausada', ended: 'Finalizada', archived: 'Archivada' }[s] || s);

function wizard(root, user) {
  const api = db();
  const st = {
    title: 'Sesión ' + new Date().toLocaleDateString('es-ES'),
    scenarioId: SCENARIOS[0].id,
    brief: 'Mantén la guardia en tu puesto. Cuando suene una alarma, comunica la información esencial a quien corresponda usando SMCP, marcadores de mensaje y datos con unidades.',
    goals: PRESET_GOALS.radio.concat(PRESET_GOALS.report.slice(0, 2)),
    random: { enabled: false, everyMin: 6, severities: ['routine', 'safety', 'urgency'] },
    aiProvider: 'auto',
    aiMode: 'auto',
    speakingRequired: false,
  };
  const scenGrid = h('div.grid.g3');
  const drawScen = () => mount(scenGrid, SCENARIOS.map((s) => h('div.card.hoverable', {
    style: s.id === st.scenarioId ? { boxShadow: '0 0 0 2px var(--gold)' } : {},
    onclick: () => { st.scenarioId = s.id; sfx.tick(); drawScen(); },
  }, h('b', s.es), h('div.small', s.area), h('p.small', { style: { marginTop: '6px' } }, s.blurb), h('div.small.mono', `${s.ownShip.name} · ${s.ownShip.type}`))));
  drawScen();

  const goalsBox = h('div');
  const drawGoals = () => mount(goalsBox,
    h('div.row', { style: { marginBottom: '10px' } }, h('span.small', 'Plantillas:'),
      Object.entries({ radio: 'Radio SMCP', report: 'Informes', safety: 'Seguridad / modales', incident: 'Narración de incidentes' }).map(([k, l]) =>
        h('button.chip', { onclick: () => { st.goals = PRESET_GOALS[k]; drawGoals(); } }, l))),
    h('div.grid.g3', STRUCTURES.map((s) => {
      const g = st.goals.find((x) => x.id === s.id);
      const cnt = h('input', { type: 'number', min: 1, max: 20, value: g?.count || 2, style: { width: '70px', minHeight: '38px' }, onchange: (e) => { const x = st.goals.find((y) => y.id === s.id); if (x) x.count = +e.target.value; } });
      return h('label.check', { title: s.ex },
        h('input', { type: 'checkbox', checked: !!g, onchange: (e) => { if (e.target.checked) st.goals.push({ id: s.id, count: +cnt.value }); else st.goals = st.goals.filter((x) => x.id !== s.id); } }),
        h('span.grow', s.es), cnt);
    })));
  drawGoals();

  const titleIn = h('input', { value: st.title, oninput: (e) => (st.title = e.target.value) });
  const brief = h('textarea', { rows: 4, oninput: (e) => (st.brief = e.target.value) }, st.brief);

  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', 'Nueva sesión'), h('h2', 'Preparar el escenario')),
      h('div.row', h('button.btn.ghost', { onclick: () => go('lab') }, 'Cancelar'), h('button.btn.primary.big', { onclick: create }, icon('play'), 'Crear y abrir consola'))),
    h('div.col',
      h('div.panel', field('Título de la sesión', titleIn), h('h4', '1 · Escenario'), scenGrid),
      h('div.panel', h('h4', '2 · Instrucciones para el alumnado'), brief,
        h('p.small', 'Se muestran a todos los puestos. Puedes cambiarlas en cualquier momento desde la consola.'),
        h('label.check', h('input', { type: 'checkbox', onchange: (e) => (st.speakingRequired = e.target.checked) }), h('span', 'Exigir que las transmisiones de radio se hagan hablando (PTT con reconocimiento de voz)'))),
      h('div.panel', h('h4', '3 · Estructuras lingüísticas obligatorias'), h('p.small', 'El analizador las detecta en tiempo real en cada mensaje y muestra el progreso a cada estudiante y a ti.'), goalsBox),
      h('div.panel', h('h4', '4 · Dirección del ejercicio'),
        h('div.grid.g3',
          field('Estaciones con IA', select([{ value: 'auto', label: 'Automático (Claude → Gemini → motor local)' }, { value: 'gemini', label: 'Gemini (Firebase AI Logic) → local' }, { value: 'local', label: 'Solo motor SMCP local (sin red)' }], st.aiProvider, (v) => (st.aiProvider = v))),
          field('Modo de respuesta IA', select([{ value: 'auto', label: 'Automático' }, { value: 'approve', label: 'Borrador IA + aprobación docente' }, { value: 'manual', label: 'Manual (el docente responde)' }], st.aiMode, (v) => (st.aiMode = v))),
          h('div', h('label.check', h('input', { type: 'checkbox', onchange: (e) => (st.random.enabled = e.target.checked) }), h('span', 'Eventos aleatorios desde el inicio')),
            field('Frecuencia media (min)', h('input', { type: 'number', min: 2, max: 60, value: 6, onchange: (e) => (st.random.everyMin = +e.target.value) }))))))));

  async function create() {
    const sc = scenarioById(st.scenarioId);
    const lab = await api.createLab({
      title: st.title,
      scenarioId: st.scenarioId,
      ownerUid: user.uid,
      ownerName: user.name,
      brief: st.brief,
      goals: st.goals,
      random: st.random,
      ai: { provider: st.aiProvider, mode: st.aiMode, persona: '' },
      speakingRequired: st.speakingRequired,
      variables: [],
      schedule: [],
      ...initialState(sc, 'new'),
    });
    sfx.success();
    toast(`Sesión creada. Código: ${lab.code}`, 'success');
    go('control/' + lab.id);
  }
  void app;
}
