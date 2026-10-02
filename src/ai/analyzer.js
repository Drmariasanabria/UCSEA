// Rule-based language analyzer for maritime English messages.
// Detects the structures a teacher can require and gives SMCP-oriented feedback.
// Deterministic and explainable: every hit carries the matched text.

const IRREGULAR_PP = 'been|found|made|taken|given|seen|done|sent|lost|kept|held|left|told|brought|built|caught|broken|run|struck|sunk|shown|known|written|put|set|cut|hit|thrown|blown|drawn|driven|torn|worn|got|gotten|stood|laid|paid|said|heard|read|felt|led|met|sold|shot|spent|understood|withdrawn|begun|chosen|frozen|risen|shaken|stolen|woken|bound|wound|fallen|hidden|forgotten|swept|spilt|spilled|sprung|undertaken|overtaken';
const IRREGULAR_PAST = 'lost|made|took|gave|saw|did|sent|kept|held|left|told|brought|built|caught|broke|ran|struck|sank|showed|knew|wrote|put|set|cut|hit|threw|blew|drew|drove|tore|got|stood|laid|paid|said|heard|read|felt|led|met|sold|shot|spent|understood|began|chose|froze|rose|shook|fell|hid|forgot|swept|spilt|overtook|went|came|became|found';
const BE = '(?:am|is|are|was|were|be|been|being|\'s|\'re)';
const NUMWORDS = 'zero|one|two|three|four|five|six|seven|eight|nine|niner|decimal';

const MARITIME_NOUNS = new Set(('pilot boarding time cargo manifest signature engine room engine-room access permit gangway watch report copy loading delay ' +
  'lube oil pressure alarm bilge pump fire door ballast tank water level fuel oil tank vent bunker manifold drip tray scupper hatch cover ' +
  'lashing mooring rope line deck crane barge tow tug towline winch brake drum steering gear rudder propeller pitch main auxiliary generator ' +
  'switchboard power supply radar target contact bearing range course speed heading position chart passage plan safety broadcast traffic ' +
  'information lane separation scheme vts station channel lifeboat liferaft rescue boat muster list head count fire party team detector ' +
  'smoke system ventilation fan damper sea chest valve suction discharge sounding pipe hold stability trim draught draft list heel cargo ' +
  'shift unit weight container vehicle trailer stowage plan port state control inspection deficiency detention maintenance log record entry ' +
  'permit work space atmosphere test gas reading oxygen level alarm panel bridge watch navigation light signal sound anchor berth window ' +
  'agent agency arrival departure time schedule crew change document documents confirmation email message deadline weather forecast ' +
  'warning gale visibility fog bank collision risk avoidance action damage report hull plate stem bow stern quarter beam accommodation block ' +
  'emergency generator fuel supply cooling water jacket temperature exhaust gas cylinder unit purifier room blackout recovery procedure ' +
  'company safety management system officer duty rest hours voyage data recorder data').split(/\s+/));

const IMPERATIVE_VERBS = 'stop|reduce|alter|keep|report|check|secure|inform|call|confirm|send|leave|anchor|proceed|stand|give|take|sound|plug|close|open|start|wear|hold|verify|contact|follow|maintain|monitor|prepare|switch|isolate|muster|launch|lower|stow|pump|transfer|clear|navigate|slow|increase|steer|turn|wait|use|note|log|repeat|read|write|ask|advise|acknowledge|notify|reschedule|rectify|record|test|ventilate|evacuate|close|shut';

