// Settings: profile, accessibility, backend, research questionnaire, setup help.
import { h, mount, icon, toast, field, select, confirmDialog } from '../core/dom.js';
import { app } from '../core/store.js';
import { db, setPreferredMode } from '../backend/index.js';
import { CAREERS, rolesFor, careerById } from '../data/careers.js';
import { QUESTIONNAIRE, OPEN_QUESTIONS, CONSENT_TEXT } from '../data/research.js';
import { savePrefs } from '../main.js';
import { englishVoices, speak, voiceScore, stopSpeaking, lastVoiceEngine } from '../core/speech.js';
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

  // Voice picker: browser voices ranked by naturalness; the chosen one narrates and the best others play the stations.
  const voiceBox = h('div');
  const SAMPLE = 'Nordic Kestrel, this is Channel Traffic. Traffic information. Vessel on your starboard bow, range 2.4 NM, CPA 0.3 NM. What are your intentions? Over.';
  const stars = (v) => { const sc = voiceScore(v); return sc >= 100 ? '★★★ natural' : sc >= 70 ? '★★ alta' : sc >= 30 ? '★ buena' : 'básica'; };
  function drawVoices() {
    const list = englishVoices().filter((v) => voiceScore(v) > -100);
    const cur = prefs.voice || '';
    const best = list[0];
    const engineNote = h('span.small');
    const test = async (text, persona) => {
      stopSpeaking();
      engineNote.textContent = prefs.aiVoice !== false ? 'Generando voz IA… (unos segundos)' : '';
      await speak(text, { persona, ai: true });
      engineNote.textContent = lastVoiceEngine() === 'ai' ? '✓ Has escuchado la voz IA (Gemini).' : 'Has escuchado la voz del navegador (la voz IA no estaba disponible o está desactivada).';
    };
    mount(voiceBox,
      h('label.check', h('input', { type: 'checkbox', checked: prefs.aiVoice !== false, onchange: (e) => { savePrefs({ aiVoice: e.target.checked }); prefs.aiVoice = e.target.checked; } }),
        h('span', h('b', 'Voz IA natural (Gemini)'), ' — entiende el contexto (tono de VTS, Mayday, práctico…) y suena con efecto de radio VHF. Gratuita con cuota diaria limitada; si falla o se agota, se usan automáticamente las voces del navegador.')),
      h('div.tip-edge', icon('sparkle'), h('div',
        h('b', 'Recomendado: usa Microsoft Edge.'),
        h('span', ' Edge incluye gratis voces neuronales «Natural» que suenan casi humanas; UCSea las elige solas cuando la voz IA no está disponible. En Chrome se usan las voces de Google; en Safari puedes instalar voces «Mejoradas/Premium» en Ajustes del sistema → Accesibilidad → Contenido leído.'))),
      field('Voz del navegador (respaldo)', select([{ value: '', label: best ? `Automática · ${best.name} (${stars(best)})` : 'Automática' }, ...list.slice(0, 24).map((v) => ({ value: v.name, label: `${v.name} · ${v.lang} · ${stars(v)}` }))], cur, (v) => { savePrefs({ voice: v || null }); prefs.voice = v || null; stopSpeaking(); speak(SAMPLE, { persona: 'default' }); })),
      h('div.row', h('button.btn.small', { onclick: () => test(SAMPLE, 'vts') }, icon('sound'), 'Probar voz (VTS)'),
        h('button.btn.small.ghost', { onclick: () => test('MAYDAY, MAYDAY, MAYDAY. This is Nordic Kestrel. Fire in the engine room. Eighteen persons on board. Over.', 'distressed') }, 'Probar un Mayday'),
        h('button.btn.small.ghost', { onclick: () => { stopSpeaking(); speak(SAMPLE, { persona: 'default' }); } }, 'Solo voz del navegador')),
      engineNote,
      h('p.small', list.length ? `${list.length} voces del navegador disponibles · mejor: ${best.name} (${stars(best)}).` : 'Cargando voces del navegador…'));
  }
  drawVoices();
  if ('speechSynthesis' in window) window.speechSynthesis.addEventListener?.('voiceschanged', drawVoices);
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', 'Ajustes'), h('h2', 'Tu puesto, accesibilidad y datos'))),
    h('div.grid.g2',
      h('div.panel', h('h3', icon('user'), ' Perfil'),
        field('Nombre visible', name),
        field('Titulación', select(CAREERS.map((c) => ({ value: c.id, label: c.es })), career, (v) => { career = v; user.roleId = ''; drawRole(); })),
        roleBox,
        user.role !== 'teacher' && api.claimTeacher ? h('details', { style: { margin: '10px 0' } }, h('summary', 'Soy docente: tengo un código'),
          (() => { const ci = h('input', { type: 'password', placeholder: 'Código de docente', autocomplete: 'off' }); return h('div.row', h('div.grow', ci), h('button.btn', { onclick: async () => { try { await api.claimTeacher(ci.value); toast('Rol docente activado.', 'success'); } catch { toast('Código incorrecto.', 'error'); } } }, 'Activar')); })()) : null,
        h('button.btn.primary', { onclick: async () => { await api.updateProfile(user.uid, { name: name.value.trim() || user.name, careerId: career, roleId: user.roleId || null }); app.set({ user: { ...app.get().user, name: name.value.trim() || user.name, careerId: career, roleId: user.roleId || null } }); toast('Perfil guardado', 'success'); } }, 'Guardar perfil')),
      h('div.panel', h('h3', icon('eye'), ' Accesibilidad'),
        field('Tamaño de letra', select([{ value: 'm', label: 'Grande (por defecto)' }, { value: 'l', label: 'Muy grande' }, { value: 'xl', label: 'Extra grande (proyector)' }], prefs.size || 'm', (v) => savePrefs({ size: v }))),
        h('label.check', h('input', { type: 'checkbox', checked: !!prefs.contrast, onchange: (e) => savePrefs({ contrast: e.target.checked }) }), h('span', 'Alto contraste')),
        h('label.check', h('input', { type: 'checkbox', checked: prefs.sound !== false, onchange: (e) => savePrefs({ sound: e.target.checked }) }), h('span', 'Efectos de sonido y alarmas')),
        voiceBox),
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
            h('li', 'Docentes: o bien su correo en config/instructors (campo emails), o bien el código de docente guardado en config/teacherSecret (campo code, nunca en el repositorio).'),
            h('li', 'Firestore → Reglas: publicar el contenido de firestore.rules del repositorio.'),
            h('li', 'IA sin claves en el navegador: AI Logic (Gemini Developer API, gratuito) protegido con App Check + reCAPTCHA. Ya está configurado en maritime-comms.'),
            h('li', 'Opcional (Claude): desplegar functions/ con el secreto ANTHROPIC_API_KEY y pegar la URL en la pestaña IA de la consola.'))) : null)),
    h('p.small.center', { style: { marginTop: '24px' } }, `UCSea v10 · ${careerById(user.careerId)?.es || ''} · Universidad de Cantabria · Proyecto de innovación docente`)));
}
