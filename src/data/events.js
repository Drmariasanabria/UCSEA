// Event / alarm catalogue for the Real Communication Lab.
// Each event changes the world, sounds an alarm, and gives EVERY role a specific
// communicative task (who to call, which SMCP marker, what the message must contain).
// Text in {braces} is replaced from event vars (teacher-editable when injecting).

import { ROLES, roleMatches, roleById } from './careers.js';

export const SEVERITY = {
  routine: { es: 'Rutina', color: 'var(--c-info)', rank: 0 },
  safety: { es: 'Seguridad', color: 'var(--c-safety)', rank: 1 },
  urgency: { es: 'Urgencia', color: 'var(--c-warn)', rank: 2 },
  distress: { es: 'Socorro', color: 'var(--c-danger)', rank: 3 },
};

export const CATEGORIES = {
  navigation: 'Navegación', engine: 'Máquinas', fire: 'Incendio', safety: 'Seguridad', cargo: 'Carga y estabilidad',
  environment: 'Medio ambiente', medical: 'Médico', security: 'Protección', port: 'Puerto y agencia', weather: 'Meteorología', inspection: 'Inspección',
};

export const EVENTS = [
  // ───────────────────────── NAVIGATION ─────────────────────────
  {
    id: 'close_quarters', category: 'navigation', severity: 'urgency', alarm: 'collision', icon: 'radar',
    es: 'Situación de aproximación excesiva', en: 'Close-quarters situation',
    vars: { vessel: 'MV Baltic Heron', side: 'starboard bow', range: '2.4', cpa: '0.2' },
    situation: 'Radar shows {vessel} on your {side}, range {range} NM, CPA {cpa} NM and decreasing. Her intentions are not confirmed.',
    effects: { addTarget: { name: '{vessel}', relBearing: 35, range: 2.4, course: 'crossing', speed: 14, ais: true } },
    broadcast: { from: 'vts', channel: 'VTS', text: '{ship}, this is VTS. Traffic information. Vessel {vessel} on your {side}, range {range} nautical miles, crossing from starboard to port. CPA {cpa} nautical miles. What are your intentions? Over.' },
    tasks: [
      { who: 'oow', task: 'Call {vessel} on VHF 16/13, give your position relative to her and ask her intentions. Use QUESTION and INTENTION markers.', to: '{vessel}', markers: ['QUESTION', 'INTENTION'], include: ['bearing or relative position', 'range', 'intention'] },
      { who: 'master', task: 'You were called to the bridge. Give a clear decision to the OOW (alter course/reduce speed) with a time or bearing limit.', to: 'OOW', markers: ['INSTRUCTION'], include: ['action', 'amount (degrees/knots)', 'time limit'] },
      { who: 'second_officer', task: 'Read the ARPA data aloud as data sentences: source, value, unit (bearing, range, CPA, TCPA).', to: 'Master', include: ['source', 'CPA', 'TCPA'] },
      { who: 'vts_operator', task: 'Give traffic information to both vessels. Do not instruct unless authorised: use ADVICE.', to: 'both vessels', markers: ['INFORMATION', 'ADVICE'] },
      { who: 'other_vessel', task: 'Answer the call. State your intentions clearly (stand on / alter course) and read back the CPA.', to: '{ship}', markers: ['ANSWER', 'INTENTION'] },
      { who: 'engineTeam', task: 'Stand by the engine for manoeuvring. Confirm "engine ready for manoeuvring" to the bridge.', to: 'Bridge', include: ['readiness'] },
      { who: 'pni_claims', task: 'Draft the first questions you would ask the Master if a collision happens (time, position, damage, VDR saved?).', to: 'Master', markers: ['QUESTION'] },
    ],
    generic: 'Monitor the channel. If you hear numbers, repeat them in your log with the time.',
  },
  {
    id: 'restricted_visibility', category: 'weather', severity: 'safety', alarm: 'caution', icon: 'fog',
    es: 'Visibilidad reducida (niebla)', en: 'Restricted visibility (fog bank)',
    vars: { visibility: '0.5' },
    situation: 'A fog bank reduces visibility to {visibility} NM. Sound signals and safe speed are required.',
    effects: { world: { visibility: 0.5, fog: true } },
    broadcast: { from: 'vts', channel: 'VTS', text: 'All ships, all ships, all ships. This is VTS. SÉCURITÉ. Visibility in the approach reduced to {visibility} nautical miles. Navigate with caution. Out.' },
    tasks: [
      { who: 'oow', task: 'Inform the Master: situation, consequence, action and next check (four-sentence briefing). Start sound signals.', to: 'Master', include: ['time', 'visibility', 'action', 'next check'] },
      { who: 'master', task: 'Order safe speed and extra lookout. Use "must" for the order and give the new speed.', to: 'OOW', markers: ['INSTRUCTION'], include: ['speed', 'lookout'] },
      { who: 'deck_cadet', task: 'Report as lookout what you hear/see with direction relative to the ship (e.g. fog signal on the port bow).', to: 'OOW', include: ['relative bearing'] },
      { who: 'engineTeam', task: 'Change to manoeuvring mode. Report to the bridge when the engine is on stand-by.', to: 'Bridge' },
      { who: 'vts_operator', task: 'Broadcast a SÉCURITÉ message with the visibility and advice to reduce speed.', markers: ['WARNING', 'ADVICE'] },
      { who: 'port_ops', task: 'Inform the agent that pilot boarding may be delayed. Use cautious language ("may", "not confirmed").', to: 'Agent' },
    ],
    generic: 'Note the time and visibility. Prepare one sentence that hedges what you cannot see.',
  },
  {
    id: 'dark_tow', category: 'navigation', severity: 'urgency', alarm: 'collision', icon: 'ship',
    es: 'Remolque sin AIS en el DST', en: 'Tug and tow not transmitting on AIS',
    vars: { tug: 'Tug Harbour Titan', length: '250', lane: 'south-west lane' },
    situation: '{tug} is towing an unmanned barge in the {lane}; length of tow {length} m. Neither the tug nor the barge transmits on AIS. Lights may be obscured.',
    effects: { addTarget: { name: '{tug} + tow', relBearing: 5, range: 3.2, course: 'same', speed: 5.5, ais: false, tow: true } },
    broadcast: { from: 'tug', channel: 16, text: 'Vessel astern of me in the {lane}, this is {tug}, {tug}. WARNING. I am towing a barge. Length of tow two-five-zero metres. ADVICE. Keep clear of my tow. Over.' },
    tasks: [
      { who: 'oow', task: 'Acquire the radar-only target. Report it to the Master as a data sentence and hedge what you cannot confirm (it appears to be / not confirmed).', to: 'Master', include: ['source', 'bearing', 'range', 'hedge'] },
      { who: 'second_officer', task: 'Call the tug, confirm length of tow and ask its intentions. Read back the numbers digit by digit.', to: '{tug}', markers: ['QUESTION'] },
      { who: 'vts_operator', task: 'Issue the tug-and-tow safety broadcast you would expect every hour: lane, length of tow, position, track, speed, AIS status.', markers: ['INFORMATION', 'WARNING'], include: ['length of tow', 'track', 'speed', 'AIS'] },
      { who: 'mrcc_operator', task: 'Ask the tug for its position and confirm that its towing lights are visible.', markers: ['QUESTION'] },
      { who: 'salvage_engineer', task: 'Advise the tug owner on releasing the tow from the conning position if power fails (conditional sentences).', include: ['if / unless'] },
      { who: 'dpa', task: 'Write a recommendation (base verb, bullet points) to the towage company about AIS and lights.', markers: ['ADVICE'] },
    ],
    generic: 'Write one sentence that separates evidence from claim about the unlit target.',
  },
  {
    id: 'gnss_failure', category: 'navigation', severity: 'safety', alarm: 'caution', icon: 'compass',
    es: 'Fallo de GNSS / GPS', en: 'GNSS position lost',
    vars: {},
    situation: 'Both GNSS receivers show "NO FIX". ECDIS is running on dead reckoning. Radar is still working.',
    effects: { world: { gnss: false } },
    tasks: [
      { who: 'second_officer', task: 'Fix the position by radar ranges and bearings. Report the method and the result to the Master.', to: 'Master', include: ['method', 'position'] },
      { who: 'oow', task: 'Inform VTS that you have lost GNSS and are navigating by radar. Ask whether other ships report the same.', to: 'VTS', markers: ['INFORMATION', 'QUESTION'] },
      { who: 'eto', task: 'Check the antennas and receivers. Report what you checked, what you found and what you cannot confirm yet.', to: 'Bridge', include: ['passive voice'] },
      { who: 'vts_operator', task: 'Broadcast a navigational warning about possible GNSS interference in the area.', markers: ['WARNING'] },
      { who: 'tech_superintendent', task: 'Request the fault log and serial numbers by email; give a deadline.', include: ['deadline'] },
    ],
    generic: 'Explain in one sentence why AIS positions may also be wrong now.',
  },
  {
    id: 'grounding_risk', category: 'navigation', severity: 'urgency', alarm: 'caution', icon: 'map',
    es: 'Riesgo de varada / poca agua', en: 'Shallow water ahead',
    vars: { depth: '9.4', draught: '8.6' },
    situation: 'Echo sounder: {depth} m and decreasing. Draught {draught} m. The ship is east of the planned track.',
    effects: { world: { depth: 9.4 } },
    tasks: [
      { who: 'oow', task: 'Give helm order and report to Master in one sentence: hazard first, then action (Due to ..., I have ...).', to: 'Master', include: ['hazard first', 'action'] },
      { who: 'master', task: 'Decide: reduce speed or alter course. Give an order with exact degrees/knots.', markers: ['INSTRUCTION'] },
      { who: 'port_engineer', task: 'Confirm the dredged depth of the channel and the date of the last survey. Be precise with units.', include: ['depth', 'date'] },
      { who: 'vts_operator', task: 'Warn the vessel that it is leaving the fairway and give the bearing back to the track.', markers: ['WARNING', 'ADVICE'] },
      { who: 'naval_architect', task: 'Explain squat and under-keel clearance to the Master in two sentences with "may".', include: ['may'] },
    ],
    generic: 'Calculate the under-keel clearance and say it with the unit.',
  },
  {
    id: 'steering_failure', category: 'engine', severity: 'urgency', alarm: 'engine', icon: 'wheel',
    es: 'Fallo del servo / gobierno', en: 'Steering gear failure',
    vars: { rudder: '10° port' },
    situation: 'Steering gear failure alarm. Rudder stuck at {rudder}. The ship is swinging to port.',
    effects: { ownShip: { rudderStuck: -10 }, signal: 'NUC' },
    tasks: [
      { who: 'oow', task: 'Change over to emergency steering / second pump and inform the Master and the engine room.', to: 'Master', markers: ['INFORMATION'] },
      { who: 'master', task: 'Order the "not under command" signal and inform VTS/nearby ships with PAN-PAN if needed.', to: 'VTS', markers: ['WARNING'] },
      { who: 'second_engineer', task: 'Go to the steering gear room. Report readings and estimated repair time with cautious language.', to: 'Chief Engineer', include: ['estimated time', 'hedge'] },
      { who: 'chief_engineer', task: 'Report the technical cause (or what is not yet known) to the Master and give a time for the next update.', to: 'Master', include: ['cause or unknown', 'next update'] },
      { who: 'eto', task: 'Check the steering power supply and the follow-up system; report with passive voice (was checked / was found).', include: ['passive voice'] },
      { who: 'vts_operator', task: 'Inform other traffic: vessel not under command, give position and advise a wide berth.', markers: ['WARNING', 'ADVICE'] },
      { who: 'class_surveyor', task: 'List what must be inspected before the ship continues the voyage (must / have to).', include: ['must', 'have to'] },
    ],
    generic: 'Write the log entry with time, fact and action.',
  },

  // ───────────────────────── ENGINE ─────────────────────────
  {
    id: 'blackout', category: 'engine', severity: 'urgency', alarm: 'engine', icon: 'bolt',
    es: 'Apagón (blackout)', en: 'Blackout',
    vars: {},
    situation: 'Total blackout. Main engine stopped. Emergency generator started. The ship is losing way.',
    effects: { ownShip: { speedTo: 0 }, engine: { blackout: true }, signal: 'NUC' },
    tasks: [
      { who: 'eto', task: 'Restore power: tell the bridge which generator you will start and when you expect power back.', to: 'Bridge', markers: ['INTENTION'], include: ['time estimate'] },
      { who: 'chief_engineer', task: 'Report to the Master: what happened, consequence, action, next update (four sentences).', to: 'Master', include: ['four sentences'] },
      { who: 'third_engineer', task: 'Check fuel supply to the generators and report readings with units.', include: ['units'] },
      { who: 'oow', task: 'Show NUC lights, inform VTS of loss of propulsion and your position.', to: 'VTS', markers: ['INFORMATION', 'WARNING'] },
      { who: 'master', task: 'Decide whether to anchor or request tug assistance. Use REQUEST correctly.', markers: ['REQUEST'] },
      { who: 'tech_superintendent', task: 'Ask the Chief Engineer three exact questions to diagnose the cause.', markers: ['QUESTION'] },
      { who: 'salvage_engineer', task: 'Prepare an emergency towing plan in three steps (before / while / after + -ing).', include: ['before', 'while', 'after'] },
    ],
    generic: 'Note what equipment you have lost and what still works.',
  },
  {
    id: 'me_low_lo', category: 'engine', severity: 'safety', alarm: 'engine', icon: 'engine',
    es: 'Baja presión aceite lubricante M.P.', en: 'Main engine lube oil low pressure',
    vars: { pressure: '1.6' },
    situation: 'ME lube oil pressure {pressure} bar and falling (normal 2.8–3.2). Slow-down alarm active.',
    effects: { engine: { loPressure: 1.6, slowdown: true }, ownShip: { speedTo: 8 } },
    tasks: [
      { who: 'second_engineer', task: 'Investigate: filters, pump, sump level. Report each finding with value and unit.', include: ['value', 'unit'] },
      { who: 'chief_engineer', task: 'Ask the bridge to reduce speed and explain the reason (because of / due to).', to: 'Bridge', markers: ['REQUEST'], include: ['due to'] },
      { who: 'oow', task: 'Acknowledge the engine room, reduce speed and inform the Master.', to: 'Master' },
      { who: 'engine_cadet', task: 'Read the pressure gauges aloud every minute: time, item, value.', include: ['time', 'value'] },
      { who: 'tech_superintendent', task: 'Request oil analysis results and confirm when the last sample was sent.', markers: ['REQUEST'] },
    ],
    generic: 'Explain the consequence of low lube oil pressure with "may".',
  },
  {
    id: 'bilge_alarm', category: 'engine', severity: 'safety', alarm: 'engine', icon: 'wave',
    es: 'Alarma de sentinas (máquinas)', en: 'Engine-room bilge high level alarm',
    vars: { location: 'aft bilge well, port side' },
    situation: 'Bilge high-level alarm in the {location}. Source of water unknown.',
    effects: { engine: { bilge: 70 } },
    tasks: [
      { who: 'engine_cadet', task: 'Report the bilge pump alarm to the engineer on duty immediately and note the time.', to: 'Engineer on duty', include: ['time'] },
      { who: 'third_engineer', task: 'Find the source (sea water / fresh water / oil). Say what you know and what you cannot confirm.', include: ['hedge'] },
      { who: 'second_engineer', task: 'Instruct the cadet with actor + action + object + time limit.', markers: ['INSTRUCTION'], include: ['time limit'] },
      { who: 'chief_officer', task: 'Ask whether it affects stability (free surface) and give advice.', markers: ['QUESTION', 'ADVICE'] },
      { who: 'harbour_master', task: 'Remind the ship that oily bilge water must not be pumped overboard in port.', include: ['must not'] },
    ],
    generic: 'Turn "tell someone about the alarm" into a safe instruction.',
  },
  {
    id: 'er_fire', category: 'fire', severity: 'distress', alarm: 'fire', icon: 'fire',
    es: 'Incendio en cámara de máquinas', en: 'Fire in the engine room',
    vars: { location: 'purifier room', persons: '19' },
    situation: 'Fire detected in the {location}. Smoke spreading in the engine room. {persons} persons on board.',
    effects: { engine: { fire: true }, ownShip: { speedTo: 4 } },
    broadcast: null,
    tasks: [
      { who: 'master', task: 'Sound the general alarm. Decide whether to send a MAYDAY or PAN-PAN and give the order.', markers: ['INSTRUCTION'] },
      { who: 'gmdss_operator', task: 'Transmit the distress/urgency message: name, call sign, position, nature of distress, assistance required, persons on board.', to: 'MRCC', include: ['position', 'nature', 'assistance', 'POB'] },
      { who: 'oow', task: 'If no GMDSS operator is present: call MRCC with MAYDAY or PAN-PAN in the correct format.', to: 'MRCC' },
      { who: 'chief_engineer', task: 'Report to the Master: location of fire, persons missing, ventilation stopped? fixed system ready?', to: 'Master', include: ['location', 'persons', 'ventilation'] },
      { who: 'second_engineer', task: 'Lead the engine-room party. Give sequenced orders: before entering..., while ..., after ...', include: ['before', 'while', 'after'] },
      { who: 'eto', task: 'Isolate electrical supply to the area and confirm when done.', include: ['confirmation'] },
      { who: 'mrcc_operator', task: 'Acknowledge the distress, collect position/POB/assistance needed and task a lifeboat or helicopter.', markers: ['QUESTION', 'INFORMATION'] },
      { who: 'dpa', task: 'Phone the Master: get a situation report in four facts, then inform flag and insurers.', markers: ['QUESTION'] },
      { who: 'pni_claims', task: 'List the evidence that must be preserved (VDR, logbooks, photos).', include: ['must'] },
    ],
    generic: 'Go to your muster station. Report "present" with your role and station.',
  },
  {
    id: 'accom_fire', category: 'fire', severity: 'urgency', alarm: 'fire', icon: 'fire',
    es: 'Incendio en habilitación', en: 'Fire in the accommodation',
    vars: { deck: 'C deck', cabin: 'cabin 304, starboard side' },
    situation: 'Smoke detector activated on {deck}, {cabin}. One crew member reported missing.',
    effects: {},
    tasks: [
      { who: 'third_officer', task: 'Lead the fire party: give orders with location reference language (aft of the stairwell, starboard side).', include: ['location reference'] },
      { who: 'master', task: 'Order a muster and a head count; ask for a report within a time limit.', markers: ['INSTRUCTION'], include: ['time limit'] },
      { who: 'chief_officer', task: 'Report the result of the head count and the missing person\'s last known position.', to: 'Master' },
      { who: 'deck_cadet', task: 'Report what you see on your way to the muster station (place + fact).', to: 'OOW' },
      { who: 'engineTeam', task: 'Start the emergency fire pump and confirm pressure on the fire main.', include: ['pressure'] },
    ],
    generic: 'Describe your escape route with forward/aft/port/starboard.',
  },
  {
    id: 'flooding', category: 'safety', severity: 'distress', alarm: 'general', icon: 'wave',
    es: 'Vía de agua', en: 'Hull breach and flooding',
    vars: { compartment: 'No. 1 hold', list: '6' },
    situation: 'Water ingress detected in {compartment}. The ship has a {list}° list to starboard.',
    effects: { ownShip: { list: 6 } },
    tasks: [
      { who: 'chief_officer', task: 'Sound the tanks/holds and report: compartment, sounding, rate of ingress, list.', to: 'Master', include: ['sounding', 'rate', 'list'] },
      { who: 'naval_architect', task: 'Advise on damage stability. Say what is likely and what is impossible to determine without soundings.', include: ['likely', 'impossible to determine'] },
      { who: 'master', task: 'Decide: PAN-PAN or MAYDAY, and request assistance if needed.', markers: ['REQUEST'] },
      { who: 'engineTeam', task: 'Start bilge/ballast pumps on the flooded compartment and report capacity in m³/h.', include: ['m³/h'] },
      { who: 'mrcc_operator', task: 'Ask for flooding rate, list, POB and intentions.', markers: ['QUESTION'] },
      { who: 'class_surveyor', task: 'Tell the company what must be surveyed before the ship sails again.', include: ['must'] },
    ],
    generic: 'Write one log line in past simple: what was found, where and when.',
  },
  {
    id: 'cargo_shift', category: 'cargo', severity: 'urgency', alarm: 'general', icon: 'ship',
    es: 'Corrimiento de carga y escora', en: 'Cargo shift and starboard list',
    vars: { list: '12', deck: 'upper vehicle deck' },
    situation: 'While turning, the ship developed a {list}° starboard list. Cargo appears to have shifted on the {deck}.',
    effects: { ownShip: { list: 12, speedTo: 6 } },
    tasks: [
      { who: 'chief_officer', task: 'Report the list, cargo shift evidence and ballast actions. Use incident verbs (developed, shifted, resulted in).', to: 'Master', include: ['developed', 'list'] },
      { who: 'naval_architect', task: 'Compare the loading computer figures with the actual condition. Separate fact from claim.', include: ['fact', 'claim'] },
      { who: 'master', task: 'Inform VTS with PAN-PAN: list, position, intentions, assistance required.', to: 'VTS', markers: ['INFORMATION', 'INTENTION'] },
      { who: 'deck_cadet', task: 'Describe exactly where the cargo moved using ship reference language.', include: ['forward/aft', 'port/starboard'] },
      { who: 'vts_operator', task: 'Ask the ship for intentions and advise traffic to keep clear.', markers: ['QUESTION', 'ADVICE'] },
      { who: 'psc_inspector', task: 'Write a deficiency sentence: item, evidence, risk, action, record (lashing/stability).', include: ['item', 'evidence', 'risk', 'action'] },
      { who: 'port_ops', task: 'Inform the terminal that the arrival is delayed and reschedule the berth window.', include: ['reschedule'] },
    ],
    generic: 'Explain the difference between list and trim to a colleague.',
  },
  {
    id: 'loose_lashings', category: 'cargo', severity: 'routine', alarm: null, icon: 'anchor',
    es: 'Trincas sueltas antes de salida', en: 'Loose lashings before departure',
    vars: { place: 'near No. 2 hatch', time: '1545', departure: '1700' },
    situation: 'At {time}, during pre-departure checks, loose lashings are found {place}. Rain has started. Departure planned for {departure}.',
    effects: { world: { rain: true } },
    tasks: [
      { who: 'deck_cadet', task: 'Report to the OOW in four sentences: situation, concern, request, completion check.', to: 'OOW', include: ['time', 'place'] },
      { who: 'oow', task: 'Instruct the AB: actor + action + place + time limit + report back.', markers: ['INSTRUCTION'], include: ['time limit', 'report back'] },
      { who: 'chief_officer', task: 'Tell the Master the status and whether departure at {departure} is still possible.', to: 'Master' },
      { who: 'port_ops', task: 'Ask the ship to confirm departure time; mention the deadline for the pilot booking.', markers: ['REQUEST'] },
    ],
    generic: 'Compress the situation into one log-style line.',
  },
  {
    id: 'bunker_spill', category: 'environment', severity: 'urgency', alarm: 'caution', icon: 'wave',
    es: 'Derrame durante el bunkering', en: 'Overflow during bunkering',
    vars: { tank: 'No. 3 FO tank (P)' },
    situation: 'During bunkering, oil overflows from the {tank} vent. Scuppers were not plugged. Drip tray overflowing.',
    effects: {},
    tasks: [
      { who: 'third_engineer', task: 'Order STOP pumping to the barge immediately (correct urgency: must).', to: 'Bunker barge', markers: ['INSTRUCTION'] },
      { who: 'oow', task: 'Give urgent orders to the AB: plug scuppers, contain the oil. Choose modals by force (must / had better).', include: ['must', 'had better'] },
      { who: 'chief_engineer', task: 'Report quantity estimate and what is not confirmed to the Master.', to: 'Master', include: ['estimate', 'hedge'] },
      { who: 'harbour_master', task: 'Ask the ship for quantity, location and containment measures.', markers: ['QUESTION'] },
      { who: 'dpa', task: 'Notify P&I and request an oil spill response contractor.', markers: ['REQUEST'] },
      { who: 'pni_claims', task: 'Ask for photos, times and soundings; avoid assigning blame.', include: ['neutral'] },
    ],
    generic: 'Say the difference between "must not" and "don\'t have to" with an example from this incident.',
  },
  {
    id: 'oil_sighting', category: 'environment', severity: 'safety', alarm: null, icon: 'wave',
    es: 'Mancha de hidrocarburos avistada', en: 'Oil slick sighted',
    vars: { side: 'port beam', size: '200 m by 50 m' },
    situation: 'An oil slick of approximately {size} is sighted on the {side}. Source unknown.',
    effects: {},
    tasks: [
      { who: 'oow', task: 'Report the pollution sighting to MRCC/VTS with position, size and appearance. Do not claim the source.', to: 'MRCC', markers: ['INFORMATION'], include: ['position', 'size', 'hedge'] },
      { who: 'mrcc_operator', task: 'Collect the details and ask if any vessel was seen nearby.', markers: ['QUESTION'] },
      { who: 'offshore_engineer', task: 'Confirm whether any installation in the field reports a leak.', include: ['confirm'] },
    ],
    generic: 'Write one fact and one thing you cannot claim.',
  },

  // ───────────────────────── SAFETY / MEDICAL ─────────────────────────
  {
    id: 'mob', category: 'safety', severity: 'distress', alarm: 'manoverboard', icon: 'lifebuoy',
    es: 'Hombre al agua', en: 'Man overboard',
    vars: { side: 'starboard side' },
    situation: 'Person overboard from the {side}. Lifebuoy thrown. Williamson turn required.',
    effects: { ownShip: { turn: 'williamson' } },
    tasks: [
      { who: 'oow', task: 'Press MOB, start the Williamson turn, inform Master and engine room, broadcast to nearby ships.', markers: ['WARNING'] },
      { who: 'deck_cadet', task: 'Keep pointing at the person. Report relative bearing and estimated distance every 30 seconds.', include: ['relative bearing', 'distance'] },
      { who: 'master', task: 'Order the rescue boat crew to stand by and request MRCC assistance.', markers: ['INSTRUCTION', 'REQUEST'] },
      { who: 'gmdss_operator', task: 'Send PAN-PAN (or MAYDAY RELAY) with position and description of the person.', to: 'MRCC' },
      { who: 'mrcc_operator', task: 'Coordinate: ask for time of fall, position, water temperature, description.', markers: ['QUESTION'] },
      { who: 'engineTeam', task: 'Stand by engine for manoeuvring and confirm.', include: ['confirmation'] },
    ],
    generic: 'Shout the alarm call in SMCP: "Man overboard on the ___ side!"',
  },
  {
    id: 'medical', category: 'medical', severity: 'urgency', alarm: null, icon: 'sos',
    es: 'Emergencia médica', en: 'Medical emergency on board',
    vars: { patient: 'an AB', symptoms: 'chest pain and difficulty breathing' },
    situation: '{patient} reports {symptoms}. Conscious. The ship is 40 NM from the nearest port.',
    effects: {},
    tasks: [
      { who: 'master', task: 'Request medical advice (TMAS) via MRCC; give age, symptoms, vital signs and position.', to: 'MRCC', markers: ['REQUEST'], include: ['symptoms', 'position'] },
      { who: 'chief_officer', task: 'Report the patient\'s condition every 10 minutes with time stamps.', include: ['time'] },
      { who: 'mrcc_operator', task: 'Ask the questions a radio doctor needs; give advice using should / had better.', markers: ['QUESTION', 'ADVICE'] },
      { who: 'ship_agent', task: 'Arrange an ambulance at the berth and confirm ETA with the ship.', include: ['ETA'] },
      { who: 'dpa', task: 'Ask the Master whether a deviation is needed and inform the charterer.', markers: ['QUESTION'] },
    ],
    generic: 'Ask one clear question about the patient using a question marker.',
  },
  {
    id: 'enclosed_space', category: 'safety', severity: 'urgency', alarm: 'general', icon: 'shield',
    es: 'Entrada en espacio cerrado sin permiso', en: 'Unauthorised enclosed space entry',
    vars: { space: 'ballast tank No. 4 (S)' },
    situation: 'A crew member is about to enter {space}. No permit has been signed and the atmosphere has not been tested.',
    effects: {},
    tasks: [
      { who: 'chief_officer', task: 'Stop the entry: use "must not" and give the conditions (until the permit has been signed and ...).', include: ['must not', 'until'] },
      { who: 'third_officer', task: 'Brief the rescue team: equipment and sequence (before entering ..., while ..., after ...).', include: ['before', 'while', 'after'] },
      { who: 'second_engineer', task: 'Confirm ventilation and gas readings (O₂ %, H₂S ppm, LEL %).', include: ['units'] },
      { who: 'psc_inspector', task: 'Write the deficiency (ISM-related) with item, evidence, risk, action and record.', include: ['item', 'evidence', 'risk', 'action'] },
      { who: 'dpa', task: 'Ask for the permit-to-work form and the last drill date.', markers: ['REQUEST'] },
    ],
    generic: 'Rewrite "Don\'t go there" as a safe operational instruction.',
  },
  {
    id: 'abandon_ship', category: 'safety', severity: 'distress', alarm: 'abandon', icon: 'lifebuoy',
    es: 'Abandono de buque', en: 'Abandon ship',
    vars: {},
    situation: 'The Master has decided to abandon ship. Lifeboats and liferafts are being prepared.',
    effects: { ownShip: { speedTo: 0 } },
    tasks: [
      { who: 'master', task: 'Give the abandon ship order in SMCP and confirm the distress alert has been sent.', markers: ['INSTRUCTION'] },
      { who: 'gmdss_operator', task: 'Transmit the final distress message: position, POB, abandoning to survival craft, EPIRB activated.', include: ['POB', 'survival craft'] },
      { who: 'third_officer', task: 'Report the lifeboat head count and launching status.', include: ['head count'] },
      { who: 'mrcc_operator', task: 'Acknowledge, task all assets, ask for number of survival craft and their position.', markers: ['QUESTION'] },
      { who: 'engineTeam', task: 'Stop machinery, close fuel quick-closing valves and report before leaving the engine room.', include: ['report'] },
    ],
    generic: 'State your lifeboat number and your duty in one sentence.',
  },
  {
    id: 'mayday_relay', category: 'safety', severity: 'distress', alarm: 'dsc', icon: 'sos',
    es: 'Mayday de otro buque (relay)', en: 'Distress alert from another vessel',
    vars: { vessel: 'FV Santa Elvira', position: '8 NM north-west of you', pob: '6' },
    situation: 'DSC distress alert received from {vessel}, {position}. Nature: sinking. {pob} persons on board. No acknowledgement from the coast station yet.',
    effects: {},
    broadcast: { from: 'distressed', channel: 16, text: 'MAYDAY, MAYDAY, MAYDAY. This is fishing vessel Santa Elvira, Santa Elvira, Santa Elvira. MAYDAY Santa Elvira. Position {position}. We are flooding and sinking. Six persons on board. We require immediate assistance. Over.' },
    tasks: [
      { who: 'gmdss_operator', task: 'Acknowledge or relay correctly (MAYDAY RELAY) — do not cancel the alert.', markers: ['INFORMATION'] },
      { who: 'master', task: 'Decide whether to proceed to assist; give course and ETA to MRCC.', markers: ['INTENTION'], include: ['course', 'ETA'] },
      { who: 'oow', task: 'Calculate course and ETA to the position and report them with units.', include: ['course', 'ETA'] },
      { who: 'mrcc_operator', task: 'Take coordination: acknowledge, name the on-scene coordinator and task vessels.', markers: ['INSTRUCTION'] },
      { who: 'other_vessel', task: 'Report your position, distance and ETA to the casualty.', markers: ['INFORMATION'] },
    ],
    generic: 'Write the MAYDAY RELAY format from memory.',
  },
  {
    id: 'bnwas', category: 'navigation', severity: 'safety', alarm: 'bnwas', icon: 'alarm',
    es: 'Alarma BNWAS no reconocida', en: 'BNWAS alarm not acknowledged',
    vars: {},
    situation: 'The bridge navigational watch alarm has escalated to the second stage. Nobody acknowledged it for 10 minutes.',
    effects: {},
    tasks: [
      { who: 'master', task: 'Call the bridge and ask why; order the OOW to keep the BNWAS switched on at all times.', markers: ['QUESTION', 'INSTRUCTION'] },
      { who: 'oow', task: 'Acknowledge, explain the lapse honestly and say what you will do next.', markers: ['INTENTION'] },
      { who: 'dpa', task: 'Write a short note on what the SMS requires about BNWAS (have to / must).', include: ['have to'] },
      { who: 'pni_claims', task: 'Explain why switched-off BNWAS appears in accident reports (cautious language).', include: ['hedge'] },
    ],
    generic: 'Say what BNWAS stands for and what it does in one sentence.',
  },

  // ───────────────────────── SECURITY / WEATHER ─────────────────────────
  {
    id: 'piracy', category: 'security', severity: 'distress', alarm: 'general', icon: 'shield',
    es: 'Aproximación sospechosa (piratería)', en: 'Suspicious craft approaching',
    vars: { craft: 'two high-speed skiffs', bearing: 'port quarter' },
    situation: '{craft} approaching at 25 kn from the {bearing}. Ladders visible. Ship security level 3.',
    effects: { addTarget: { name: 'Skiff ×2', relBearing: 225, range: 1.8, course: 'intercept', speed: 25, ais: false } },
    tasks: [
      { who: 'master', task: 'Order evasive manoeuvre, full speed, citadel muster; report to the security centre.', markers: ['INSTRUCTION'] },
      { who: 'oow', task: 'Report the craft as data: number, bearing, range, speed, closing.', include: ['bearing', 'range', 'speed'] },
      { who: 'gmdss_operator', task: 'Send the security alert / PAN-PAN with position and description of craft.', include: ['position'] },
      { who: 'chief_engineer', task: 'Confirm maximum available speed and that the engine room is secured.', include: ['speed'] },
      { who: 'dpa', task: 'Ask for the last confirmed position and the time the crew mustered in the citadel.', markers: ['QUESTION'] },
    ],
    generic: 'Give one order and one request; notice the difference in tone.',
  },
  {
    id: 'gale_warning', category: 'weather', severity: 'safety', alarm: 'caution', icon: 'wind',
    es: 'Aviso de temporal', en: 'Gale warning',
    vars: { wind: 'south-westerly force 8', time: 'within 6 hours' },
    situation: 'Navtex: gale warning, {wind}, expected {time}. Sea state rising.',
    effects: { world: { wind: 34, seaState: 6, windDir: 225 } },
    broadcast: { from: 'vts', channel: 'VTS', text: 'All ships. This is VTS. SÉCURITÉ. Gale warning. {wind} expected {time}. Out.' },
    tasks: [
      { who: 'master', task: 'Order heavy-weather precautions with a time limit (secure, check, report).', markers: ['INSTRUCTION'], include: ['time limit'] },
      { who: 'chief_officer', task: 'Check lashings and ballast; say what you checked using passive voice.', include: ['passive voice'] },
      { who: 'engineTeam', task: 'Secure loose items in the engine room; report "must not leave tools on workbenches".', include: ['must not'] },
      { who: 'port_ops', task: 'Inform about possible port closure and berth rescheduling with cautious language.', include: ['may'] },
      { who: 'naval_architect', task: 'Advise on parametric rolling risk and recommended heading/speed (should).', include: ['should'] },
    ],
    generic: 'Translate "Beaufort 8" into a full sentence with wind direction and force.',
  },

  {
    id: 'watch_handover', category: 'navigation', severity: 'routine', alarm: null, icon: 'users',
    es: 'Relevo de guardia (rotación de puestos)', en: 'Watch handover',
    vars: {},
    situation: 'Watch handover: every crew member takes over a new post. The outgoing watch must brief the incoming watch before leaving.',
    effects: {},
    tasks: [
      { who: 'bridgeTeam', task: 'Hand over the navigational watch in four sentences: position, course and speed; traffic (with CPA); active incidents; Master\'s standing orders. The incoming officer reads back the key data.', include: ['position', 'traffic', 'incidents', 'orders'] },
      { who: 'engineTeam', task: 'Hand over the engine-room watch: machinery running, abnormal readings with values and units, work in progress, alarms acknowledged.', include: ['readings', 'units'] },
      { who: 'shoreAuthority', task: 'Hand over the shore watch: vessels being monitored, open incidents, pending calls and the next scheduled broadcast.', include: ['vessels', 'incidents'] },
      { who: 'company', task: 'Pass on the case file: what the ship reported, what you asked, what is still pending and the deadline.', include: ['pending', 'deadline'] },
      { who: 'port', task: 'Hand over the port desk: ships expected, berth windows, documents pending and agreed times.', include: ['times'] },
    ],
    generic: 'Introduce yourself in your new post and confirm what you have taken over (I have taken over …).',
  },

  // ───────────────────────── PORT / AGENCY / INSPECTION ─────────────────────────
  {
    id: 'pilot_change', category: 'port', severity: 'routine', alarm: null, icon: 'anchor',
    es: 'Cambio de hora de embarque de práctico', en: 'Pilot boarding time changed',
    vars: { time: '1515', reason: 'reduced visibility', deadline: '1200' },
    situation: 'The agent says pilot boarding is now {time} due to {reason}. Email confirmation required before {deadline}.',
    effects: {},
    broadcast: { from: 'agent', channel: 'PHONE', text: 'Good morning, this is North Port Agency calling about your vessel. Pilot boarding time has changed to {time} due to {reason}. We need email confirmation before {deadline}.' },
    tasks: [
      { who: 'oow', task: 'Repair numbers (say again / did you say...), then brief the Master with time, reason, action and deadline.', to: 'Master', include: ['time', 'reason', 'deadline'] },
      { who: 'ship_agent', task: 'Make the call: opening, report, instruction. Repeat key numbers if asked.', to: 'OOW', include: ['time', 'deadline'] },
      { who: 'master', task: 'Instruct the OOW: inform, confirm by email, report back when done.', markers: ['INSTRUCTION'] },
      { who: 'port_ops', task: 'Reschedule the berth window and confirm tugs.', include: ['reschedule', 'confirm'] },
      { who: 'pilot', task: 'Give boarding arrangements: side, ladder height, speed.', include: ['side', 'speed'] },
      { who: 'engineTeam', task: 'Ask the bridge for the new stand-by time.', markers: ['QUESTION'] },
    ],
    generic: 'Write the log sentence: "At ..., the agency reported ..."',
  },
  {
    id: 'berth_delay', category: 'port', severity: 'routine', alarm: null, icon: 'clock',
    es: 'Retraso en atraque por documentación', en: 'Document-related berthing delay',
    vars: { delay: '3 hours', document: 'signed cargo manifest' },
    situation: 'Berthing delayed {delay}: the {document} has not been received by the terminal.',
    effects: {},
    tasks: [
      { who: 'port_ops', task: 'Inform the ship: reason, new time, what is needed and deadline (compact noun groups).', include: ['deadline'] },
      { who: 'ship_agent', task: 'Ask the Master for the signed report copy and confirm when it was sent.', markers: ['REQUEST'] },
      { who: 'master', task: 'Answer and say who will send what and when.', markers: ['ANSWER', 'INTENTION'] },
      { who: 'chief_officer', task: 'Verify the signed cargo documents and inform the OOW if any page is missing.', include: ['if'] },
    ],
    generic: 'Turn "the delay in loading because of documents" into a compact term.',
  },
  {
    id: 'psc_inspection', category: 'inspection', severity: 'routine', alarm: null, icon: 'log',
    es: 'Inspección de Control por el Estado del puerto', en: 'Port State Control inspection',
    vars: { item: 'fire door on deck 3', evidence: 'found open with the closer disconnected' },
    situation: 'PSC officer on board. Deficiency found: {item} {evidence}.',
    effects: {},
    tasks: [
      { who: 'psc_inspector', task: 'Record the deficiency: item, evidence, risk ("may affect"), action, record.', include: ['item', 'evidence', 'risk', 'action', 'record'] },
      { who: 'master', task: 'Answer the inspector: accept the finding and state the corrective action and time.', markers: ['ANSWER', 'INTENTION'] },
      { who: 'third_officer', task: 'Explain the maintenance record and when the door was last tested.', include: ['past simple'] },
      { who: 'class_surveyor', task: 'Confirm whether a condition of class is needed.', include: ['confirm'] },
      { who: 'dpa', task: 'Request the corrective action report before departure.', markers: ['REQUEST'] },
    ],
    generic: 'Write one deficiency sentence using "may affect".',
  },
  {
    id: 'crane_barge_traffic', category: 'navigation', severity: 'safety', alarm: null, icon: 'radar',
    es: 'Operaciones con cable / barcaza grúa', en: 'Cable-laying operations in the area',
    vars: { vessel: 'CS Atlantic Weaver', area: '2 NM south of the pilot station', channel: '72' },
    situation: '{vessel} restricted in her ability to manoeuvre, laying cable {area}. Wide berth requested. Contact on VHF {channel}.',
    effects: { addTarget: { name: '{vessel} (RAM)', relBearing: 20, range: 4.5, course: 'stopped', speed: 0.5, ais: true } },
    broadcast: { from: 'vts', channel: 'VTS', text: 'All ships. This is VTS. SÉCURITÉ. Cable operations by {vessel} {area}. Wide berth requested. Contact via VHF channel {channel}. Out.' },
    tasks: [
      { who: 'oow', task: 'Contact the cable ship, ask the recommended passing side and confirm you will give a wide berth.', markers: ['QUESTION', 'INTENTION'] },
      { who: 'offshore_engineer', task: 'As the cable ship, state the safety zone and the recommended passing distance.', markers: ['ADVICE'] },
      { who: 'vts_operator', task: 'Repeat the traffic information with SMCP 1.3 wording; only change the data.', include: ['wide berth'] },
    ],
    generic: 'Keep the manual phrase, change only the data.',
  },
];

