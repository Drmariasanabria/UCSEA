// NPC stations that answer students when no human plays them.
import { scenarioById } from '../data/scenarios.js';

export const PERSONAS = {
  vts: { key: 'vts', label: 'VTS', authority: 'authority', es: 'Centro VTS', style: 'Calm, formal VTS operator. Gives traffic information and navigational advice. Uses INSTRUCTION only for clear safety orders inside its area.' },
  mrcc: { key: 'mrcc', label: 'MRCC', authority: 'authority', es: 'Salvamento Marítimo', style: 'MRCC coordinator. Acknowledges distress/urgency, asks for position, nature, persons on board, assistance required; tasks rescue units.' },
  pilot: { key: 'pilot', label: 'Pilot', authority: 'shore', es: 'Práctico', style: 'Harbour pilot. Practical, short. Boarding arrangements (side, ladder height, speed, course), ADVICE on manoeuvres.' },
  agent: { key: 'agent', label: 'Agent', authority: 'shore', es: 'Consignatario', style: 'Ship agent on the phone. Polite, business-like; times, documents, deadlines, berth windows; repeats numbers when asked.' },
  port: { key: 'port', label: 'Port Control', authority: 'authority', es: 'Control del puerto', style: 'Port control. Berthing permission, tugs, mooring gangs, port regulations.' },
  tug: { key: 'tug', label: 'Tug', authority: 'officer', es: 'Remolcador', style: 'Tug master towing a barge. Worried about his tow. Gives length of tow, asks vessels to keep clear (ADVICE/WARNING).' },
  vessel: { key: 'vessel', label: 'Other vessel', authority: 'officer', es: 'Otro buque', style: 'OOW of another merchant ship. Answers about own intentions, course, speed and CPA. Sometimes slightly unsure; uses read-backs.' },
  engine: { key: 'engine', label: 'Engine Room', authority: 'officer', es: 'Cámara de máquinas', style: 'Engineer on duty answering the bridge by internal phone. Technical, gives readings with units and estimates with cautious language.' },
  master: { key: 'master', label: 'Master', authority: 'command', es: 'Capitán', style: 'Ship master called by the OOW. Expects concise four-sentence reports; gives clear decisions with numbers and time limits.' },
  company: { key: 'company', label: 'Company / DPA', authority: 'shore', es: 'Compañía (DPA)', style: 'Designated Person Ashore. Asks for facts, times, damage, persons, and promises support. Formal.' },
  distressed: { key: 'distressed', label: 'Distressed vessel', authority: 'officer', es: 'Buque en peligro', style: 'Skipper of a small vessel in distress, stressed but following procedure. Short phrases.' },
};

// Which student role, if present in the crew, takes over an NPC (then the AI stays silent).
export const HUMAN_COVERS = {
  vts: ['vts_operator'],
  mrcc: ['mrcc_operator'],
  pilot: ['pilot'],
  agent: ['ship_agent'],
  port: ['harbour_master', 'port_ops'],
  engine: ['chief_engineer', 'second_engineer', 'third_engineer', 'eto', 'engine_cadet'],
  master: ['master'],
  company: ['dpa', 'tech_superintendent'],
  vessel: ['other_vessel'],
};

export function stationName(lab, key) {
  const st = scenarioById(lab?.scenarioId).stations || {};
  if (key === 'vessel') return null;
  if (key === 'engine') return 'Engine Room';
  if (key === 'master') return 'Master';
  return st[key] || PERSONAS[key]?.label || key;
}

// Work out who a message is addressed to, from the "to" field or the text itself.
export function resolveAddressee(lab, text = '', explicitTo = '', channel = '') {
  const st = scenarioById(lab?.scenarioId).stations || {};
  const hay = (explicitTo + ' ' + text.split(/this is/i)[0]).toLowerCase();
  const byName = Object.entries(st).find(([, name]) => name && hay.includes(name.toLowerCase()));
  if (byName) return mapStationKey(byName[0]);
  for (const t of lab?.targets || []) {
    const n = (t.name || '').toLowerCase().replace(/\s*\+.*$/, '').replace(/\(.*\)/, '').trim();
    if (n && n.length > 2 && hay.includes(n)) return t.tow || /tug/i.test(t.name) ? 'tug' : 'vessel:' + t.id;
  }
  if (/\b(vts|traffic|coast ?guard|cnis)\b/.test(hay)) return /coast ?guard|rescue|mrcc/.test(hay) ? 'mrcc' : 'vts';
  if (/\b(mrcc|rescue|salvamento|coastguard)\b/.test(hay)) return 'mrcc';
  if (/\bpilot/.test(hay)) return 'pilot';
  if (/\bagen(t|cy)\b/.test(hay)) return 'agent';
  if (/\bport control|harbour/.test(hay)) return 'port';
  if (/\btug\b/.test(hay)) return 'tug';
  if (/\b(engine|ecr|chief engineer|engineer)\b/.test(hay)) return 'engine';
  if (/\b(master|captain)\b/.test(hay)) return 'master';
  if (/\b(company|dpa|office|superintendent)\b/.test(hay)) return 'company';
  if (/\b(vessel|ship) (on|in) (my|your)\b|\bunknown vessel\b|\bvessel in position\b/.test(hay)) return 'vessel:nearest';
  if (/\bmayday|pan[- ]?pan\b/i.test(text)) return 'mrcc';
  if (channel === 'VTS') return 'vts';
  if (channel === 'INT') return /\b(bridge)\b/.test(hay) ? null : 'engine';
  if (channel === 'PHONE' || channel === 'EMAIL') return 'company';
  if (channel === '12') return 'port';
  return null;
}

function mapStationKey(k) {
  return { vts: 'vts', mrcc: 'mrcc', port: 'port', agent: 'agent', pilot: 'pilot', company: 'company', tug: 'tug' }[k] || k;
}

export function isCoveredByHuman(key, crew = []) {
  const base = key.split(':')[0];
  const roles = HUMAN_COVERS[base] || [];
  return crew.some((c) => roles.includes(c.roleId) && c.online !== false);
}
