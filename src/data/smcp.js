// SMCP (IMO Standard Marine Communication Phrases) resources used by the radio panel,
// the analyzer and the local dialogue engine.

export const MARKERS = [
  { id: 'INSTRUCTION', es: 'Instrucción — solo quien tiene autoridad (VTS, MRCC, buque de guerra…)', color: '#ff7a7a' },
  { id: 'ADVICE', es: 'Consejo — recomendación, el receptor decide', color: '#ffc46b' },
  { id: 'WARNING', es: 'Advertencia — peligro para la navegación', color: '#ff9e4f' },
  { id: 'INFORMATION', es: 'Información — hechos observados', color: '#6bd5ff' },
  { id: 'QUESTION', es: 'Pregunta', color: '#a98bff' },
  { id: 'ANSWER', es: 'Respuesta a una pregunta', color: '#8be0a8' },
  { id: 'REQUEST', es: 'Petición — pedir algo o una acción', color: '#7fb4ff' },
  { id: 'INTENTION', es: 'Intención — acciones propias inmediatas', color: '#5ff0d0' },
];

export const PROWORDS = ['over', 'out', 'say again', 'read back', 'correction', 'mistake', 'stand by', 'roger', 'received', 'understood', 'i say again', 'this is', 'all ships'];

export const CHANNELS = [
  { id: '16', label: 'CH 16', es: 'Socorro, seguridad y llamada' },
  { id: '13', label: 'CH 13', es: 'Seguridad de la navegación (puente a puente)' },
  { id: 'VTS', label: 'VTS 74', es: 'Canal de trabajo del VTS' },
  { id: '70', label: 'DSC 70', es: 'Llamada selectiva digital' },
  { id: '12', label: 'CH 12', es: 'Operaciones portuarias' },
  { id: 'INT', label: 'INTERCOM', es: 'Comunicaciones internas (puente ⇄ máquinas ⇄ cubierta)' },
  { id: 'UHF', label: 'UHF', es: 'Portátiles de maniobra' },
  { id: 'PHONE', label: 'TELÉFONO', es: 'Teléfono / satélite con tierra' },
  { id: 'EMAIL', label: 'EMAIL', es: 'Correo con la compañía o la agencia' },
];

// Phrase bank grouped by function (quick-insert chips in the radio console).
export const PHRASEBANK = [
  { id: 'calling', es: 'Llamada', items: [
    '{to}, {to}, {to}. This is {ship}, {ship}, {ship}. Over.',
    '{to}, this is {ship}. Radio check, how do you read me? Over.',
    'This is {ship}. I read you five, loud and clear. Over.',
  ] },
  { id: 'repair', es: 'Reparación', items: [
    'Say again, please. Over.',
    'Did you say {x}? Over.',
    'I say again: {x}.',
    'Read back, please.',
    'Mistake. Correction: {x}.',
    'Stand by.',
  ] },
  { id: 'distress', es: 'Socorro (MAYDAY)', items: [
    'MAYDAY, MAYDAY, MAYDAY. This is {ship}, {ship}, {ship}. Call sign {cs}. MAYDAY {ship}. Position {pos}. I am on fire / flooding / sinking. I require immediate assistance. {pob} persons on board. Over.',
    'MAYDAY RELAY, MAYDAY RELAY, MAYDAY RELAY. This is {ship}. Following received from {x} ...',
  ] },
  { id: 'urgency', es: 'Urgencia (PAN-PAN)', items: [
    'PAN-PAN, PAN-PAN, PAN-PAN. All stations. This is {ship}. Position {pos}. I have lost propulsion / steering. I require tug assistance. Over.',
    'PAN-PAN, PAN-PAN, PAN-PAN. This is {ship}. Man overboard in position {pos}. All vessels in the vicinity keep a sharp lookout. Over.',
  ] },
  { id: 'safety', es: 'Seguridad (SÉCURITÉ)', items: [
    'SÉCURITÉ, SÉCURITÉ, SÉCURITÉ. All ships. This is {ship}. Navigational warning: {x}. Out.',
  ] },
  { id: 'traffic', es: 'Información de tráfico', items: [
    'Traffic information. Vessel on your {side} bow, range {x} nautical miles, crossing from {a} to {b}.',
    'Risk of collision. What are your intentions? Over.',
    'Radar shows a target on bearing {x} degrees, range {y} nautical miles.',
    'The target appears to be closing. CPA {x} nautical miles, TCPA {y} minutes.',
    'There is no evidence that the vessel has altered course.',
  ] },
  { id: 'intentions', es: 'Intenciones', items: [
    'INTENTION. I will alter course to starboard.',
    'INTENTION. I will reduce speed to {x} knots.',
    'I am altering course to {x} degrees.',
    'I will check for damage and report within three-zero minutes.',
  ] },
  { id: 'engine', es: 'Máquinas', items: [
    'Engine ready for manoeuvring.',
    'Main engine lube oil pressure {x} bar and falling.',
    'Expected time to restore power: {x} minutes.',
    'Request permission to stop the main engine for {x} minutes.',
  ] },
  { id: 'reporting', es: 'Informes', items: [
    'At {time}, {fact} was observed {place}.',
    'Due to {hazard}, {action}.',
    'The {item} was found {evidence}. This may affect {risk}. Rectify before departure.',
    'Could you confirm whether {x}? Please inform {y} before {time}.',
  ] },
  { id: 'answers', es: 'Respuestas', items: [
    'ANSWER. Yes, {x}.',
    'ANSWER. Negative. {x}.',
    'Information not available.',
    'Understood. We will monitor the contact and maintain lookout.',
  ] },
];