const DETECTORS = {
  marker: /\b(INSTRUCTION|ADVICE|WARNING|INFORMATION|QUESTION|ANSWER|REQUEST|INTENTION)\b\s*[.:]?/g,
  callsign: /\b[\w'-]+(?:\s[\w'-]+){0,4},?\s+this is\s+[\w'-]+/gi,
  proword: /\b(over and out|over|out|say again|read back|correction|mistake|stand by|roger|received|understood|i say again)\b/gi,
  conditional: /\b(if|unless|provided that|providing that|in case|as long as|on condition that)\b/gi,
  passive: new RegExp(`\\b${BE}\\s+(?:not\\s+)?(?:\\w+ed|${IRREGULAR_PP})\\b`, 'gi'),
  modal_obligation: /(?<!\b(?:don't|do not|doesn't|does not|didn't|did not)\s)\b(must not|mustn't|must|have to|has to|had to|need to|needs to|are required to|is required to)\b/gi,
  modal_advice: /\b(should|shouldn't|had better|'d better|ought to|we recommend|i recommend|it is advisable)\b/gi,
  no_need: /\b(don't have to|do not have to|doesn't have to|does not have to|needn't|need not|no need to)\b/gi,
  hedge: /\b(appears? to|it appears|seems? to|likely|unlikely|may|might|possibly|probably|not confirmed|unconfirmed|cannot confirm|can't confirm|the data suggests?|there is no evidence|approximately|based on the available data|it is reported|reportedly|almost certain)\b/gi,
  sequence: /\b(before|while|after|when|on)\s+\w+ing\b/gi,
  data: /\b\d+(?:[.,]\d+)?\s?(?:nm\b|nautical miles?|miles?\b|cables?\b|kn\b|kts?\b|knots?\b|°|degrees?\b|deg\b|bar\b|m\b|metres?\b|meters?\b|tonnes?\b|t\b|%|rpm\b|m³\/h|m3\/h|ppm\b|minutes?\b|min\b|hours?\b|persons?\b|pob\b|°c\b)/gi,
  time4: /\b(?:at\s+)?([01]\d|2[0-3])[0-5]\d\b(?!\s?(?:m\b|nm|kn|°|degrees|metres|tonnes|t\b|%))/gi,
  noun_group: null, // custom
  past_simple: new RegExp(`(?<!\\b(?:has|have|had|was|were|is|are|be|been|being|am|not|reduced|restricted)\\s)\\b(?:\\w{3,}ed|${IRREGULAR_PAST})\\b(?!\\s(?:visibility|speed|manoeuvrability|ability))`, 'gi'),
  past_perfect: new RegExp(`\\bhad\\s+(?:not\\s+|already\\s+|just\\s+)?(?:been|\\w+ed|${IRREGULAR_PP})\\b`, 'gi'),
  relative: /(?:,\s*(which|who|whose|where)\b|\b\w+\s+(which|who|whose)\s+\w+)/gi,
  question: null, // custom
  imperative: null, // custom
  future_intention: /\b(i will|we will|i'll|we'll|i am going to|we are going to|i intend to|we intend to|i shall|we shall|i am altering|i am reducing|i am proceeding)\b/gi,
  reported: /\b(reported|said|stated|informed|advised|asked|confirmed|explained|warned|told \w+)\s+(that|whether|if|to)\b/gi,
  reference: /\b(forward of|aft of|port side|starboard side|abeam|astern|amidships|centreline|centerline|on (?:the|my|your|our) (?:port|starboard) (?:bow|quarter|beam)|(?:port|starboard) (?:bow|quarter|beam)|right ahead|ahead of|abaft|in way of)\b/gi,
  cause: /\b(due to|because of|because|as a result of|as a result|resulted in|result in|caused by|owing to|therefore|consequently|so that)\b/gi,
  spelling: new RegExp(`\\b(?:${NUMWORDS})(?:[-\\s](?:${NUMWORDS})){1,}\\b`, 'gi'),
};

function matchAll(re, text) {
  if (!re) return [];
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    out.push(m[0].trim());
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

export function sentences(text = '') {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"'¿¡])/).map((s) => s.trim()).filter(Boolean);
}

function detectNounGroups(text) {
  const out = [];
  const words = text.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean);
  let run = [];
  const flush = () => {
    const nounish = run.filter((w) => MARITIME_NOUNS.has(w) || w.includes('-'));
    if (run.length >= 3 || (run.length === 2 && nounish.length === 2 && run.some((w) => w.includes('-')))) out.push(run.join(' '));
    run = [];
  };
  for (const w of words) {
    if (MARITIME_NOUNS.has(w) || (w.includes('-') && w.split('-').every((p) => MARITIME_NOUNS.has(p)))) run.push(w);
    else flush();
  }
  flush();
  return out;
}

function detectQuestions(text) {
  return sentences(text).filter((s) => /\?\s*$/.test(s) ||
    /^(?:QUESTION[.:]\s*)?(do|does|did|is|are|was|were|can|could|will|would|have|has|what|where|when|why|how|which|who|shall)\b/i.test(s) && /\?/.test(s));
}

function detectImperatives(text) {
  const re = new RegExp(`^(?:(?:INSTRUCTION|ADVICE)[.:]\\s*)?(?:please\\s+)?(?:do not\\s+|don't\\s+)?(?:${IMPERATIVE_VERBS})\\b`, 'i');
  return sentences(text).filter((s) => re.test(s.replace(/^[\w\s'-]+,\s*this is [\w\s'-]+[.,]\s*/i, '')));
}

/**
 * Analyse a message.
 * @param {string} text
 * @param {object} ctx { channel, roleAuthority, role }
 */
export function analyze(text = '', ctx = {}) {
  const t = String(text || '');
  const lower = t.toLowerCase();
  const structures = {};
  for (const [id, re] of Object.entries(DETECTORS)) {
    let hits;
    if (id === 'noun_group') hits = detectNounGroups(t);
    else if (id === 'question') hits = detectQuestions(t);
    else if (id === 'imperative') hits = detectImperatives(t);
    else hits = matchAll(re, id === 'marker' ? t : t);
    // de-noise
    if (id === 'past_simple') hits = hits.filter((w) => !/^(need|speed|red|bed|feed|seed|shed|hundred|indeed|ahead|proceed|exceed|succeed|anchored)$/i.test(w));
    if (id === 'marker') hits = hits.map((h) => h.replace(/[.:]$/, '')).filter((h) => h === h.toUpperCase());
    if (id === 'time4') hits = hits.filter((h) => !/\d{4}\s*(?:mm|kg)/i.test(h));
    if (hits.length) structures[id] = hits;
  }

  const issues = [];
  const radioChannel = ctx.channel && !['INT', 'PHONE', 'EMAIL', 'LOG', 'NOTE'].includes(String(ctx.channel));
  const words = (t.match(/\b[\w'-]+\b/g) || []).length;
  if (radioChannel && words > 4) {
    if (!/\bthis is\b/i.test(t) && !ctx.continuing) issues.push({ level: 'warn', code: 'no-callsign', es: 'En radio, identifica al destinatario y a ti: «[Destinatario], this is [buque]».' });
    if (!/\b(over|out)\b\.?\s*$/i.test(t.trim())) issues.push({ level: 'info', code: 'no-over', es: 'Termina la transmisión con «Over» (esperas respuesta) u «Out» (fin).' });
  }
  if (/\brepeat\b/i.test(t) && !/i say again/i.test(t)) issues.push({ level: 'warn', code: 'repeat', es: 'En SMCP se dice «Say again», no «repeat» (reservado a la artillería/órdenes).' });
  if (/\bINSTRUCTION\b/.test(t) && ctx.roleAuthority && !['authority', 'command'].includes(ctx.roleAuthority)) {
    issues.push({ level: 'warn', code: 'instruction-authority', es: 'Solo una autoridad (VTS, MRCC, buque de guerra…) puede usar INSTRUCTION hacia otro buque. Usa ADVICE o REQUEST.' });
  }
  if (/\b(front|back) of the (ship|vessel|boat)\b|\bat the (front|back)\b/i.test(t)) issues.push({ level: 'warn', code: 'front-back', es: 'Evita «front/back»: usa bow, stern, forward, aft.' });
  if (/\b(\d{1,2})[:.](\d{2})\b|\b\d{1,2}\s?(am|pm|a\.m\.|p\.m\.)\b/i.test(t)) issues.push({ level: 'info', code: 'time-format', es: 'Las horas a bordo se dan en cuatro cifras: «1515», no «3 pm» ni «15:15».' });
  if (/\b(something|stuff|things?|soon|later|be careful|sort out)\b/i.test(t)) issues.push({ level: 'info', code: 'vague', es: 'Mensaje vago: añade objeto, lugar, hora o cantidad concretos (p. ej. «before 1600», «near No. 2 hatch»).' });
  if (/\b(is|are) (dangerous|unsafe|going to collide)\b/i.test(t) && !structures.hedge) issues.push({ level: 'info', code: 'overclaim', es: 'Afirmación demasiado fuerte para los datos: usa «may present a risk», «appears to be closing».' });
  if (/\bmayday\b/i.test(t) && (lower.match(/mayday/g) || []).length < 3 && !/relay/i.test(t)) issues.push({ level: 'warn', code: 'mayday-format', es: 'El llamamiento de socorro empieza con MAYDAY tres veces y el nombre del buque tres veces.' });
  if (/\bpan[- ]?pan\b/i.test(t) && (lower.match(/pan[- ]?pan/g) || []).length < 3) issues.push({ level: 'info', code: 'panpan-format', es: 'PAN-PAN se transmite tres veces al inicio.' });
  if (/\b(babor|estribor|proa|popa|rumbo|demora|práctico|consignatario)\b/i.test(t)) issues.push({ level: 'info', code: 'spanish', es: 'Hay términos en español: usa port, starboard, bow, stern, course, bearing, pilot, agent…' });
  if (/\bmust not\b|\bmustn't\b/i.test(t) && /\bnot necessary|optional\b/i.test(t)) issues.push({ level: 'info', code: 'mustnt-vs-donthave', es: '«must not» = prohibido; «don\'t have to» = no es necesario.' });

  const strengths = [];
  if (structures.marker) strengths.push('Usa marcadores de mensaje SMCP');
  if (structures.data) strengths.push('Datos con unidades');
  if (structures.hedge) strengths.push('Lenguaje prudente');
  if (structures.callsign) strengths.push('Llamada bien identificada');

  return {
    words,
    sentences: sentences(t).length,
    structures,
    markers: structures.marker || [],
    issues,
    strengths,
  };
}

/** Count goal achievement over many messages. goals: [{ id, count }] */
export function goalProgress(messages, goals = []) {
  const totals = {};
  const examples = {};
  for (const m of messages) {
    const a = m.analysis || analyze(m.text, { channel: m.channel });
    for (const [id, hits] of Object.entries(a.structures || {})) {
      totals[id] = (totals[id] || 0) + hits.length;
      (examples[id] ||= []).push(...hits.slice(0, 2).map((h) => ({ hit: h, text: m.text, ts: m.ts })));
    }
  }
  return goals.map((g) => ({
    ...g,
    done: Math.min(totals[g.id] || 0, g.count || 1),
    total: totals[g.id] || 0,
    ok: (totals[g.id] || 0) >= (g.count || 1),
    examples: (examples[g.id] || []).slice(0, 4),
  }));
}

/** Simple summary statistics for a participant. */
export function participantStats(messages) {
  const own = messages.filter((m) => m.kind === 'radio' || m.kind === 'intercom' || m.kind === 'log');
  const a = own.map((m) => m.analysis || analyze(m.text, { channel: m.channel }));
  const words = a.reduce((s, x) => s + x.words, 0);
  const issues = a.reduce((s, x) => s + x.issues.filter((i) => i.level === 'warn').length, 0);
  const structureSet = new Set(a.flatMap((x) => Object.keys(x.structures || {})));
  const markers = a.reduce((s, x) => s + (x.markers?.length || 0), 0);
  const spoken = own.filter((m) => m.spoken).length;
  return {
    messages: own.length,
    words,
    avgWords: own.length ? Math.round(words / own.length) : 0,
    warnings: issues,
    variety: structureSet.size,
    structures: [...structureSet],
    markers,
    spoken,
    smcpAccuracy: own.length ? Math.max(0, Math.round(100 - (issues / own.length) * 25)) : null,
  };
}
