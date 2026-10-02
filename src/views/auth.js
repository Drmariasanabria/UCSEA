// Landing + sign-in.
import { h, mount, icon, toast, field } from '../core/dom.js';
import { db, setPreferredMode } from '../backend/index.js';
import { sfx } from '../core/audio.js';
import { EVENTS } from '../data/events.js';
import { ROLES, CAREERS } from '../data/careers.js';

// Turn on once the Microsoft provider is configured in Firebase Authentication (needs an Azure app registration).
const MICROSOFT_ENABLED = false;

const LINES = [
  'MAYDAY, MAYDAY, MAYDAY. This is Nordic Kestrel…',
  'Traffic information. Vessel on your starboard bow, range two decimal four miles.',
  'QUESTION. What are your intentions? Over.',
  'WARNING. I am towing a barge. Length of tow two-five-zero metres.',
  'Engine room, bridge: lube oil pressure one decimal six bar and falling.',
  'Read back correct. Out.',
];

export default function render(root) {
  const api = db();
  let tab = api.mode === 'demo' ? 'demo' : 'in';
  const tw = h('div.typewriter');
  let li = 0, ci = 0, timer;
  const type = () => {
    const line = LINES[li];
    tw.textContent = line.slice(0, ci++);
    if (ci > line.length + 30) { li = (li + 1) % LINES.length; ci = 0; }
    timer = setTimeout(type, ci > line.length ? 60 : 28);
  };
  type();

  const card = h('div.panel.auth-card');
  function drawCard() {
    const segs = api.mode === 'firebase'
      ? [['in', 'Entrar'], ['up', 'Crear cuenta'], ['demo', 'Probar demo']]
      : [['demo', 'Entrar (demo)']];
    const body = h('div');
    const seg = h('div.seg', segs.map(([id, label]) => h('button' + (tab === id ? '.on' : ''), { onclick: () => { tab = id; sfx.click(); drawCard(); } }, label)));
    if (tab === 'in' || tab === 'up') {
      const name = h('input', { placeholder: 'Nombre y apellidos', autocomplete: 'name' });
      const email = h('input', { type: 'email', placeholder: 'tu@alumnos.unican.es', autocomplete: 'email' });
      const pass = h('input', { type: 'password', placeholder: '••••••••', autocomplete: tab === 'in' ? 'current-password' : 'new-password' });
      let wantTeacher = false;
      const codeIn = h('input', { type: 'password', placeholder: 'Código facilitado por la coordinación', autocomplete: 'off' });
      const codeBox = h('div.hidden', field('Código de docente', codeIn, 'Solo el profesorado tiene este código. Sin él, la cuenta se crea como estudiante.'));
      const roleSeg = h('div.seg');
      const drawRoleSeg = () => mount(roleSeg, ...[[false, 'Soy estudiante'], [true, 'Soy docente']].map(([v, l]) => h('button' + (wantTeacher === v ? '.on' : ''), { type: 'button', onclick: () => { wantTeacher = v; codeBox.classList.toggle('hidden', !v); drawRoleSeg(); } }, l)));
      drawRoleSeg();
      const submit = async () => {
        try {
          if (tab === 'in') await api.signIn(email.value.trim(), pass.value);
          else {
            if (!name.value.trim()) return toast('Escribe tu nombre.', 'warn');
            if (wantTeacher && !codeIn.value.trim()) return toast('Introduce el código de docente.', 'warn');
            await api.signUp({ name: name.value.trim(), email: email.value.trim(), password: pass.value, teacherCode: wantTeacher ? codeIn.value : null });
          }
          sfx.success();
        } catch (e) {
          sfx.error();
          toast(authError(e), 'error', 6000);
        }
      };
      pass.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
      mount(body,
        tab === 'up' ? roleSeg : null,
        tab === 'up' ? codeBox : null,
        tab === 'up' ? field('Nombre', name) : null,
        field('Correo', email, tab === 'up' ? 'Sirve cualquier correo: Outlook, Hotmail, Gmail o el de la universidad.' : null),
        field('Contraseña', pass, tab === 'up' ? 'Mínimo 6 caracteres.' : null),
        h('button.btn.primary.big', { style: { width: '100%' }, onclick: submit }, icon('anchor'), tab === 'in' ? 'Subir a bordo' : 'Crear cuenta'),
        h('div.row', { style: { marginTop: '12px', justifyContent: 'space-between' } },
          h('button.btn.ghost.small', { onclick: async () => { try { await api.signInGoogle(); } catch (e) { toast(authError(e), 'error'); } } }, 'Entrar con Google'),
          MICROSOFT_ENABLED ? h('button.btn.ghost.small', { onclick: async () => { try { await api.signInMicrosoft(); } catch (e) { toast(authError(e), 'error'); } } }, 'Entrar con Microsoft / Outlook') : null,
          tab === 'in' ? h('button.btn.ghost.small', { onclick: async () => { if (!email.value) return toast('Escribe tu correo primero.', 'warn'); await api.resetPassword(email.value.trim()); toast('Te hemos enviado un correo para restablecer la contraseña.', 'success'); } }, '¿Olvidaste la contraseña?') : null));
    } else {
      const name = h('input', { placeholder: 'Tu nombre', value: '' });
      let role = 'student';
      const roleSeg = h('div.seg');
      const drawRole = () => mount(roleSeg, ...[['student', 'Estudiante'], ['teacher', 'Docente']].map(([id, l]) => h('button' + (role === id ? '.on' : ''), { onclick: () => { role = id; drawRole(); } }, l)));
      drawRole();
      const go = async () => {
        if (!name.value.trim()) return toast('Escribe un nombre.', 'warn');
        if (api.mode !== 'demo') { localStorage.setItem('mesim10:pendingDemo', JSON.stringify({ name: name.value.trim(), role })); setPreferredMode('demo'); return; }
        await api.signInDemo({ name: name.value.trim(), role });
        sfx.success();
      };
      name.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      mount(body,
        h('p.muted', 'El modo demostración guarda todo en este navegador y sincroniza pestañas: abre una pestaña como docente y otra como estudiante para probar una sesión en directo.'),
        field('Nombre', name), h('span.small', 'Rol'), roleSeg,
        h('button.btn.primary.big', { style: { width: '100%' }, onclick: go }, icon('play'), 'Entrar en modo demo'),
        api.mode === 'demo' ? h('button.btn.ghost.small', { style: { marginTop: '12px' }, onclick: () => setPreferredMode('firebase') }, 'Usar cuentas reales (Firebase)') : null);
    }
    mount(card, h('h3', 'Acceso a bordo'), seg, body);
  }
  drawCard();

  // Auto-complete a pending demo sign-in after switching mode.
  const pending = localStorage.getItem('mesim10:pendingDemo');
  if (pending && api.mode === 'demo') {
    localStorage.removeItem('mesim10:pendingDemo');
    api.signInDemo(JSON.parse(pending));
  }

  mount(root, h('section.hero',
    h('div',
      h('span.eyebrow', 'Universidad de Cantabria · Inglés Técnico Marítimo II'),
      h('h1', 'Real ', h('span.glow', 'Communication'), h('br'), 'Lab'),
      h('p.lead', 'Un puente de mando compartido en tiempo real: radar, VHF, alarmas y emergencias que el docente controla en directo. Cada rol —náutico, marino, marítimo o de gestión— recibe sus propias tareas y debe resolverlas comunicándose en inglés SMCP.'),
      tw,
      h('div.hero-stats',
        h('div', h('b', String(EVENTS.length)), h('span', 'eventos y alarmas')),
        h('div', h('b', String(ROLES.length)), h('span', 'puestos profesionales')),
        h('div', h('b', String(CAREERS.length)), h('span', 'titulaciones')),
        h('div', h('b', '24'), h('span', 'estructuras evaluables'))),
      h('div.row',
        h('span.chip', icon('radar'), 'Radar ARPA'), h('span.chip', icon('mic'), 'Voz y PTT'), h('span.chip', icon('alarm'), 'Alarmas'),
        h('span.chip', icon('sparkle'), 'Estaciones IA'), h('span.chip', icon('graph'), 'Glosario en grafo'), h('span.chip', icon('log'), 'Caja negra / debriefing'))),
    card));

  return () => clearTimeout(timer);
}

function authError(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (c === 'teacher-code') return 'Código de docente incorrecto. Tu cuenta se ha creado como estudiante; puedes introducir el código correcto en Ajustes.';
  if (c.includes('email-already-in-use')) return 'Ese correo ya tiene cuenta. Usa «Entrar».';
  if (c.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (c.includes('invalid-email')) return 'Correo no válido.';
  if (c.includes('popup')) return 'Se cerró la ventana de Google.';
  if (c.includes('operation-not-allowed')) return 'Este método de acceso no está activado en Firebase (Authentication → Sign-in method).';
  return e?.message || String(e);
}
