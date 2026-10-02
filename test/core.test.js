// Unit tests for the pure logic (run: npm test). No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, goalProgress, participantStats } from '../src/ai/analyzer.js';
import { localReply, detectIntent, extract } from '../src/ai/local-engine.js';
import { resolveAddressee } from '../src/ai/npc.js';
import { initialState, picture, cpaTcpa, posAt, reanchor, applyEffects, targetFromSpec, shipClock } from '../src/sim/engine.js';
import { scenarioById, SCENARIOS } from '../src/data/scenarios.js';
import { EVENTS, tasksForRole, eventById } from '../src/data/events.js';
import { ROLES, CAREERS } from '../src/data/careers.js';
import { evaluate, fieldOk, orderScore, scriptedReply } from '../src/missions/check.js';
import { MISSIONS } from '../src/data/missions.js';
import { parseLocation } from '../src/ui/ship-diagram.js';
import { fromCSV, toCSV, fromMarkdownFiles, implicitLinks } from '../src/export/glossary-io.js';
import { seedGlossary } from '../src/data/glossary-seed.js';
import { zip, crc32 } from '../src/export/zip.js';

const lab = () => ({ id: 'L', scenarioId: 'tss_night', ...initialState(scenarioById('tss_night'), 'L', 1_000_000) });

test('analyzer detects required structures', () => {
  const a = analyze('Channel Traffic, this is Nordic Kestrel. QUESTION. If the CPA decreases, must I alter course? The lashings were secured at 1550. Range 2.4 nautical miles. Over.');
  for (const k of ['callsign', 'marker', 'conditional', 'modal_obligation', 'passive', 'time4', 'data', 'proword', 'question']) assert.ok(a.structures[k], 'missing ' + k);
});

test('analyzer separates must not / don\'t have to and flags SMCP issues', () => {
  const a = analyze("You don't have to call the agent. You must not enter the tank.");
  assert.ok(a.structures.no_need);
  assert.deepEqual(a.structures.modal_obligation, ['must not']);
  const b = analyze('repeat please, the ship is dangerous at 3 pm, front of the ship', { channel: '16' });
  const codes = b.issues.map((i) => i.code);
  for (const c of ['repeat', 'time-format', 'overclaim', 'no-callsign']) assert.ok(codes.includes(c), 'missing issue ' + c);
});

test('INSTRUCTION is flagged when used by a non-authority role', () => {
  const a = analyze('INSTRUCTION. Alter course to starboard.', { channel: '16', roleAuthority: 'officer' });
  assert.ok(a.issues.some((i) => i.code === 'instruction-authority'));
  const b = analyze('INSTRUCTION. Leave the traffic lane.', { channel: 'VTS', roleAuthority: 'authority' });
  assert.ok(!b.issues.some((i) => i.code === 'instruction-authority'));
});

test('goal progress counts across messages', () => {
  const msgs = ['QUESTION. What are your intentions?', 'INTENTION. I will alter course.'].map((text) => ({ text, kind: 'radio' }));
  const [g] = goalProgress(msgs, [{ id: 'marker', count: 2 }]);
  assert.equal(g.ok, true);
  assert.equal(participantStats(msgs).messages, 2);
});

test('local engine: intents, entities, read-back verification', () => {
  assert.equal(detectIntent('MAYDAY MAYDAY MAYDAY this is X'), 'distress');
  assert.equal(detectIntent('What are your intentions?'), 'intentions_query');
  const e = extract('Range 2.4 NM, bearing 045 degrees, speed 12 knots, 17 persons on board at 1515');
  assert.deepEqual(e.knots, [12]);
  assert.equal(e.persons, 17);
  assert.ok(e.times.includes('1515'));
  const L = lab();
  const history = [{ persona: 'vts', fromUid: 'npc:vts', text: 'Nordic Kestrel, this is Channel Traffic. CPA 0.4 nautical miles, range 4.0. Over.' }];
  const ok = localReply({ lab: L, personaKey: 'vts', text: 'Channel Traffic, this is Nordic Kestrel. Read back: CPA 0.4, range 4.0. Over.', channel: 'VTS', history, events: [], picture: picture(L, 1_000_000) });
  assert.match(ok.text, /correct/i);
  const bad = localReply({ lab: L, personaKey: 'vts', text: 'Channel Traffic, this is Nordic Kestrel. Read back: CPA 0.8, range 4.0. Over.', channel: 'VTS', history, events: [], picture: picture(L, 1_000_000) });
  assert.match(bad.text, /Mistake/);
});

