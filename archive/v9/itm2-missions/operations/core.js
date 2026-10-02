(function(root){
'use strict';
function fresh(id){return {version:2,mission:id,stage:0,answers:{},read:{},done:[],attempts:[],messages:[],log:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),completionStatus:'partial'};}
function available(m,s){return m.documents.filter(d=>d.available<=s.stage);}
function validate(m,s){const stage=m.stages[s.stage],a=s.answers[stage.id]||{},errors=[];
 for(const id of stage.docs)if(!s.read[id])errors.push({id:'doc-'+id,message:'Open and examine '+m.documents.find(d=>d.id===id).title+'.'});
 for(const f of stage.fields){const v=String(a[f.id]||'').trim();if(!v){errors.push({id:f.id,message:f.label+': a response is required.'});continue;}
  if(f.expected&&v!==f.expected)errors.push({id:f.id,message:f.label+': this does not match the released evidence. Recheck the source and revise your selection.'});
  if(f.type==='text'&&v.length<f.min)errors.push({id:f.id,message:f.label+': develop this response with the requested details (at least '+f.min+' characters). This checks completeness, not language quality.'});
 }
 return errors;
}
function commit(m,s){const errors=validate(m,s),stage=m.stages[s.stage];s.attempts.push({stage:stage.id,time:new Date().toISOString(),answers:JSON.parse(JSON.stringify(s.answers[stage.id]||{})),errors:errors.map(e=>e.id)});
 if(errors.length)return {ok:false,errors};if(!s.done.includes(stage.id))s.done.push(stage.id);s.log.push({stage:stage.id,time:new Date().toISOString(),text:stage.consequence,recipient:stage.delivery});s.updatedAt=new Date().toISOString();s.completionStatus=s.done.length===m.stages.length?'complete':'partial';return {ok:true,errors:[]};}
function edit(m,s,field,value){const stage=m.stages[s.stage];s.answers[stage.id]=s.answers[stage.id]||{};s.answers[stage.id][field]=value;
 if(s.done.includes(stage.id)){s.done=s.done.filter(id=>m.stages.findIndex(x=>x.id===id)<s.stage);s.completionStatus='partial';s.log.push({stage:stage.id,time:new Date().toISOString(),text:'Earlier response revised. Subsequent phases require revalidation; existing drafts are retained.'});}
}
function packet(m,s){return {mission:m.id,missionId:'itm2_live_'+m.id,version:s.version,completionStatus:s.completionStatus,workflowCompletion:Math.round(s.done.length/m.stages.length*100),score:0,scoreMeaning:'No automated language or competence score. Workflow validation is separate.',logs:s.log,answers:s.answers,sourceReads:s.read,attempts:s.attempts,aiConversation:s.messages,rejectedAI:s.rejectedAI||[],stagesCompleted:s.done,sourceNotes:m.sourceNotes,scenarioBasis:m.basis,createdAt:s.createdAt,updatedAt:s.updatedAt,completedAt:s.completionStatus==='complete'?s.updatedAt:null};}
const api={fresh,available,validate,commit,edit,packet};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OperationsCore=api;
})(globalThis);
