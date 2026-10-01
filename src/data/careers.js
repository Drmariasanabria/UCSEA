// Degree tracks, professional roles and the stations they work from.
// Every alarm/event in events.js resolves tasks against these ids.

export const STATIONS = {
  bridge: { id: 'bridge', es: 'Puente de gobierno', en: 'Navigation bridge', icon: 'wheel', panels: ['radar', 'conning', 'alarms'], channels: [16, 13, 'VTS'] },
  ecr: { id: 'ecr', es: 'Cámara de control de máquinas', en: 'Engine control room', icon: 'engine', panels: ['engine', 'alarms'], channels: ['INT'] },
  radio: { id: 'radio', es: 'Estación GMDSS', en: 'GMDSS radio station', icon: 'radio', panels: ['radar', 'gmdss', 'alarms'], channels: [16, 70, 13, 'VTS'] },
  deck: { id: 'deck', es: 'Cubierta / maniobra', en: 'Deck & mooring stations', icon: 'anchor', panels: ['deck', 'alarms'], channels: ['INT', 'UHF'] },
  vessel2: { id: 'vessel2', es: 'Puente de otro buque', en: 'Other vessel bridge', icon: 'ship', panels: ['radar', 'conning'], channels: [16, 13, 'VTS'] },
  vts: { id: 'vts', es: 'Centro VTS', en: 'VTS centre', icon: 'radar', panels: ['shoreRadar', 'alarms'], channels: ['VTS', 16] },
  mrcc: { id: 'mrcc', es: 'Salvamento Marítimo (MRCC)', en: 'MRCC / Coastguard', icon: 'lifebuoy', panels: ['shoreRadar', 'sar'], channels: [16, 70, 'VTS'] },
  port: { id: 'port', es: 'Puerto / terminal', en: 'Port & terminal', icon: 'anchor', panels: ['port', 'docs'], channels: [12, 'PHONE'] },
  office: { id: 'office', es: 'Oficina técnica / armador', en: 'Company & technical office', icon: 'doc', panels: ['stability', 'docs'], channels: ['PHONE', 'EMAIL'] },
};

export const CAREERS = [
  {
    id: 'nautica',
    es: 'Ingeniería Náutica y Transporte Marítimo',
    short: 'Náutica',
    en: 'Nautical Science & Maritime Transport',
    color: '#4fd1ff',
    blurb: 'Navegación, guardia de puente, maniobra, carga, seguridad y comunicaciones exteriores.',
  },
  {
    id: 'marina',
    es: 'Ingeniería Marina',
    short: 'Marina',
    en: 'Marine Engineering',
    color: '#ffb547',
    blurb: 'Máquina principal, auxiliares, energía eléctrica, mantenimiento y respuesta técnica a averías.',
  },
  {
    id: 'maritima',
    es: 'Ingeniería Marítima',
    short: 'Marítima',
    en: 'Maritime & Naval Engineering',
    color: '#7cf29c',
    blurb: 'Estabilidad, estructura, clasificación, salvamento, ingeniería portuaria y offshore.',
  },
  {
    id: 'gestion',
    es: 'Gestión Marítima y Portuaria',
    short: 'Gestión',
    en: 'Maritime & Port Management',
    color: '#c79bff',
    blurb: 'Armador, DPA, consignatario, operaciones portuarias, fletamentos, seguros e inspección.',
  },
];