test('MRCC asks for missing distress data, then acknowledges', () => {
  const L = lab();
  const r1 = localReply({ lab: L, personaKey: 'mrcc', text: 'MAYDAY MAYDAY MAYDAY, this is Nordic Kestrel. Fire in the engine room. Over.', channel: '16', history: [], events: [], picture: picture(L) });
  assert.match(r1.text, /QUESTION/);
  const r2 = localReply({ lab: L, personaKey: 'mrcc', text: 'MAYDAY MAYDAY MAYDAY, this is Nordic Kestrel, position 50 51N 001 02E, fire in the engine room, 17 persons on board. Over.', channel: '16', history: [], events: [], picture: picture(L) });
  assert.match(r2.text, /tasked|lifeboat|helicopter/i);
});

test('addressee resolution', () => {
  const L = lab();
  assert.equal(resolveAddressee(L, 'Channel Traffic, this is Nordic Kestrel'), 'vts');
  assert.equal(resolveAddressee(L, 'Baltic Heron, this is Nordic Kestrel').startsWith('vessel:'), true);
  assert.equal(resolveAddressee(L, 'Engine room, bridge here', '', 'INT'), 'engine');
  assert.equal(resolveAddressee(L, 'MAYDAY MAYDAY MAYDAY'), 'mrcc');
});

test('kinematics: dead reckoning and CPA for a collision course', () => {
  const own = { x: 0, y: 0, course: 0, speed: 10, setAt: 0 };
  const p = posAt(own, 3600_000);
  assert.ok(Math.abs(p.y - 10) < 1e-9 && Math.abs(p.x) < 1e-9);
  const tgt = { x: 5, y: 5, course: 270, speed: 10, setAt: 0 };
  const { cpa, tcpa } = cpaTcpa(own, tgt, 0);
  assert.ok(cpa < 0.01, 'should be a collision course, cpa=' + cpa);
  assert.ok(Math.abs(tcpa - 30) < 0.5);
  const re = reanchor(own, { course: 90 }, 1800_000);
  assert.ok(Math.abs(re.y - 5) < 1e-3 && re.course === 90);
});

test('crossing target created by an event has a small CPA', () => {
  const L = lab();
  const t = targetFromSpec(L.ownShip, { name: 'X', relBearing: 35, range: 2.4, course: 'crossing', speed: 14 }, {}, 1_000_000);
  const { cpa } = cpaTcpa(L.ownShip, t, 1_000_000);
  assert.ok(cpa < 0.6, 'cpa ' + cpa);
});

test('every event gives every role a task (specific or generic)', () => {
  for (const ev of EVENTS) {
    for (const r of ROLES) assert.ok(tasksForRole(ev, r.id).length >= 1, `${ev.id}/${r.id}`);
    assert.ok(ev.tasks.length >= 3, ev.id + ' should have several role-specific tasks');
  }
  // every degree track gets at least some specific tasks across the catalogue
  for (const c of CAREERS) {
    const roles = ROLES.filter((r) => r.career === c.id).map((r) => r.id);
    const n = EVENTS.reduce((acc, ev) => acc + roles.filter((r) => !tasksForRole(ev, r)[0].id.endsWith(':g')).length, 0);
    assert.ok(n >= 8, `${c.id} has only ${n} specific tasks`);
  }
});

test('event effects patch the lab', () => {
  const L = lab();
  const { patch } = applyEffects(L, eventById('blackout').effects, {});
  assert.equal(patch.engine.blackout, true);
  assert.equal(patch.ownShip.speed, 0);
  const { patch: p2 } = applyEffects(L, eventById('close_quarters').effects, { vessel: 'MV Test' });
  assert.equal(p2.targets.length, L.targets.length + 1);
  assert.ok(p2.targets.at(-1).name.includes('MV Test'));
});

test('ship clock advances from scenario time', () => {
  assert.equal(shipClock({ world: { clock: '0115' }, simStart: 0 }, 30 * 60000), '0145');
  assert.equal(shipClock({ world: { clock: '2350' }, simStart: 0 }, 20 * 60000), '0010');
});

test('scenarios are complete', () => {
  for (const s of SCENARIOS) {
    assert.ok(s.ownShip.name && s.stations.vts && s.stations.mrcc && s.traffic.length, s.id);
  }
});

