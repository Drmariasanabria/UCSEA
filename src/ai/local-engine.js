// Local SMCP dialogue engine — always available, no network, no keys.
// Detects the intent of a student's transmission, extracts data, checks read-backs,
// and answers in role using the live situation (radar picture, active events, weather).
import { seeded, spokenDigits, norm360 } from '../core/util.js';
import { PERSONAS, stationName } from './npc.js';
import { eventById } from '../data/events.js';

const INTENTS = [
  ['distress', /\bmayday\b(?!\s*relay)/i],
  ['mayday_relay', /\bmayday relay\b/i],
  ['urgency', /\bpan[- ]?pan\b/i],
  ['securite', /\bs[ée]curit[ée]\b/i],
  ['radio_check', /\bradio check\b|\bhow do you read\b/i],
  ['say_again', /\bsay again\b|\bpardon\b|\bdid you say\b|\bcould you repeat\b|\brepeat (?:that|please|your)\b|\bplease repeat\b/i],
  ['readback', /\bread(?:ing)? back\b|\bi read back\b|\bi say again\b|\bconfirm(?:ing)? (?:that )?(?:the )?(?:time|bearing|range|position|course)/i],
  ['intentions_query', /\bwhat (?:are|is) your intentions?\b|\byour intentions\b|\bwhat do you intend\b|\bwhat are you going to do\b/i],
  ['cpa_query', /\b(?:cpa|closest point)\b.*\?|\bwill you pass\b|\bpassing (?:distance|side)\b/i],
  ['traffic_request', /\btraffic information\b.*\?|\b(?:any|other) (?:traffic|vessels?)\b|\brequest(?:ing)? traffic\b|\bany (?:ships?|contacts?)\b/i],
  ['damage_report', /\b(?:damage|no damage|damage report)\b/i],
  ['request_assistance', /\b(?:require|request|need)(?:s|ing)?\b.*\b(?:assistance|tug|help|medical|medevac|helicopter|lifeboat|escort)\b/i],
  ['medical', /\b(?:injur|chest pain|unconscious|medical|patient|bleeding|doctor|ambulance)\w*/i],
  ['fire', /\bfire\b|\bsmoke\b/i],
  ['flooding', /\bflood\w*|\bwater ingress\b|\btaking (?:in )?water\b|\bhull breach\b/i],
  ['propulsion', /\bblackout\b|\blost (?:propulsion|power|steering)\b|\bnot under command\b|\bsteering (?:gear )?failure\b|\bmain engine (?:failure|stopped)\b|\bengine failure\b/i],
  ['mob', /\bman overboard\b|\bperson overboard\b|\bmob\b/i],
  ['pollution', /\boil (?:slick|spill)\b|\bpollution\b|\boverflow\w*\b/i],
  ['list_cargo', /\blist\b|\bheel\w*\b|\bcargo shift\w*\b|\bstability\b/i],
  ['gnss', /\bgps\b|\bgnss\b|\bno fix\b|\bposition lost\b/i],
  ['eta', /\beta\b|\bestimated time of arrival\b|\bwhat time (?:will|do) you arrive\b/i],
  ['pilot', /\bpilot\b|\bboarding\b|\bladder\b/i],
  ['berth', /\bberth\b|\balongside\b|\bpermission to enter\b|\benter (?:the )?port\b|\bmoor\w*\b/i],
  ['documents', /\bmanifest\b|\bdocument\w*\b|\bsigned\b|\bemail\b|\bpaperwork\b|\bcertificate\w*\b/i],
  ['anchor', /\banchor\w*\b/i],
  ['intention_statement', /\b(?:i|we) (?:will|shall|am going to|intend to|am|are) (?:alter\w*|reduc\w*|keep\w*|stop\w*|proceed\w*|pass\w*|turn\w*|slow\w*|increase\w*|anchor\w*|leave\w*|enter\w*|stand\w* on)\b|\bINTENTION\b/i],
  ['position_report', /\b(?:my|our) position\b|\bposition is\b|\bwe are (?:in position|at|off)\b|\bbearing \d+.*from\b/i],
  ['engine_status', /\bengine\b|\bready\b|\bstand[- ]?by\b|\brpm\b|\bpressure\b|\btemperature\b/i],
  ['report', /\b(?:report|inform|information|observed|found|noticed|sighted)\b/i],
  ['acknowledge', /^(?:.*?\bthis is [\w\s'-]+[.,]\s*)?(?:received|roger|understood|noted|copied|thank you|thanks|ok(?:ay)?|wilco)\b/i],
  ['question', /\?/],
];

export function detectIntent(text) {
  for (const [name, re] of INTENTS) if (re.test(text)) return name;
  return 'unknown';
}

// --------- entity extraction ---------
export function extract(text = '') {
  const t = String(text);
  const times = [...t.matchAll(/\b([01]\d|2[0-3])([0-5]\d)\b(?!\s?(?:m\b|nm|kn|°|degrees|metres|tonnes|t\b|%))/g)].map((m) => m[0]);
  const degrees = [...t.matchAll(/\b(\d{1,3})\s?(?:°|degrees?|deg)\b/gi)].map((m) => +m[1]);
  const knots = [...t.matchAll(/\b(\d{1,2}(?:[.,]\d)?)\s?(?:kn|kts?|knots?)\b/gi)].map((m) => +m[1].replace(',', '.'));
  const miles = [...t.matchAll(/\b(\d{1,3}(?:[.,]\d+)?)\s?(?:nm|nautical miles?|miles?)\b/gi)].map((m) => +m[1].replace(',', '.'));
  const persons = (t.match(/\b(\d{1,4})\s+(?:persons?|people|crew|pob|souls)\b/i) || [])[1];
  const metres = [...t.matchAll(/\b(\d{1,4}(?:[.,]\d+)?)\s?(?:m|metres?|meters?)\b/gi)].map((m) => +m[1].replace(',', '.'));
  const numbers = [...t.matchAll(/\b\d+(?:[.,]\d+)?\b/g)].map((m) => m[0].replace(',', '.'));
  const spokenNums = [...t.matchAll(/\b((?:zero|one|two|three|four|five|six|seven|eight|nine|niner)(?:[-\s](?:zero|one|two|three|four|five|six|seven|eight|nine|niner|decimal)){1,})\b/gi)]
    .map((m) => m[1].toLowerCase().split(/[-\s]/).map((w) => (w === 'decimal' ? '.' : ({ zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, niner: 9 })[w])).join(''));
  const side = (t.match(/\b(port|starboard)\b/i) || [])[1]?.toLowerCase();
  const callsignOK = /\bthis is\b/i.test(t);
  const over = /\b(over|out)\b\.?\s*$/i.test(t.trim());
  const marker = (t.match(/\b(INSTRUCTION|ADVICE|WARNING|INFORMATION|QUESTION|ANSWER|REQUEST|INTENTION)\b/) || [])[1] || null;
  return { times, degrees, knots, miles, metres, persons: persons ? +persons : null, numbers: [...new Set([...numbers, ...spokenNums])], side, callsignOK, over, marker };
}

const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const brg3 = (n) => String(Math.round(norm360(n))).padStart(3, '0');

function variant(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

/**
 * @param ctx {
 *  lab, personaKey ('vts' | 'vessel:<id>' | ...), text, channel,
 *  senderName, senderShip, senderRoleId,
 *  history: [{ fromUid, persona, text }], events: active events, picture
 * }
 * @returns { text, intent, meta }
 */
export function localReply(ctx) {
  const { lab, text = '', picture = { contacts: [] }, events = [] } = ctx;
  const [baseKey, targetId] = String(ctx.personaKey || 'vts').split(':');
  const persona = PERSONAS[baseKey] || PERSONAS.vts;
  const rng = seeded(text + (ctx.history?.length || 0));
  const intent = detectIntent(text);
  const ex = extract(text);
  ex._t = text;
  const own = lab?.ownShip || { name: 'own ship' };
  const caller = ctx.senderShip || own.name;
  const evs = events.filter((e) => e.status === 'active');
  const lastEv = evs[evs.length - 1];
  const lastDef = lastEv ? (lastEv.custom || eventById(lastEv.eventId)) : null;

  // Identify the NPC vessel if needed.
  let vessel = null;
  if (baseKey === 'vessel' || baseKey === 'tug') {
    const contacts = picture.contacts || [];
    vessel = (targetId && targetId !== 'nearest' ? contacts.find((c) => c.id === targetId) : null)
      || (baseKey === 'tug' ? contacts.find((c) => c.tow || /tug/i.test(c.name)) : null)
      || contacts[0] || null;
  }
  const me = baseKey === 'vessel' || baseKey === 'tug' ? (vessel?.name || (baseKey === 'tug' ? 'tug' : 'vessel')) : stationName(lab, baseKey);
  const isRadio = !['INT', 'PHONE', 'EMAIL'].includes(String(ctx.channel));
  const open = isRadio ? `${caller}, this is ${me}.` : baseKey === 'engine' ? '' : baseKey === 'master' ? 'Master here.' : `${me} here.`;
  const close = isRadio ? ' Over.' : '';
  const say = (body, end = close) => ({ text: `${open} ${body.trim()}${end}`.replace(/\s+/g, ' ').trim(), intent, meta: { persona: baseKey } });

  // Protocol repair: unidentified caller on radio (VTS/MRCC are strict).
  if (isRadio && !ex.callsignOK && ['vts', 'mrcc', 'port'].includes(baseKey) && text.split(/\s+/).length > 3 && rng() < 0.55 && intent !== 'distress') {
    return { text: `Station calling ${me}, this is ${me}. Say again your name and call sign. Over.`, intent: 'repair', meta: { persona: baseKey, feedback: 'no-callsign' } };
  }
  if (text.trim().split(/\s+/).length < 2 || intent === 'unknown' && text.length < 12) {
    return say('Say again your message, please.');
  }

  // Read-back check against the last NPC transmission to this caller.
  const lastNpc = [...(ctx.history || [])].reverse().find((m) => m.persona === baseKey || m.fromUid === 'npc:' + baseKey);
  if (lastNpc && (intent === 'readback' || (ex.numbers.length >= 1 && /\b(read back|confirm|correct|i say again)\b/i.test(text)))) {
    const want = (extract(lastNpc.text).numbers || []).filter((n) => n.length >= 2);
    const got = new Set(ex.numbers);
    const missing = want.filter((n) => !got.has(n));
    if (!want.length) return say('Read back correct.');
    if (!missing.length) return say(variant(rng, ['Read back correct.', 'That is correct.', 'Correct.']));
    return say(`Mistake. I say again: ${missing.map((n) => `${n} (${spokenDigits(n)})`).join(', ')}.`);
  }

  if (intent === 'say_again' && lastNpc) {
    return say(`I say again. ${lastNpc.text.replace(/^.*?this is [^.]+\.\s*/i, '').replace(/\s*Over\.?$/i, '')}`);
  }
  if (intent === 'radio_check') return say(variant(rng, ['I read you five, loud and clear.', 'Reading you four, good.', 'I read you loud and clear.']));

  // ---------------- persona logic ----------------
  switch (baseKey) {
    case 'mrcc': return say(mrcc(intent, ex, ctx, rng, lastDef, lastEv, own));
    case 'vts': return say(vts(intent, ex, ctx, rng, picture, lastDef, lastEv, own));
    case 'pilot': return say(pilot(intent, ex, rng, own, lab));
    case 'agent': return say(agent(intent, ex, rng, lastEv), '');
    case 'port': return say(portControl(intent, ex, rng, own));
    case 'tug': return say(tug(intent, ex, rng, vessel, own));
    case 'vessel': return say(otherVessel(intent, ex, rng, vessel, own, picture));
    case 'engine': return say(engineRoom(intent, ex, rng, lab, lastDef), '');
    case 'master': return say(master(intent, ex, rng, lastDef, lastEv, text), '');
    case 'company': return say(company(intent, ex, rng, lastDef), '');
    case 'distressed': return say(distressed(intent, ex, rng, lastEv));
    default: return say('Received.');
  }
}

function needs(ex, list) {
  const missing = [];
  if (list.includes('position') && !(ex.degrees.length && ex.miles.length) && !/\b\d{2}°?\s?\d{1,2}(?:[.,]\d)?'?\s?[NS]\b/i.test(ex._t || '')) missing.push('position');
  if (list.includes('pob') && !ex.persons) missing.push('number of persons on board');
  return missing;
}

function mrcc(intent, ex, ctx, rng, def, ev, own) {
  const t = ctx.text;
  ex._t = t;
  if (intent === 'distress' || intent === 'urgency' || ['fire', 'flooding', 'mob', 'medical', 'propulsion'].includes(intent)) {
    const isMayday = intent === 'distress';
    const ack = isMayday ? 'RECEIVED MAYDAY.' : 'Received your urgency message.';
    const missing = needs(ex, ['position', 'pob']);
    if (/fire/i.test(t) && !/(engine room|accommodation|cargo|hold|galley|purifier)/i.test(t)) missing.push('location of the fire on board');
    if (/medical|injur|patient/i.test(t) && !/\b\d{2}\s?(?:years|yrs)\b/i.test(t)) missing.push('age and condition of the patient');
    if (missing.length) return `${ack} QUESTION. What is your ${missing.join(', and your ')}?`;
    if (/medical|patient|injur/i.test(t)) return `${ack} I am connecting you with the radio medical doctor. ADVICE. Keep the patient warm and do not give food or drink. Report vital signs every one-zero minutes.`;
    if (intent === 'mob') return `${ack} INFORMATION. I am broadcasting a MAYDAY RELAY and tasking the lifeboat; ETA three-zero minutes. QUESTION. What is the time the person went overboard and the water temperature?`;
    return `${ack} INFORMATION. Rescue helicopter and lifeboat are being tasked. QUESTION. Do you require evacuation of crew? Keep watch on channel one-six.`;
  }
  if (intent === 'mayday_relay') return 'Received MAYDAY RELAY. I take coordination of this distress traffic. QUESTION. What is your position and ETA to the casualty?';
  if (intent === 'pollution') return `Received. QUESTION. What is the extent and appearance of the pollution and the exact position? ADVICE. Do not use dispersants without authorisation.`;
  if (intent === 'acknowledge') return variant(rng, ['Received. Keep me informed.', 'Understood. Report any change immediately.']);
  if (def && ev) return `Received. QUESTION. What is your present situation concerning ${def.en.toLowerCase()}? Report your intentions.`;
  return variant(rng, ['Received. Say the nature of your call.', 'Received. QUESTION. Do you require assistance?']);
}

function vts(intent, ex, ctx, rng, picture, def, ev, own) {
  const contacts = (picture.contacts || []).filter((c) => c.range < 12);
  const near = contacts.find((c) => c.tcpa > 0 && c.tcpa < 40 && c.cpa < 1.5) || contacts[0];
  const traffic = (c) => `Traffic information. ${c.ais ? 'Vessel ' + c.name : 'Unidentified target, not transmitting AIS,'} on your ${c.side}, range ${fmt1(c.range)} nautical miles, course ${brg3(c.course)} degrees, speed ${fmt1(c.speed)} knots. CPA ${fmt1(c.cpa)} nautical miles${c.tcpa > 0 && c.tcpa < 120 ? `, in ${Math.round(c.tcpa)} minutes` : ''}.`;
  switch (intent) {
    case 'distress':
    case 'urgency':
      return `Received. ${stationName(ctx.lab, 'mrcc')} has been informed. ADVICE. Contact ${stationName(ctx.lab, 'mrcc')} on channel one-six. All ships keep clear of ${own.name}.`;
    case 'traffic_request':
    case 'cpa_query':
      return near ? traffic(near) : 'Traffic information. No reported traffic within six nautical miles.';
    case 'intention_statement':
      if (near && near.cpa < 0.5) return `Your intention is understood. ${traffic(near)} ADVICE. Monitor this vessel closely.`;
      return variant(rng, ['Your intention is understood. Report when clear.', 'Received. Your intention is noted. Proceed with caution.']);
    case 'intentions_query':
      return 'INFORMATION. VTS has no intentions; we monitor traffic. Contact the vessel concerned on channel one-three.';
    case 'position_report':
      return `Received. You are in the ${ctx.lab?.scenarioId === 'tss_night' ? 'south-west lane' : 'approach'}. ${near ? traffic(near) : ''} Report at the next reporting point.`;
    case 'gnss':
      return 'Received. INFORMATION. Two other vessels report GNSS interference in this area. ADVICE. Navigate by radar and visual fixes. Report your radar position every one-five minutes.';
    case 'propulsion':
      return `Received. INFORMATION. I am broadcasting a warning to all ships. QUESTION. Do you require tug assistance? ADVICE. Display not-under-command signals and report your drift.`;
    case 'anchor':
      return 'Received. ADVICE. Anchor in the designated anchorage, position two miles south of the outer buoy. Report when anchored.';
    case 'list_cargo':
      return 'Received. QUESTION. What is your list in degrees and is it increasing? Do you require assistance?';
    case 'pollution':
      return 'Received. I will inform the pollution response centre. QUESTION. What is the size of the slick?';
    case 'acknowledge':
      return variant(rng, ['Received.', 'Received. Keep listening watch on this channel.']);
    case 'question':
      if (/visib/i.test(ctx.text)) return `Answer. Visibility in the area ${fmt1(ctx.lab?.world?.visibility ?? 5)} nautical miles.`;
      if (/wind|weather/i.test(ctx.text)) return `Answer. Wind ${ctx.lab?.world?.windDir ?? 225} degrees, ${Math.round((ctx.lab?.world?.wind ?? 15))} knots. Sea state ${ctx.lab?.world?.seaState ?? 3}.`;
      return near ? `Answer. ${traffic(near)}` : 'Answer. Information not available. Stand by.';
    default:
      if (def && ev && /tow|tug/i.test(def.id)) return `WARNING. Tug and tow ahead of you in the lane, length of tow two-five-zero metres, not transmitting on AIS. ADVICE. Give the tow a wide berth.`;
      if (near && near.cpa < 0.8 && near.tcpa > 0) return `${traffic(near)} QUESTION. What are your intentions?`;
      return variant(rng, ['Received. Proceed with caution.', 'Received. Keep listening watch on this channel.', 'Received. Report your intentions.']);
  }
}

function pilot(intent, ex, rng, own, lab) {
  const side = (lab?.world?.windDir ?? 270) > 180 ? 'port' : 'starboard';
  if (intent === 'eta' || ex.times.length) return `Received ETA ${ex.times[0] || ''}. ADVICE. Make a lee on your ${side} side, pilot ladder one metre above the water, speed eight knots, course three-five-zero.`;
  if (intent === 'pilot' || intent === 'berth') return `Pilot boarding at the pilot station. ADVICE. Rig the pilot ladder on your ${side} side, one metre above the water. Reduce speed to eight knots and report one mile before the station.`;
  if (intent === 'acknowledge') return 'Understood. See you at the ladder.';
  return variant(rng, ['Received. QUESTION. What is your ETA at the pilot station?', 'Received. Confirm your draught, please.']);
}

function agent(intent, ex, rng, ev) {
  const v = ev?.vars || {};
  if (intent === 'say_again') return `I say again: pilot boarding ${v.time || '1515'}, confirmation needed before ${v.deadline || '1200'}.`;
  if (intent === 'eta') return `Thank you. I have your ETA ${ex.times[0] || 'as reported'}. I will inform the terminal and the pilots.`;
  if (intent === 'documents') return 'Yes, the terminal needs the signed cargo manifest and the crew list. Please send the signed copy by email before 1200.';
  if (intent === 'pilot') return `Pilot boarding is now ${v.time || '1515'} due to ${v.reason || 'reduced visibility'}. Please confirm by email before ${v.deadline || '1200'}.`;
  if (intent === 'berth') return 'Your berth is number three, starboard side alongside. The berth window opens at 1600 — I will confirm tugs.';
  if (intent === 'acknowledge') return 'Perfect, thank you. I will wait for your email.';
  if (intent === 'question') return 'Let me check and call you back in ten minutes. Is the Master available?';
  return variant(rng, ['Thank you. Could you confirm whether the Master has been informed?', 'Noted. Please send the confirmation by email.']);
}

function portControl(intent, ex, rng, own) {
  if (intent === 'berth') return `Permission granted to enter the port. Berth number three. Two tugs will meet you at the breakwater. Report when passing the outer buoy.`;
  if (intent === 'pollution') return 'Received. INSTRUCTION. Stop all bunkering operations immediately and contain the spill. Report the quantity.';
  if (intent === 'eta') return 'Received your ETA. Mooring gang and tugs ordered.';
  return variant(rng, ['Received. Stand by on channel one-two.', 'Received. Report your draught and ETA.']);
}

function tug(intent, ex, rng, vessel, own) {
  const tow = 'two-five-zero metres';
  if (intent === 'intentions_query') return `INTENTION. I will keep my course and speed. I am restricted in my ability to manoeuvre. Length of tow ${tow}. ADVICE. Keep clear of my tow.`;
  if (intent === 'intention_statement') return ex.side === 'port' || /port/i.test(ex._t || '') ? 'Understood, you will pass on my port side. Keep well clear of the tow astern of me. Over and out.' : 'Understood. Keep clear of my tow. The barge is two-five-zero metres astern of me.';
  if (intent === 'question' || intent === 'cpa_query') return `ANSWER. I am towing an unmanned barge, length of tow ${tow}. My speed ${fmt1(vessel?.speed || 5.5)} knots. My AIS is not working.`;
  return `WARNING. I am towing a barge. Length of tow ${tow}. ADVICE. Do not cross ahead or astern of me close.`;
}

function otherVessel(intent, ex, rng, v, own, picture) {
  if (!v) return 'Station calling, which vessel do you call? Give my position relative to you.';
  const keep = v.cpa > 0.8 || rng() < 0.4;
  switch (intent) {
    case 'intentions_query':
      return keep
        ? `INTENTION. I will keep my course ${brg3(v.course)} and speed ${fmt1(v.speed)} knots. I am the stand-on vessel.`
        : `INTENTION. I will alter course to starboard, new course ${brg3(v.course + 30)}. I will pass astern of you.`;
    case 'intention_statement':
      return `Understood. ${/starboard/i.test(ex._t || '') || ex.side === 'starboard' ? 'You alter course to starboard.' : 'Your intention is understood.'} I will keep my course and speed. Pass port to port.`;
    case 'cpa_query':
      return `ANSWER. My radar shows CPA ${fmt1(v.cpa)} nautical miles in ${Math.max(1, Math.round(v.tcpa))} minutes.`;
    case 'question':
      return `ANSWER. My course ${brg3(v.course)}, speed ${fmt1(v.speed)} knots. QUESTION. What are your intentions?`;
    case 'acknowledge':
      return 'Received. Good watch.';
    default:
      return `Received. INFORMATION. I am on course ${brg3(v.course)}, speed ${fmt1(v.speed)} knots. QUESTION. What are your intentions?`;
  }
}

function engineRoom(intent, ex, rng, lab, def) {
  const e = lab?.engine || {};
  if (e.blackout) return 'Bridge, engine room. We have a blackout. Emergency generator is on load. We expect to restore main power in about one-five minutes. I will report back.';
  if (e.fire) return 'Bridge, engine room. Fire in the purifier room. Ventilation stopped. All engine-room personnel accounted for. We are preparing the fixed fire-fighting system and need the Master\'s decision.';
  if (e.loPressure && e.loPressure < 2.5) return `Bridge, engine room. Main engine lube oil pressure ${fmt1(e.loPressure)} bar. It appears to be a blocked filter. We are changing over now. REQUEST. Reduce to half ahead for one-zero minutes.`;
  if ((e.bilge || 0) > 50) return 'Bridge, engine room. High bilge level, aft well, port side. Source not confirmed yet — possibly a cooling water leak. Bilge pump running.';
  if (intent === 'engine_status' || intent === 'question') return `Bridge, engine room. Main engine running normally, ${Math.round(e.rpm || 90)} rpm. Lube oil pressure ${fmt1(e.loPressure || 3)} bar. Engine ready for manoeuvring.`;
  if (intent === 'intention_statement' || /stand ?by|manoeuvr/i.test(ex._t || '')) return 'Understood. Engine on stand-by. Ready for manoeuvring in five minutes.';
  return variant(rng, ['Bridge, engine room. Understood.', 'Received. We will report any change.']);
}

function master(intent, ex, rng, def, ev, text) {
  const four = (text.match(/[.!?](\s|$)/g) || []).length;
  if (intent === 'distress' || intent === 'fire' || intent === 'flooding') return 'I am coming to the bridge. Sound the general alarm now. Prepare the distress message but do not send it until I confirm.';
  if (def?.id === 'close_quarters' || intent === 'cpa_query' || /cpa|crossing|contact|target/i.test(text)) return 'Understood. Alter course to starboard, two-zero degrees, now. Call me again if the CPA is less than one mile.';
  if (def?.id === 'restricted_visibility' || /fog|visib/i.test(text)) return 'Understood. Reduce to safe speed, ten knots. Start sound signals and post an extra lookout. I am coming up.';
  if (def?.id === 'pilot_change' || /pilot/i.test(text)) return 'Good. Send the email confirmation now and report back when it has been sent.';
  if (four < 2) return 'I need more information. Give me the situation, the risk, your action and when you will report again.';
  return variant(rng, ['Understood. Carry on and keep me informed.', 'Thank you. Log it and call me if anything changes.']);
}

function company(intent, ex, rng, def) {
  if (['fire', 'flooding', 'distress', 'urgency', 'propulsion'].includes(intent) || def?.severity === 'distress') return 'Thank you, Captain. I am activating the company emergency team. Please confirm: number of persons on board, any injuries, position, and assistance requested. Next call in thirty minutes.';
  if (intent === 'pollution') return 'Understood. I will inform P&I and the spill response contractor. Please keep photos and soundings for the report.';
  return variant(rng, ['Noted. Please send a short situation report by email.', 'Thank you. Do you need any technical support from the office?']);
}

function distressed(intent, ex, rng, ev) {
  if (intent === 'acknowledge' || intent === 'intention_statement') return 'Thank you, thank you. We are six persons. Water in the engine room. Please hurry.';
  if (intent === 'question') return 'Position as given. We have liferaft and lifejackets. Engine stopped.';
  return 'MAYDAY. We are sinking. Six persons on board. Require immediate assistance.';
}
