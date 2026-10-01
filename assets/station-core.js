(function(root){
'use strict';
function fresh(mission,caseId){return {version:3,mission,caseId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[],changes:[],finalRecord:'',completionStatus:'partial',caseChanged:false};}
function checks(c,s){const exchanges=Object.keys(c.contacts).filter(name=>s.messages.some(m=>m.contact===name&&m.role==='user')&&s.messages.some(m=>m.contact===name&&m.role==='assistant'));return {exchanges,missing:Object.keys(c.contacts).filter(x=>!exchanges.includes(x)),hasRecord:!!s.finalRecord.trim(),hasUpdate:c.id==='incident'||s.caseChanged};}
function finish(c,s){const x=checks(c,s);if(x.missing.length||!x.hasRecord||!x.hasUpdate)return {ok:false,...x};s.completionStatus='complete';s.completedAt=new Date().toISOString();return {ok:true,...x};}
function packet(c,s){return {...s,missionId:'itm2_live_'+s.mission,portfolioBlock:c.block,workflowCompletion:s.completionStatus==='complete'?100:0,score:0,scoreMeaning:'Recorded participation and closing note only. No automated language or operational competence grade.',logs:s.changes,aiConversation:s.messages,sourceNotes:c.facts,scenarioBasis:c.brief};}
const api={fresh,checks,finish,packet};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StationCore=api;
})(globalThis);