test('mission criteria engine', () => {
  const c = [{ label: 'time', structure: 'time4' }, { label: 'cause', structure: 'cause' }, { label: 'num', numbers: ['1515'] }, { label: 'no vague', not: '\\bsoon\\b' }, { label: 'len', words: [5, 40] }];
  const good = evaluate(c, 'At 0948 the agency reported pilot boarding at 1515 due to reduced visibility.');
  assert.equal(good.score, 1);
  const bad = evaluate(c, 'Pilot soon.');
  assert.ok(bad.score < 0.5);
  assert.ok(fieldOk('15:15', ['1515', '15:15']));
  assert.ok(!fieldOk('', ['x']));
  assert.equal(orderScore([0, 1, 2], [0, 1, 2]), 1);
  assert.equal(orderScore([2, 1, 0], [0, 1, 2]), 0);
  assert.match(scriptedReply([{ if: 'stop', say: 'Stopping' }, { if: '.*', say: 'x' }], 'STOP pumping'), /Stopping/);
});

test('mission models satisfy most of their own criteria', () => {
  for (const m of MISSIONS) for (const p of m.phases) {
    if (p.type !== 'compose' || !p.model) continue;
    const r = evaluate(p.criteria, p.model);
    assert.ok(r.score >= 0.8, `${m.id} / ${p.title}: model scores ${Math.round(r.score * 100)}% — ${r.results.filter((x) => !x.ok).map((x) => x.label).join(', ')}`);
  }
});

test('ship location parser', () => {
  assert.deepEqual(pick(parseLocation('Forward of No. 2 hatch, port side')), { zone: 'hold1', side: 'port' });
  assert.deepEqual(pick(parseLocation('aft of number two hatch on the starboard side')), { zone: 'hold3', side: 'starboard' });
  assert.deepEqual(pick(parseLocation('in the forecastle')), { zone: 'forecastle', side: null });
  assert.ok(parseLocation('at the front, left').reasons.length >= 2);
});
const pick = (r) => ({ zone: r.zone, side: r.side });

test('glossary CSV and Obsidian round trip', () => {
  const seed = seedGlossary();
  assert.ok(seed.length >= 100);
  const back = fromCSV(toCSV(seed.slice(0, 20)));
  assert.equal(back.length, 20);
  assert.equal(back[0].term, seed[0].term);
  const md = fromMarkdownFiles([{ name: 'CPA.md', text: '---\nterm: "CPA"\nes: "punto de máxima aproximación"\ncategory: radar\n---\n# CPA\n\nClosest point of approach.\n\n## Related\n- [[TCPA]]\n' }, { name: 'TCPA.md', text: '# TCPA\n\nTime to CPA.' }]);
  assert.equal(md.length, 2);
  assert.deepEqual(md[0].related, ['tcpa']);
  assert.ok(implicitLinks(seed).length > 20);
});

test('zip writer produces a valid archive', () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686);
  const z = zip([{ name: 'a.txt', data: 'hello' }]);
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
});

import { safetyIndex, rotationPlan, fluency } from '../src/lab/metrics.js';

test('ship safety index penalises unanswered distress and rewards timely answers', () => {
  const ev = { id: 'e', ts: 0, severity: 'distress', titleEs: 'Fire', alarm: 'fire', acks: {} };
  const crew = [{ uid: 'a' }, { uid: 'b' }];
  const silent = safetyIndex({ events: [ev], comms: [], crew, now: 10 * 60000 });
  const answered = safetyIndex({ events: [{ ...ev, acks: { a: 1, b: 1 } }], comms: [{ kind: 'radio', fromUid: 'a', ts: 20000, text: 'MAYDAY MAYDAY MAYDAY, this is X. Over.' }], crew, now: 10 * 60000 });
  assert.ok(silent.score < answered.score, `${silent.score} < ${answered.score}`);
  assert.ok(silent.factors.some((f) => f.value < 0));
});

test('watch handover rotates roles inside the degree track without collisions', () => {
  const plan = rotationPlan([{ uid: 'a', careerId: 'nautica', roleId: 'oow' }, { uid: 'b', careerId: 'nautica', roleId: 'master' }, { uid: 'c', careerId: 'marina', roleId: 'eto' }], ROLES);
  const to = plan.map((p) => p.to);
  assert.equal(new Set(to).size, to.length);
  for (const p of plan) assert.notEqual(p.to, p.from);
  assert.equal(ROLES.find((r) => r.id === plan[2].to).career, 'marina');
});

test('fluency from spoken messages', () => {
  const f = fluency([{ spoken: true, speechMs: 6000, confidence: 0.9, text: 'Channel Traffic this is Nordic Kestrel request traffic information over' }]);
  assert.equal(f.wpm, 100);
  assert.equal(f.confidence, 90);
});
