// Missions: list + player for ITM II simulator missions.
import { h, mount, icon, toast } from '../core/dom.js';
import { go } from '../core/store.js';
import { db } from '../backend/index.js';
import { MISSIONS, missionById } from '../data/missions.js';
import { evaluate, fieldOk, scriptedReply, orderScore } from '../missions/check.js';
import { createRadar } from '../sim/radar.js';
import { initialState, targetFromSpec, picture } from '../sim/engine.js';
import { scenarioById } from '../data/scenarios.js';
import { localReply } from '../ai/local-engine.js';
import { coachFeedback } from '../ai/ai.js';
import { shipDiagram, parseLocation, describe } from '../ui/ship-diagram.js';
import { speak, stopSpeaking, createPTT, sttSupported } from '../core/speech.js';
import { sfx, startAlarm, stopAlarm } from '../core/audio.js';
import { shuffle, fmtDuration, debounce, escapeHtml } from '../core/util.js';
import { getOcean } from '../main.js';

export default async function render(root, { path, user }) {
  if (path[1]) return player(root, missionById(path[1]), user);
  const runs = await db().listMissionRuns({ uid: user.uid }).catch(() => []);
  const best = (id) => Math.max(0, ...runs.filter((r) => r.missionId === id && r.finished).map((r) => r.score || 0));
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', 'Inglés Técnico Marítimo II'), h('h2', 'Misiones de simulación'),
      h('p', 'Cada misión dura unos 15 minutos y combina escucha, radio, decisiones bajo presión, lectura de radar y escritura profesional. No son ejercicios de clase: son guardias.'))),
    h('div.grid.g2', MISSIONS.map((m) => h('div.panel.mission-card.card.hoverable', { onclick: () => go('missions/' + m.id) },
      h('div.art', { style: { background: m.art } }),
      h('div.row.between', h('h3', { style: { margin: 0 } }, m.title), h('span.badge', `~${m.minutes} min`)),
      h('div', { style: { color: 'var(--accent-2)', fontWeight: 600 } }, m.es),
      h('div.small', m.role),
      h('p.muted', m.blurb),
      h('div.row', { style: { gap: '4px' } }, m.skills.map((s) => h('span.badge', s))),
      h('div.row.between', h('span.small', `${m.phases.length} fases`), best(m.id) ? h('span.badge.sev-safety', `Mejor: ${best(m.id)}/100`) : h('span.small', 'Sin completar'),
        h('button.btn.primary', icon('play'), 'Empezar')))))));
}