export const eventById = (id) => EVENTS.find((e) => e.id === id);

// Replace {placeholders} using vars + context (ship name etc.).
export function fill(text = '', vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? vars[k] : m));
}

/**
 * Task list for one role in one active event.
 * Returns concrete tasks (filled) or the generic fallback.
 */
export function tasksForRole(event, roleId, ctx = {}) {
  const def = typeof event === 'string' ? eventById(event) : (event.def || eventById(event.eventId) || event);
  const role = roleById(roleId);
  if (!def || !role) return [];
  const vars = { ...(def.vars || {}), ...(event.vars || {}), ...ctx };
  const mine = (def.tasks || []).filter((t) => roleMatches(t.who, role));
  if (mine.length) {
    return mine.map((t, i) => ({
      id: `${def.id}:${i}`,
      text: fill(t.task, vars),
      to: t.to ? fill(t.to, vars) : null,
      markers: t.markers || [],
      include: t.include || [],
    }));
  }
  return [{ id: `${def.id}:g`, text: fill(def.generic || 'Monitor the situation and log what you hear.', vars), to: null, markers: [], include: [] }];
}

// Which roles get a dedicated (non-generic) task for an event — used by the teacher console.
export function rolesTouched(def) {
  return ROLES.filter((r) => (def.tasks || []).some((t) => roleMatches(t.who, r))).map((r) => r.id);
}
