// Settings: profile, accessibility, backend, research questionnaire, setup help.
import { h, mount, icon, toast, field, select, confirmDialog } from '../core/dom.js';
import { app } from '../core/store.js';
import { db, setPreferredMode } from '../backend/index.js';
import { CAREERS, rolesFor, careerById } from '../data/careers.js';
import { QUESTIONNAIRE, OPEN_QUESTIONS, CONSENT_TEXT } from '../data/research.js';
import { savePrefs } from '../main.js';
import { englishVoices, speak } from '../core/speech.js';
import { sfx } from '../core/audio.js';

export default async function render(root, { user }) {
  const api = db();
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('mesim10:prefs') || '{}'); } catch { return {}; } })();
  let career = user.careerId || 'nautica';
  const name = h('input', { value: user.name });
  const roleBox = h('div');
  const drawRole = () => mount(roleBox, field('Puesto preferido', select([{ value: '', label: '—' }, ...rolesFor(career).map((r) => ({ value: r.id, label: `${r.es} · ${r.en}` }))], user.roleId || '', (v) => (user.roleId = v))));
  drawRole();
  const research = h('div');
  const entries = await api.listPortfolio(user.uid).catch(() => []);
  const done = (phase) => entries.some((e) => e.type === 'research' && e.phase === phase);

  function drawResearch(phase) {
    const answers = {};
    const open = {};
    let consent = false;
    mount(research, h('div',
      h('p.small', CONSENT_TEXT),
      h('label.check', h('input', { type: 'checkbox', onchange: (e) => (consent = e.target.checked) }), h('span', 'Doy mi consentimiento informado para participar.')),
      h('h4', phase === 'pre' ? 'Cuestionario inicial (PRE)' : 'Cuestionario final (POST)'),
      h('p.small', '1 = totalmente en desacuerdo · 5 = totalmente de acuerdo'),
      QUESTIONNAIRE.map((q) => h('div.task', h('div', q.es), h('div.small.dim', q.en),
        h('div.row', { style: { marginTop: '6px' } }, [1, 2, 3, 4, 5].map((v) => h('button.chip', { onclick: (e) => { answers[q.id] = v; [...e.target.parentNode.children].forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); } }, String(v)))))),
      OPEN_QUESTIONS.map((q) => field(q.es, h('textarea', { rows: 2, oninput: (e) => (open[q.id] = e.target.value) }))),
      h('button.btn.primary', { onclick: async () => {
        if (!consent) return toast('Marca el consentimiento para enviar (o no participes: no afecta a tu nota).', 'warn');
        if (Object.keys(answers).length < QUESTIONNAIRE.length) return toast('Responde a todos los ítems.', 'warn');
        await api.addPortfolioEntry(user.uid, { type: 'research', title: `Cuestionario ${phase.toUpperCase()}`, phase, consent: true, answers, open });
        sfx.success(); toast('¡Gracias! Respuestas guardadas.', 'success');
        mount(research, h('p', '✓ Enviado.'));
      } }, 'Enviar')));
  }

  const voices = englishVoices();
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', 'Ajustes'), h('h2', 'Tu puesto, accesibilidad y datos'))),
    h('div.grid.g2',
      h('div.panel', h('h3', icon('user'), ' Perfil'),
        field('Nombre visible', name),
        field('Titulación', select(CAREERS.map((c) => ({ value: c.id, label: c.es })), career, (v) => { career = v; user.roleId = ''; drawRole(); })),
        roleBox,
        h('button.btn.primary', { onclick: async () => { await api.updateProfile(user.uid, { name: name.value.trim() || user.name, careerId: career, roleId: user.roleId || null }); app.set({ user: { ...app.get().user, name: name.value.trim() || user.name, careerId: career, roleId: user.roleId || null } }); toast('Perfil guardado', 'success'); } }, 'Guardar perfil')),
      h('div.panel', h('h3', icon('eye'), ' Accesibilidad'),
        field('Tamaño de letra', select([{ value: 'm', label: 'Grande (por defecto)' }, { value: 'l', label: 'Muy grande' }, { value: 'xl', label: 'Extra grande (proyector)' }], prefs.size || 'm', (v) => savePrefs({ size: v }))),
        h('label.check', h('input', { type: 'checkbox', checked: !!prefs.contrast, onchange: (e) => savePrefs({ contrast: e.target.checked }) }), h('span', 'Alto contraste')),
        h('label.check', h('input', { type: 'checkbox', checked: prefs.sound !== false, onchange: (e) => savePrefs({ sound: e.target.checked }) }), h('span', 'Efectos de sonido y alarmas')),
        h('p.small', `${voices.length} voces en inglés disponibles en este navegador.`),
        h('button.btn.small', { onclick: () => speak('Nordic Kestrel, this is Channel Traffic. Traffic information. Over.', { persona: 'vts' }) }, icon('sound'), 'Probar voz de radio')),
      h('div.panel', h('h3', icon('doc'), ' Investigación (proyecto de innovación docente)'),
        h('p.small', 'Dos cuestionarios breves (inicio y final de curso) para medir el impacto del simulador.'),
        h('div.row', h('button.btn' + (done('pre') ? '.ghost' : '.primary'), { onclick: () => drawResearch('pre') }, done('pre') ? 'PRE ✓ (repetir)' : 'Hacer cuestionario PRE'),
          h('button.btn' + (done('post') ? '.ghost' : ''), { onclick: () => drawResearch('post') }, done('post') ? 'POST ✓ (repetir)' : 'Hacer cuestionario POST')),
        research),
      h('div.panel', h('h3', icon('settings'), ' Datos y conexión'),
        h('p', `Modo actual: `, h('b', api.mode === 'demo' ? 'Demostración (este navegador)' : 'Firebase (cuentas reales)')),
        h('div.row',
          api.mode === 'demo' ? h('button.btn', { onclick: () => setPreferredMode('firebase') }, 'Cambiar a Firebase') : h('button.btn', { onclick: () => setPreferredMode('demo') }, 'Cambiar a modo demo'),
          api.mode === 'demo' ? h('button.btn.danger', { onclick: async () => { if (await confirmDialog('Borrar datos demo', 'Se borrarán todas las sesiones, glosario y portafolios guardados en este navegador.', 'Borrar todo')) api.resetAll(); } }, 'Reiniciar datos demo') : null),
        user.role === 'teacher' ? h('details', { style: { marginTop: '12px' } }, h('summary', 'Configuración de Firebase para docentes'),
          h('ol.small',
            h('li', 'Firebase console → Authentication → activar «Correo/contraseña» y «Google».'),
            h('li', 'Firestore → crear el documento config/instructors con el campo emails (array) con los correos docentes.'),
            h('li', 'Firestore → Reglas: publicar el contenido de firestore.rules del repositorio.'),
            h('li', 'IA sin claves en el navegador: Firebase console → AI Logic → «Get started» con Gemini Developer API (plan gratuito).'),
            h('li', 'Opcional (Claude): desplegar functions/ con el secreto ANTHROPIC_API_KEY y pegar la URL en la pestaña IA de la consola.'))) : null)),
    h('p.small.center', { style: { marginTop: '24px' } }, `MAR-ESP SIM UC v10 · ${careerById(user.careerId)?.es || ''} · Universidad de Cantabria · Proyecto de innovación docente`)));
}