// authority: 'command' (Master), 'officer', 'rating/cadet', 'authority' (may issue INSTRUCTION in SMCP), 'shore'
export const ROLES = [
  // ---- Náutica ----
  { id: 'master', career: 'nautica', station: 'bridge', authority: 'command', en: 'Master', es: 'Capitán',
    duties: ['Overall command and final decisions', 'Communications with company, MRCC and authorities', 'Orders general alarm and abandon ship'],
    focus: ['Orders vs. requests', 'Modal force (must / have to / had better)', 'Clear decisions with time limits'] },
  { id: 'chief_officer', career: 'nautica', station: 'bridge', authority: 'officer', en: 'Chief Officer', es: 'Primer oficial',
    duties: ['Cargo, stability and ballast', 'Leads emergency parties on deck', 'Reports damage and stability to the Master'],
    focus: ['Stability vocabulary (list, trim, GM, free surface)', 'Evidence vs. claim', 'Four-sentence briefings'] },
  { id: 'second_officer', career: 'nautica', station: 'bridge', authority: 'officer', en: 'Second Officer (Navigator)', es: 'Segundo oficial (navegación)',
    duties: ['Passage plan, ECDIS and charts', 'Navigational watch', 'Position reports and GMDSS'],
    focus: ['Data sentences: source + value + unit', 'Bearings, ranges, CPA/TCPA', 'SMCP traffic information'] },
  { id: 'third_officer', career: 'nautica', station: 'bridge', authority: 'officer', en: 'Third Officer (Safety)', es: 'Tercer oficial (seguridad)',
    duties: ['Life-saving and fire-fighting equipment', 'Navigational watch', 'Musters and drills'],
    focus: ['Sequencing: before / while / after + -ing', 'Safe operational instructions'] },
  { id: 'oow', career: 'nautica', station: 'bridge', authority: 'officer', en: 'Officer of the Watch (OOW)', es: 'Oficial de guardia',
    duties: ['Keeps a proper lookout and the navigational watch', 'Calls the Master when in doubt', 'First radio contact with VTS and other vessels'],
    focus: ['SMCP message markers', 'Repair moves: say again / read back', 'Hedged reporting (appears to, not confirmed)'] },
  { id: 'deck_cadet', career: 'nautica', station: 'deck', authority: 'rating', en: 'Deck Cadet', es: 'Alumno de puente',
    duties: ['Rounds and checks on deck', 'Reports observations to the OOW', 'Assists at mooring stations'],
    focus: ['Ship reference language (forward, aft, abeam)', 'Reporting with time, place and fact'] },
  { id: 'gmdss_operator', career: 'nautica', station: 'radio', authority: 'officer', en: 'GMDSS Radio Operator', es: 'Radiooperador GMDSS',
    duties: ['DSC alerts and distress traffic', 'MSI and navigational warnings', 'Radio log'],
    focus: ['MAYDAY / PAN-PAN / SÉCURITÉ format', 'Spelling and spoken numbers'] },
  { id: 'pilot', career: 'nautica', station: 'vessel2', authority: 'shore', en: 'Harbour Pilot', es: 'Práctico',
    duties: ['Pilot boarding arrangements', 'Advises on manoeuvres in port approaches', 'Coordinates tugs'],
    focus: ['ADVICE vs. INSTRUCTION', 'Helm and engine orders'] },
  { id: 'vts_operator', career: 'nautica', station: 'vts', authority: 'authority', en: 'VTS Operator', es: 'Operador VTS',
    duties: ['Traffic information and navigational assistance', 'Monitors the TSS and approaches', 'Issues instructions when authorised'],
    focus: ['Traffic information phrases', 'Cautious language without vagueness'] },
  { id: 'mrcc_operator', career: 'nautica', station: 'mrcc', authority: 'authority', en: 'MRCC Coordinator (Coastguard)', es: 'Coordinador MRCC (Salvamento Marítimo)',
    duties: ['Coordinates search and rescue', 'Acknowledges distress and urgency traffic', 'Tasks lifeboats, helicopters and vessels'],
    focus: ['Distress/urgency procedures', 'Questions that get exact data'] },
  { id: 'harbour_master', career: 'nautica', station: 'port', authority: 'authority', en: 'Harbour Master', es: 'Capitán marítimo / Capitanía',
    duties: ['Port safety and berthing permissions', 'Pollution and incident reports', 'Port State coordination'],
    focus: ['Permissions and conditions', 'Formal reporting language'] },
  { id: 'other_vessel', career: 'nautica', station: 'vessel2', authority: 'officer', en: 'OOW on another vessel', es: 'Oficial de guardia de otro buque',
    duties: ['Answers calls from own ship and VTS', 'States intentions clearly', 'Takes avoiding action'],
    focus: ['Intentions and CPA', 'Read-backs'] },

  // ---- Marina ----
  { id: 'chief_engineer', career: 'marina', station: 'ecr', authority: 'officer', en: 'Chief Engineer', es: 'Jefe de máquinas',
    duties: ['Main and auxiliary machinery', 'Engine-room emergencies', 'Reports technical status to the Master'],
    focus: ['Cause-and-effect reports', 'Technical noun groups (lube oil pressure alarm)', 'Estimated repair times'] },
  { id: 'second_engineer', career: 'marina', station: 'ecr', authority: 'officer', en: 'Second Engineer', es: 'Primer oficial de máquinas',
    duties: ['Runs the engine room day to day', 'Leads the engine-room emergency party', 'Planned maintenance'],
    focus: ['Instructions with actor + verb + object + time limit', 'Permit-to-work language'] },
  { id: 'third_engineer', career: 'marina', station: 'ecr', authority: 'officer', en: 'Third Engineer', es: 'Segundo oficial de máquinas',
    duties: ['Generators, purifiers and bunkering', 'Engine-room watch', 'Fuel and lube oil transfers'],
    focus: ['Bunkering communication', 'Readings with units'] },
  { id: 'eto', career: 'marina', station: 'ecr', authority: 'officer', en: 'Electro-Technical Officer (ETO)', es: 'Oficial electrotécnico',
    duties: ['Power distribution, switchboards and automation', 'Navigation and radio electronics', 'Blackout recovery'],
    focus: ['Fault descriptions', 'Safety prohibitions (must not)'] },
  { id: 'engine_cadet', career: 'marina', station: 'ecr', authority: 'rating', en: 'Engine Cadet', es: 'Alumno de máquinas',
    duties: ['Rounds and readings', 'Reports leaks and abnormal readings', 'Assists in maintenance'],
    focus: ['Reporting readings', 'Asking for clarification'] },
  { id: 'tech_superintendent', career: 'marina', station: 'office', authority: 'shore', en: 'Technical Superintendent', es: 'Inspector técnico (superintendente)',
    duties: ['Supports the ship on technical failures from the office', 'Spare parts and repairs', 'Class and flag liaison'],
    focus: ['Emails and formal requests', 'Hedging under uncertainty'] },

  // ---- Marítima ----
  { id: 'naval_architect', career: 'maritima', station: 'office', authority: 'shore', en: 'Naval Architect (Stability)', es: 'Ingeniero naval (estabilidad)',
    duties: ['Damage stability and loading assessments', 'Advises on ballast and cargo shifts', 'Strength calculations'],
    focus: ['Stability terms (GM, list, heel, free surface)', 'Likely / possibly / impossible to determine'] },
  { id: 'class_surveyor', career: 'maritima', station: 'office', authority: 'shore', en: 'Classification Society Surveyor', es: 'Inspector de sociedad de clasificación',
    duties: ['Damage surveys and conditions of class', 'Approves temporary repairs', 'Hull and machinery inspections'],
    focus: ['Deficiency language: item, evidence, risk, action, record', 'Passive voice in reports'] },
  { id: 'salvage_engineer', career: 'maritima', station: 'office', authority: 'shore', en: 'Salvage Engineer', es: 'Ingeniero de salvamento',
    duties: ['Assesses refloating and towing', 'Plans emergency towing', 'Damage control advice'],
    focus: ['Conditional plans (if / unless / provided that)', 'Risk statements'] },
  { id: 'port_engineer', career: 'maritima', station: 'port', authority: 'shore', en: 'Port Engineer', es: 'Ingeniero portuario',
    duties: ['Berths, fenders and port infrastructure', 'Dredged depths and under-keel clearance', 'Damage to port structures'],
    focus: ['Measurements and tolerances', 'Formal incident descriptions'] },
  { id: 'offshore_engineer', career: 'maritima', station: 'office', authority: 'shore', en: 'Offshore Installation Engineer', es: 'Ingeniero de instalaciones offshore',
    duties: ['Safety zones around installations', 'Cable and pipeline operations', 'Coordinates with vessels in the field'],
    focus: ['Safety zone warnings', 'Traffic information about operations'] },

  // ---- Gestión ----
  { id: 'dpa', career: 'gestion', station: 'office', authority: 'shore', en: 'Designated Person Ashore (DPA) / Ship Manager', es: 'Persona designada en tierra (DPA)',
    duties: ['ISM emergency response from the company', 'Contacts insurers, flag and authorities', 'Supports the Master'],
    focus: ['Formal emails and situation reports', 'Questions that collect key facts'] },
  { id: 'ship_agent', career: 'gestion', station: 'port', authority: 'shore', en: 'Ship Agent', es: 'Consignatario',
    duties: ['Arrival paperwork, pilot and berth bookings', 'Crew changes and supplies', 'Liaison between ship and port'],
    focus: ['Rotating call: opening, repair, report, instruction', 'Deadlines and confirmations'] },
  { id: 'port_ops', career: 'gestion', station: 'port', authority: 'shore', en: 'Port Operations / Terminal Planner', es: 'Operaciones portuarias / terminal',
    duties: ['Berth windows and cargo operations', 'Delays and resequencing', 'Coordination with stevedores'],
    focus: ['Scheduling verbs (reschedule, delay, confirm)', 'Compact noun groups'] },
  { id: 'pni_claims', career: 'gestion', station: 'office', authority: 'shore', en: 'P&I / Marine Insurance Claims Handler', es: 'Gestor de siniestros P&I / seguros',
    duties: ['Collects evidence after incidents', 'Advises on liability exposure', 'Appoints surveyors'],
    focus: ['Fact vs. claim vs. inference', 'Neutral, non-blaming wording'] },
  { id: 'psc_inspector', career: 'gestion', station: 'port', authority: 'authority', en: 'Port State Control Officer', es: 'Inspector de control por el Estado rector del puerto',
    duties: ['Inspects foreign ships', 'Records deficiencies and detentions', 'Verifies rectification'],
    focus: ['Deficiency sentences', 'Must / must not for compliance'] },
];