// Language structures the teacher can require in a task (analyzer.js detects them).
export const STRUCTURES = [
  { id: 'marker', es: 'Marcadores de mensaje SMCP', ex: 'QUESTION. What are your intentions?' },
  { id: 'callsign', es: 'Llamada correcta (destinatario + "this is" + emisor)', ex: 'Dover VTS, this is Nordic Kestrel.' },
  { id: 'proword', es: 'Palabras de procedimiento (over / out / say again / read back)', ex: 'Say again, over.' },
  { id: 'conditional', es: 'Condicionales (if / unless / provided that)', ex: 'If the CPA decreases, I will alter course.' },
  { id: 'passive', es: 'Voz pasiva', ex: 'The lashings were secured at 1550.' },
  { id: 'modal_obligation', es: 'Obligación / prohibición (must, have to, must not)', ex: 'You must not enter the tank.' },
  { id: 'modal_advice', es: 'Consejo (should, had better)', ex: 'You had better reduce speed.' },
  { id: 'no_need', es: 'Ausencia de obligación (don\'t have to / needn\'t)', ex: 'You don\'t have to call the agent.' },
  { id: 'hedge', es: 'Lenguaje prudente (appears, likely, may, not confirmed)', ex: 'The contact appears to be closing.' },
  { id: 'sequence', es: 'Secuencia (before / while / after + -ing)', ex: 'Report to VTS after clearing the entrance.' },
  { id: 'data', es: 'Frase de datos (valor + unidad: NM, kn, °, bar, m)', ex: 'The range is 2.4 nautical miles.' },
  { id: 'time4', es: 'Hora en 4 dígitos (0948, 1515)', ex: 'At 0948 the agency called.' },
  { id: 'noun_group', es: 'Grupos nominales compactos', ex: 'pilot boarding time, cargo manifest signature' },
  { id: 'past_simple', es: 'Pasado simple narrativo (incident verbs)', ex: 'The vessel developed a list and drifted aground.' },
  { id: 'past_perfect', es: 'Pasado perfecto (had + participio)', ex: 'The stability issue had not been identified.' },
  { id: 'relative', es: 'Oraciones de relativo (which / that / who)', ex: 'The tug, which was towing a barge, ...' },
  { id: 'question', es: 'Preguntas directas', ex: 'Do you have any damage?' },
  { id: 'imperative', es: 'Imperativo operativo', ex: 'Secure the loose lashings before 1600.' },
  { id: 'future_intention', es: 'Futuro / intención (I will, I am going to, I intend to)', ex: 'I will report back when done.' },
  { id: 'reported', es: 'Estilo indirecto (reported that / said that / asked whether)', ex: 'The agent reported that the pilot boards at 1515.' },
  { id: 'reference', es: 'Referencias a bordo (forward of, aft of, port side, abeam)', ex: 'Forward of No. 2 hatch, port side.' },
  { id: 'cause', es: 'Causa / consecuencia (due to, because of, resulted in)', ex: 'Due to reduced visibility, pilot boarding is delayed.' },
  { id: 'spelling', es: 'Deletreo / números SMCP (two-five-zero, decimal)', ex: 'Length of tow two-five-zero metres.' },
];

export const structureById = (id) => STRUCTURES.find((s) => s.id === id);
