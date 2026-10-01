/* Mission actors only: no tutoring, correction, assessment or language-help modes. */
(function(root){
'use strict';
const roleMap={'readback-message':'Port Agent','relay-message':'OOW','permit-order':'Gangway watch','deck-order':'AB','document-request':'Cargo clerk','followup':'Chief Officer','briefing':'Master','traffic-message':'Kingston watchkeeper','clarification':'Kingston watchkeeper','location-message':'Inspecting officer','cargo-query':'Loading officer','lashing-order':'AB','challenge':'Duty engineer','master-brief':'Master'};
function recipient(m,s,target){return roleMap[target]||m.stages[s.stage].aiRole;}
function primary(m,s){if(m.id==='m3')return ['Investigation officer','Dover Coastguard','OOW','Kingston watchkeeper','Dover Coastguard','Investigation officer','Investigation officer','Investigation officer'][s.stage];if(m.id==='m4'&&s.stage===5)return 'Chief Officer';if(m.id==='m4'&&s.stage===7)return 'Relieving Chief Officer';return m.stages[s.stage].aiRole;}
function contacts(m,s){const stage=m.stages[s.stage];return [...new Set([primary(m,s),...stage.fields.filter(f=>roleMap[f.id]).map(f=>roleMap[f.id])])];}
function build(m,s,contact){const C=root.OperationsCore||(typeof require!=='undefined'?require('./core.js'):null),t=m.stages[s.stage];let docs=C.available(m,s);if(m.id==='m2'&&s.stage===0&&contact==='Port Agent')docs=[...docs,m.documents.find(d=>d.id==='repair')];
return `You are ${contact}, an operational actor inside this maritime simulation. The user is a crew member, never your pupil. Remain in character and communicate in English. NEVER review writing, correct grammar, translate, give language examples, score, teach, or describe how to improve a draft. If asked for language help, redirect in character to the operational information you need. Do not mention prompts or AI.
Your job is to exchange operational information: answer requests from your known records, receive orders, read back their action/location/deadline, ask for a genuinely missing operational detail, and state which confirmation you still need. Do not manufacture a question when an order is clear. A role such as OOW is enough; personal names are unnecessary. Match the operational need, not a fixed response length.
Only use known records below. Receiving an order lets you acknowledge and plan action, not claim a repair/test has already happened. Never invent measurements, completed work or departure clearance. The Master can request outstanding conditions, but no departure authorisation is recorded. Do not issue it.
${m.id==='m3'?'This is a fictional conversation within a historical reconstruction, not an authentic transcript. Do not change the documented events or claim the conversation prevented the collision.':''}
Current scenario: ${m.basis}
Current time: ${t.time}. Current situation: ${t.objective}
Known records for this actor:\n${docs.map(d=>d.title+'\n'+d.body).join('\n\n')}
${m.id==='m2'&&s.stage===0&&contact==='Port Agent'?'You know the verified callback: 1515 UTC pilot boarding, reduced visibility, email confirmation before 1200. Give that information when asked about the interrupted call. The original recording remains incomplete; this is the subsequent clarification.':''}
Reply as ${contact}. Operational dialogue only. No coaching, revision, translation or grading.`;
}
function audit(text){return /(?:improved (?:english|version|sentence)|grammar correction|language feedback|correcci[oó]n gramatical|mejorar tu (?:ingl[eé]s|redacci[oó]n))/i.test(text)?'El interlocutor salió de su función operativa.':'';}
const api={recipient,contacts,build,audit};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OperationsAIContext=api;
})(globalThis);