export const roleById = (id) => ROLES.find((r) => r.id === id);
export const careerById = (id) => CAREERS.find((c) => c.id === id);
export const rolesFor = (careerId) => ROLES.filter((r) => r.career === careerId);
export const stationOf = (roleId) => STATIONS[roleById(roleId)?.station] || STATIONS.bridge;

// Groups used by event tasks: a task can target roles, stations, careers or these groups.
export const GROUPS = {
  command: ['master'],
  bridgeTeam: ['master', 'chief_officer', 'second_officer', 'third_officer', 'oow', 'gmdss_operator'],
  deckTeam: ['chief_officer', 'deck_cadet', 'third_officer'],
  engineTeam: ['chief_engineer', 'second_engineer', 'third_engineer', 'eto', 'engine_cadet'],
  shoreAuthority: ['vts_operator', 'mrcc_operator', 'harbour_master', 'psc_inspector'],
  company: ['dpa', 'tech_superintendent', 'naval_architect', 'class_surveyor', 'pni_claims', 'salvage_engineer'],
  port: ['ship_agent', 'port_ops', 'port_engineer', 'harbour_master', 'pilot'],
};

export function roleMatches(target, role) {
  if (!target || !role) return false;
  if (target === '*' || target === role.id || target === role.station || target === role.career) return true;
  return (GROUPS[target] || []).includes(role.id);
}