// ------------------------------------------------------------------ player
function player(root, mission, user) {
  if (!mission) { mount(root, h('div.page', h('div.panel.empty', h('h3', 'Misión no encontrada')))); return; }
  const api = db();
  const started = Date.now();
  const scores = [];
  const answers = {};
  let i = 0;
  let cleanupPhase = null;
  let runId = null;
  const ocean = getOcean();
  const dots = h('div.phase-dots');
  const clock = h('span.timer');
  const stage = h('div');
  mount(root, h('div.page',
    h('div.page-head', h('div', h('span.eyebrow', `Misión · ${mission.role}`), h('h2', mission.title), dots),
      h('div.row', clock, h('button.btn.ghost', { onclick: () => go('missions') }, 'Salir'))),
    stage));
  const tick = setInterval(() => { clock.textContent = fmtDuration(Date.now() - started); }, 1000);

  const drawDots = () => mount(dots, mission.phases.map((_, k) => h('i' + (k < i ? '.done' : k === i ? '.cur' : ''))));

  function next(score, answer) {
    if (score != null) scores[i] = score;
    if (answer !== undefined) answers[`${i + 1}. ${mission.phases[i].title}`] = answer;
    cleanupPhase?.();
    stopSpeaking();
    i++;
    save(false);
    if (i >= mission.phases.length) return finish();
    drawPhase();
  }

  async function save(finished) {
    const graded = scores.filter((s) => s != null);
    const score = graded.length ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 100) : 0;
    const run = await api.saveMissionRun({ id: runId || undefined, uid: user.uid, name: user.name, missionId: mission.id, phase: i, scores, score, finished, startedAt: started, durationMs: Date.now() - started }).catch(() => null);
    if (run) runId = run.id;
    return score;
  }

  async function finish() {
    clearInterval(tick);
    const score = await save(true);
    sfx.success();
    const reflection = h('textarea', { rows: 4, placeholder: 'What was hardest? Which phrase will you reuse in the Communication Lab?' });
    mount(stage, h('div.panel', { style: { textAlign: 'center' } },
      icon('trophy', 'xl'), h('h2', `Misión completada: ${score}/100`), h('p.muted', `Tiempo: ${fmtDuration(Date.now() - started)}`),
      h('div.grid.g3', { style: { textAlign: 'left', margin: '18px 0' } }, mission.phases.map((p, k) => h('div.kpi', h('b', scores[k] != null ? Math.round(scores[k] * 100) : '—'), h('span', p.title)))),
      h('div', { style: { textAlign: 'left' } }, h('h4', 'Reflexión para tu portafolio'), reflection),
      h('div.row', { style: { justifyContent: 'center', marginTop: '14px' } },
        h('button.btn.primary.big', { onclick: async () => {
          await api.addPortfolioEntry(user.uid, { type: 'mission', title: `${mission.title} (${mission.es})`, missionId: mission.id, score, maxScore: 100, duration: fmtDuration(Date.now() - started), answers, reflection: reflection.value.trim() });
          toast('Guardado en tu portafolio', 'success');
          go('missions');
        } }, icon('folder'), 'Guardar en el portafolio'),
        h('button.btn', { onclick: () => go('missions') }, 'Volver a misiones'))));
  }

  function drawPhase() {
    drawDots();
    const p = mission.phases[i];
    const R = RENDERERS[p.type];
    const panel = h('div');
    mount(stage, panel);
    cleanupPhase = R ? R(panel, p, { mission, next, user }) : null;
    if (!R) mount(panel, h('p', 'Fase no soportada: ' + p.type), h('button.btn', { onclick: () => next(null) }, 'Saltar'));
  }

  drawPhase();
  return () => { clearInterval(tick); cleanupPhase?.(); stopSpeaking(); ocean?.setMood({ alarm: 0, fog: 0 }); };
}

// ------------------------------------------------------------------ helpers
const header = (p, extra) => h('div.panel-head', h('h3', { style: { margin: 0 } }, p.title), extra || null);

function checklist(results) {
  return h('ul.checklist', results.map((r) => h('li' + (r.ok ? '.ok' : ''), r.label)));
}

function timer(seconds, onEnd) {
  const el = h('span.timer');
  let left = seconds;
  el.textContent = `${left}s`;
  const t = setInterval(() => {
    left--;
    el.textContent = `${Math.max(0, left)}s`;
    if (left <= 10) el.classList.add('low');
    if (left <= 0) { clearInterval(t); onEnd?.(); }
  }, 1000);
  el.stop = () => clearInterval(t);
  return el;
}

function voiceInput(textarea) {
  if (!sttSupported()) return null;
  const btn = h('button.ptt', { title: 'Mantén pulsado para dictar en inglés', style: { width: '56px', height: '56px' } }, icon('mic'));
  const ptt = createPTT({ onInterim: (t) => { textarea.value = t; textarea.dispatchEvent(new Event('input')); } });
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.add('live'); ptt.start(); });
  const up = () => { if (ptt.active) { btn.classList.remove('live'); ptt.stop(); } };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
  return btn;
}

