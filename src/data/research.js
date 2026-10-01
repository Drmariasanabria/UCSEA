// Research instruments for the teaching-innovation project (pre/post design).
// Likert 1–5. Items adapted to maritime communication self-efficacy and engagement.

export const CONSENT_TEXT = `Participación voluntaria en el proyecto de innovación docente «MAR-ESP SIM UC». Tus respuestas se usarán de forma seudonimizada (sin nombre ni correo) para evaluar el impacto del simulador en el aprendizaje del inglés marítimo. Puedes retirar tu consentimiento en cualquier momento desde Ajustes, y tu participación o no participación no afecta a tu calificación.`;

export const QUESTIONNAIRE = [
  { id: 'q1', dim: 'self-efficacy', en: 'I can make a correct VHF call using SMCP (call signs, message markers, Over/Out).', es: 'Puedo hacer una llamada VHF correcta usando SMCP.' },
  { id: 'q2', dim: 'self-efficacy', en: 'I can report radar data (bearing, range, CPA) clearly with units.', es: 'Puedo informar datos de radar con claridad y unidades.' },
  { id: 'q3', dim: 'self-efficacy', en: 'I can ask for repetition or clarification when I do not understand a number or a name.', es: 'Sé pedir repetición o aclaración cuando no entiendo un número o un nombre.' },
  { id: 'q4', dim: 'self-efficacy', en: 'I can give a safe instruction with the right modal (must, have to, had better, must not).', es: 'Sé dar una instrucción segura con el modal adecuado.' },
  { id: 'q5', dim: 'self-efficacy', en: 'I can describe a location on board precisely (forward of, aft of, port/starboard side).', es: 'Sé describir una ubicación a bordo con precisión.' },
  { id: 'q6', dim: 'self-efficacy', en: 'I can write a short incident or deficiency report in English.', es: 'Sé redactar un informe breve de incidente o deficiencia en inglés.' },
  { id: 'q7', dim: 'anxiety', en: 'I feel nervous when I have to speak English on the radio.', es: 'Me pongo nervioso/a cuando tengo que hablar inglés por radio.', reverse: true },
  { id: 'q8', dim: 'engagement', en: 'Practising in realistic situations motivates me to learn English.', es: 'Practicar en situaciones realistas me motiva a aprender inglés.' },
  { id: 'q9', dim: 'transfer', en: 'What I practise in class is useful for my future job at sea or ashore.', es: 'Lo que practico en clase es útil para mi futuro trabajo.' },
  { id: 'q10', dim: 'teamwork', en: 'I understand what other roles (bridge, engine, shore) need to hear from me.', es: 'Entiendo qué necesitan oír de mí otros puestos (puente, máquinas, tierra).' },
];

export const OPEN_QUESTIONS = [
  { id: 'o1', es: '¿Qué es lo más útil del simulador para ti?' },
  { id: 'o2', es: '¿Qué cambiarías o añadirías?' },
];

// Pseudonymous id: stable per user, not reversible without the salt kept by the teacher.
export function pseudonym(uid, salt = 'mesim') {
  let h = 2166136261;
  for (const c of salt + uid) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 'P' + (h >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

export function scale(answers, item) {
  const v = answers?.[item.id];
  if (v == null) return null;
  return item.reverse ? 6 - v : v;
}