// ------------------------------------------------------------------ phase renderers
const RENDERERS = {
  brief(el, p, { next, mission }) {
    const heel = p.heel ? h('div.gauge.alarm', { style: { maxWidth: '260px' } }, h('small', 'HEEL INDICATOR'), h('b', `${p.heel}° STBD`)) : null;
    if (p.heel) startAlarm('heel', 'caution');
    if (mission.scenarioId === 'santander_approach') getOcean()?.setMood({ fog: 1 });
    mount(el, h('div.panel',
      header(p), h('p', { style: { fontSize: '1.15rem' } }, p.text), heel,
      h('h4', 'Objetivos'), h('ul', p.objectives.map((o) => h('li', o))),
      h('button.btn.primary.big', { onclick: () => { sfx.boot(); next(null); } }, icon('play'), 'Tomar la guardia')));
    speak(p.text, { persona: 'narrator', radio: false });
    return () => stopAlarm('heel');
  },

  listen(el, p, { next }) {
    let plays = 0;
    const inputs = Object.fromEntries(p.fields.map((f) => [f.id, h('input', { placeholder: '…' })]));
    const playBtn = h('button.btn.primary.big', { onclick: async () => {
      if (plays >= p.maxPlays) return toast('No quedan reproducciones.', 'warn');
      plays++;
      playBtn.disabled = true;
      sfx.squelch();
      await speak(p.script, { persona: 'agent-laura', rate: 1.05 });
      playBtn.disabled = plays >= p.maxPlays;
      count.textContent = `Reproducciones: ${plays}/${p.maxPlays}`;
    } }, icon('sound'), 'Atender la llamada');
    const count = h('span.small', `Reproducciones: 0/${p.maxPlays}`);
    const result = h('div');
    mount(el, h('div.grid.g2',
      h('div.panel', header(p), h('p', 'La línea tiene interferencias. Escucha y rellena tus notas. No hay transcripción: como en el puente.'), h('div.row', playBtn, count),
        h('p.small', 'Si tu navegador no reproduce voz, activa el sonido o usa Chrome/Edge.')),
      h('div.panel', h('h4', 'Notas del oficial de guardia'), p.fields.map((f) => h('label.field', h('span', f.label), inputs[f.id])),
        h('button.btn.success', { onclick: () => {
          const res = p.fields.map((f) => ({ label: `${f.label}: ${inputs[f.id].value || '—'}`, ok: fieldOk(inputs[f.id].value, f.answer) }));
          const raw = res.filter((r) => r.ok).length / res.length;
          const score = Math.max(0, raw - Math.max(0, plays - 2) * 0.1);
          mount(result, checklist(res), h('details', h('summary', 'Ver transcripción'), h('p.small', p.script)), h('button.btn.primary', { onclick: () => next(score, Object.fromEntries(p.fields.map((f) => [f.label, inputs[f.id].value]))) }, 'Continuar'));
        } }, icon('check'), 'Comprobar notas'), result)));
    return () => stopSpeaking();
  },

  radio(el, p, { next, mission }) {
    const lab = { id: 'm', scenarioId: mission.scenarioId, ...initialState(scenarioById(mission.scenarioId), 'm') };
    const log = h('div.comms', { style: { minHeight: '260px', maxHeight: '420px' } });
    const ta = h('textarea', { rows: 3, placeholder: 'Your transmission (English)…' });
    const checks = h('div');
    let turns = 0;
    const met = new Set();
    const history = [];
    const add = (who, text, mine) => {
      log.append(h('div.msg' + (mine ? '.mine' : '.npc'), h('div.meta', h('span.who', who), h('span.badge', p.channel)), h('div.text', { html: escapeHtml(text) })));
      log.scrollTop = log.scrollHeight;
    };
    const npcName = { agent: 'North Port Agency', barge: 'Petrolero 3', port: 'Bilbao Port Control', tug: 'Tug Harbour Titan', vts: 'Finisterre Traffic' }[p.persona] || p.persona;
    const draw = (live = '') => {
      const res = evaluate(p.criteria, live);
      for (const r of res.results) if (r.ok) met.add(r.label);
      mount(checks, checklist(p.criteria.map((c) => ({ label: c.label, ok: met.has(c.label) }))));
      return res;
    };
    const finishBtn = h('button.btn.primary', { onclick: () => next(met.size / p.criteria.length, history.filter((x) => x.mine).map((x) => x.text).join(' / ')) }, 'Continuar');
    const send = async () => {
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      sfx.radioOut();
      add('You', text, true);
      history.push({ mine: true, text });
      draw(text);
      turns++;
      await new Promise((r) => setTimeout(r, 900));
      const reply = scriptedReply(p.npcRules, text) || localReply({ lab, personaKey: p.persona === 'barge' ? 'port' : p.persona, text, channel: p.channel, history: [], events: [], picture: picture(lab) }).text;
      add(npcName, reply, false);
      history.push({ mine: false, text: reply });
      speak(reply, { persona: p.persona });
      if (met.size === p.criteria.length || turns >= (p.maxTurns || 4)) finishBtn.classList.add('success');
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    ta.addEventListener('input', debounce(() => draw(ta.value), 300));
    mount(el, h('div.mplayer',
      h('div.panel', header(p, h('span.badge', `Canal ${p.channel}`)), h('p', p.task), log,
        h('div.composer', ta, h('div.col', { style: { alignItems: 'center', gap: '6px' } }, voiceInput(ta), h('button.btn.primary.small', { onclick: send }, icon('send'), 'TX')))),
      h('div.panel', h('h4', 'Lo que debe tener tu comunicación'), checks, h('hr'), finishBtn)));
    draw('');
    if (p.npcOpen) setTimeout(() => { add(npcName, p.npcOpen, false); speak(p.npcOpen, { persona: p.persona }); sfx.radioIn(); }, 500);
    return () => stopSpeaking();
  },

  compose(el, p, { next }) {
    const ta = h('textarea', { rows: 8, placeholder: p.to ? `To: ${p.to}` : '' });
    const checks = h('div');
    const fb = h('div');
    const live = () => mount(checks, checklist(evaluate(p.criteria, ta.value).results));
    ta.addEventListener('input', debounce(live, 250));
    live();
    mount(el, h('div.mplayer',
      h('div.panel', header(p, p.to ? h('span.badge', '→ ' + p.to) : null), h('p', p.task), p.hint ? h('p.small', '💡 ' + p.hint) : null, ta,
        h('div.row', { style: { marginTop: '10px' } }, voiceInput(ta),
          h('button.btn.success', { onclick: async () => {
            const res = evaluate(p.criteria, ta.value);
            sfx[res.score >= 0.7 ? 'success' : 'notify']();
            mount(fb, h('div.panel', { style: { marginTop: '12px' } },
              h('h4', `Resultado: ${Math.round(res.score * 100)}%`), checklist(res.results),
              p.model ? h('details', h('summary', 'Ver un modelo (no la única respuesta posible)'), h('p', { style: { whiteSpace: 'pre-wrap' } }, p.model)) : null,
              h('div#coach'),
              h('div.row', h('button.btn.primary', { onclick: () => next(res.score, ta.value) }, 'Continuar'), h('button.btn.ghost', { onclick: () => mount(fb) }, 'Mejorar mi texto'))));
            const coach = await coachFeedback({ text: ta.value, task: p.task });
            if (coach) fb.querySelector('#coach')?.append(h('div.task', h('b', 'Tutor IA: '), coach.text));
          } }, icon('check'), 'Entregar'))),
      h('div.panel', h('h4', 'Lista de control en directo'), checks, fb)));
  },

  decide(el, p, { next }) {
    let r = 0, ok = 0;
    const box = h('div');
    const t = timer(p.timer || 60, () => next(ok / p.rounds.length, `${ok}/${p.rounds.length}`));
    startAlarm('decide', 'caution');
    const draw = () => {
      if (r >= p.rounds.length) { t.stop(); stopAlarm('decide'); return next(ok / p.rounds.length, `${ok}/${p.rounds.length}`); }
      const round = p.rounds[r];
      const why = h('div');
      mount(box, h('h3', round.q), shuffle(round.options).map((o) => h('button.option', { onclick: (e) => {
        if (why.childElementCount) return;
        e.currentTarget.classList.add(o.ok ? 'right' : 'wrong');
        sfx[o.ok ? 'success' : 'error']();
        if (o.ok) ok++;
        mount(why, h('p', (o.ok ? '✓ ' : '✗ ') + o.why), h('button.btn.primary', { onclick: () => { r++; draw(); } }, 'Siguiente'));
      } }, o.t)), why);
    };
    mount(el, h('div.panel', header(p, t), h('p', p.text), box));
    draw();
    return () => { t.stop(); stopAlarm('decide'); };
  },

  hotspots(el, p, { next }) {
    const found = new Set();
    const t = timer(p.timer || 90, () => done());
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 60');
    svg.innerHTML = `
      <rect width="100" height="60" fill="#0a1c2c"/>
      <rect x="0" y="44" width="100" height="16" fill="#0d2a44"/>
      <rect x="5" y="20" width="90" height="26" fill="#14324f" stroke="#5ad1ff" stroke-width=".3"/>
      <rect x="55" y="38" width="12" height="4" fill="#3a2a10" stroke="#ffb547" stroke-width=".3"/>
      <path d="M55 40 Q53 44 50 44" stroke="#2b1a08" stroke-width="1.5" fill="none"/>
      <rect x="57" y="28" width="6" height="10" fill="#335" stroke="#9fd7ff" stroke-width=".3"/>
      <path d="M63 31 C75 25, 85 35, 98 30" stroke="#222" stroke-width="1.6" fill="none"/>
      <rect x="78" y="12" width="2" height="16" fill="#556"/>
      <rect x="15" y="40" width="5" height="2" fill="#000"/>
      <rect x="32" y="22" width="8" height="10" fill="#7a1010" stroke="#fff" stroke-width=".3"/>
      <text x="33" y="28" font-size="2" fill="#fff">SOPEP</text>
      <line x1="88" y1="2" x2="88" y2="20" stroke="#ccc" stroke-width=".4"/><rect x="88" y="3" width="6" height="4" fill="#d22"/>
      <circle cx="81" cy="35" r="1.6" fill="#ffd9a8"/><rect x="80" y="36.5" width="2.2" height="5" fill="#f07a20"/>
      <circle cx="83" cy="34" r=".5" fill="#ff8a00"/>
      <text x="6" y="58" font-size="2.2" fill="#9bb6c9">Port side · No. 3 FO tank vent and bunker manifold · rain</text>`;
    const markers = [];
    for (const s of p.spots) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'hotspot');
      g.innerHTML = `<circle cx="${s.x}" cy="${s.y * 0.6}" r="3.2" fill="rgba(57,208,255,.12)" stroke="rgba(57,208,255,.6)" stroke-width=".4"/>`;
      g.addEventListener('click', () => {
        if (found.has(s.id)) { found.delete(s.id); g.classList.remove('on'); } else { found.add(s.id); g.classList.add('on'); sfx.tick(); }
        mount(list, [...found].map((id) => h('li', p.spots.find((x) => x.id === id).label)));
      });
      svg.appendChild(g);
      markers.push(g);
    }
    const list = h('ul');
    const result = h('div');
    let ended = false;
    function done() {
      if (ended) return;
      ended = true;
      t.stop();
      const hz = p.spots.filter((s) => s.hazard);
      const hits = hz.filter((s) => found.has(s.id)).length;
      const fp = p.spots.filter((s) => !s.hazard && found.has(s.id)).length;
      const score = Math.max(0, (hits - fp * 0.5) / hz.length);
      mount(result, h('ul.checklist', p.spots.map((s) => h('li' + (found.has(s.id) === s.hazard ? '.ok' : ''), `${s.label} — ${s.hazard ? 'PELIGRO' : 'correcto'}`))),
        h('button.btn.primary', { onclick: () => next(score, [...found].join(', ')) }, 'Continuar'));
    }
    mount(el, h('div.mplayer', h('div.scene', svg), h('div.panel', header(p, t), h('p', p.task), h('h4', 'Marcados'), list, h('button.btn.success', { onclick: done }, 'Informar'), result)));
    return () => t.stop();
  },

  'modal-match'(el, p, { next }) {
    const sels = p.items.map((it) => h('select', h('option', { value: '' }, '— modal —'), it.options.map((o) => h('option', { value: o }, o))));
    const reasons = p.items.map(() => h('select', ['', 'rule', 'urgent', 'advice', 'prohibition', 'no need'].map((o) => h('option', { value: o }, o || '— reason —'))));
    const out = h('div');
    const t = timer(p.timer || 120, () => check());
    function check() {
      t.stop();
      let pts = 0;
      const res = p.items.map((it, k) => { const okM = sels[k].value === it.ok; const okR = reasons[k].value === it.reason; pts += (okM ? 0.7 : 0) + (okR ? 0.3 : 0); return { label: `${it.s} → ${it.ok} (${it.reason})`, ok: okM && okR }; });
      mount(out, checklist(res), h('button.btn.primary', { onclick: () => next(pts / p.items.length, p.items.map((it, k) => `${sels[k].value}/${reasons[k].value}`).join('; ')) }, 'Continuar'));
    }
    mount(el, h('div.panel', header(p, t), h('p', p.task),
      h('table', h('tbody', p.items.map((it, k) => h('tr', h('td', it.s), h('td', { style: { width: '170px' } }, sels[k]), h('td', { style: { width: '170px' } }, reasons[k]))))),
      h('button.btn.success', { onclick: check, style: { marginTop: '10px' } }, 'Comprobar'), out));
    return () => t.stop();
  },

  radar(el, p, { next, mission }) {
    const sc = scenarioById(mission.scenarioId);
    const base = initialState(sc, 'mission');
    const own = base.ownShip;
    const targets = [p.target, ...(p.others || [])].map((spec, k) => ({ ...targetFromSpec(own, spec), id: 'mt' + k }));
    const lab = { id: 'mission', scenarioId: sc.id, ...base, targets };
    const canvas = h('canvas');
    const card = h('div.small', 'Pulsa un eco para adquirirlo.');
    let selected = null;
    const radar = createRadar(canvas, { getLab: () => lab, onSelect: (c) => { selected = c; mount(card, c ? `ADQUIRIDO · BRG ${String(Math.round(c.bearing)).padStart(3, '0')}° · RNG ${c.range.toFixed(2)} NM · CPA ${c.cpa.toFixed(2)} NM · ${c.ais ? c.name : 'NO AIS'}` : ''); } });
    radar.setRange(6);
    const ta = h('textarea', { rows: 4, placeholder: 'Radar shows …' });
    const checks = h('div');
    const ctx = () => { const c = picture(lab).contacts.find((x) => x.id === 'mt0'); return { bearing: c.bearing, range: c.range }; };
    const live = () => mount(checks, checklist(evaluate(p.criteria, ta.value, ctx()).results));
    ta.addEventListener('input', debounce(live, 250));
    live();
    mount(el, h('div.mplayer',
      h('div.panel', header(p), h('div.radar-wrap', canvas), card),
      h('div.panel', h('p', p.task), ta, h('h4', 'Lista de control'), checks,
        h('button.btn.success', { onclick: () => {
          const res = evaluate(p.criteria, ta.value, ctx());
          const acquired = selected?.id === 'mt0';
          next(res.score * (acquired ? 1 : 0.85), ta.value);
        } }, 'Entregar'))));
    return () => radar.destroy();
  },

  classify(el, p, { next }) {
    const picks = {};
    const out = h('div');
    const t = p.timer ? timer(p.timer, () => check()) : null;
    const rewrite = p.rewrite ? h('textarea', { rows: 3, placeholder: 'Rewrite the weakest sentence…' }) : null;
    function check() {
      t?.stop();
      const res = p.items.map((it, k) => ({ label: `${it.s} → ${it.ok}${it.why ? ' · ' + it.why : ''}`, ok: picks[k] === it.ok }));
      let score = res.filter((r) => r.ok).length / res.length;
      let extra = null;
      if (rewrite) {
        const rr = evaluate(p.rewrite.criteria, rewrite.value);
        score = score * 0.7 + rr.score * 0.3;
        extra = h('div', h('h4', 'Tu reescritura'), checklist(rr.results));
      }
      mount(out, checklist(res), extra, h('button.btn.primary', { onclick: () => next(score, { picks, rewrite: rewrite?.value }) }, 'Continuar'));
    }
    mount(el, h('div.panel', header(p, t), h('p', p.task),
      p.table ? h('table', { style: { marginBottom: '14px' } }, p.table.map((row, k) => h('tr', row.map((c) => (k === 0 ? h('th', c) : h('td', c)))))) : null,
      p.items.map((it, k) => h('div.task', h('div', it.s), h('div.row', { style: { marginTop: '6px' } }, p.labels.map((l) => h('button.chip', { onclick: (e) => { picks[k] = l; [...e.target.parentNode.children].forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); sfx.tick(); } }, l))))),
      rewrite ? h('div', h('h4', 'Reescribe la frase más débil'), rewrite) : null,
      h('button.btn.success', { onclick: check, style: { marginTop: '10px' } }, 'Comprobar'), out));
    return () => t?.stop();
  },

  sequence(el, p, { next }) {
    let order = shuffle(p.items.map((_, k) => k));
    const ul = h('ul.sortable');
    let dragIdx = null;
    const draw = () => mount(ul, order.map((k, pos) => {
      const li = h('li', { draggable: 'true' }, h('span.mono', `${pos + 1}.`), h('span.grow', p.items[k]),
        h('button.icon-btn', { style: { width: '32px', height: '32px' }, onclick: () => { if (pos > 0) { [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]]; draw(); } } }, '↑'),
        h('button.icon-btn', { style: { width: '32px', height: '32px' }, onclick: () => { if (pos < order.length - 1) { [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]]; draw(); } } }, '↓'));
      li.addEventListener('dragstart', () => { dragIdx = pos; li.classList.add('drag'); });
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', () => { const [m] = order.splice(dragIdx, 1); order.splice(pos, 0, m); draw(); });
      return li;
    }));
    draw();
    const out = h('div');
    mount(el, h('div.panel', header(p), h('p', p.task), ul,
      h('button.btn.success', { onclick: () => {
        const s = orderScore(order, p.items.map((_, k) => k));
        mount(out, h('p', `Orden correcto en un ${Math.round(s * 100)}% de los pares.`), h('ol', p.items.map((x) => h('li', x))), h('button.btn.primary', { onclick: () => next(s, order.map((k) => p.items[k]).join(' → ')) }, 'Continuar'));
      } }, 'Comprobar'), out));
  },

  evidence(el, p, ctx) { return RENDERERS.classify(el, p, ctx); },

  locate(el, p, { next }) {
    let r = 0;
    let pts = 0;
    const log = [];
    const diag = shipDiagram({ interactive: false });
    const input = h('input', { placeholder: 'e.g. The damage is forward of No. 3 hatch, on the port side.' });
    const fb = h('div');
    const draw = () => {
      const round = p.rounds[r];
      diag.setMarks([{ zone: round.zone, side: round.side, label: round.label }]);
      mount(fb);
      input.value = '';
      input.focus();
    };
    const submit = () => {
      const round = p.rounds[r];
      const res = parseLocation(input.value);
      const ok = res.zone === round.zone && (round.side ? res.side === round.side : true);
      const marks = [{ zone: round.zone, side: round.side, label: round.label }];
      if (res.zone) marks.push({ zone: res.zone, side: res.side, dx: 0.3, label: 'PARTY', color: ok ? 'rgba(124,242,156,.9)' : 'rgba(255,207,90,.9)' });
      diag.setMarks(marks);
      sfx[ok ? 'success' : 'error']();
      if (ok) pts++;
      log.push(input.value);
      mount(fb, h('div.task', h('b', ok ? '✓ The party is at the right place.' : `✗ The party went to: ${res.zone ? describe(res.zone, res.side) : 'nowhere (unclear)'}.`),
        res.reasons.length ? h('ul', res.reasons.map((x) => h('li.small', x))) : null,
        h('p.small', `Model: "${modelPhrase(round)}"`),
        h('button.btn.primary', { onclick: () => { r++; if (r >= p.rounds.length) next(pts / p.rounds.length, log.join(' / ')); else draw(); } }, 'Siguiente')));
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    mount(el, h('div.mplayer', h('div.scene', diag), h('div.panel', header(p), h('p', p.task), input, h('button.btn.success', { onclick: submit, style: { marginTop: '8px' } }, icon('radio'), 'Transmitir'), fb)));
    draw();
  },

  pinpoint(el, p, { next }) {
    let r = 0;
    let pts = 0;
    const fb = h('div');
    let answered = false;
    const diag = shipDiagram({ onPick: ({ zone, side }) => {
      if (answered) return;
      answered = true;
      const round = p.rounds[r];
      const ok = zone === round.zone && (round.side ? side === round.side : true);
      if (ok) pts++;
      sfx[ok ? 'success' : 'error']();
      mount(fb, h('div.task', h('b', ok ? '✓ Correct' : `✗ They are at: ${describe(round.zone, round.side)}`),
        h('button.btn.primary', { onclick: () => { r++; if (r >= p.rounds.length) next(pts / p.rounds.length); else play(); } }, 'Siguiente')));
    } });
    const say = h('button.btn.primary', { onclick: () => speak(p.rounds[r].say, { persona: 'party' }) }, icon('sound'), 'Escuchar al jefe de equipo');
    const transcript = h('p.small');
    const play = () => { answered = false; mount(fb); transcript.textContent = p.rounds[r].say; speak(p.rounds[r].say, { persona: 'party' }); };
    mount(el, h('div.mplayer', h('div.scene', diag), h('div.panel', header(p), h('p', p.task), say, h('details', h('summary.small', 'Mostrar texto (accesibilidad)'), transcript), fb)));
    setTimeout(play, 400);
    return () => stopSpeaking();
  },
};

function modelPhrase(round) {
  const n = { hold1: 1, hold2: 2, hold3: 3, hold4: 4 }[round.zone];
  if (n) return `The ${round.label.toLowerCase()} is at No. ${n} hold${round.side ? ', ' + round.side + ' side' : ''}.`;
  return `The ${round.label.toLowerCase()} is in ${describe(round.zone, round.side)}.`;
}
