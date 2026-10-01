/* Shared anonymous inference transport. No credentials, fabricated replies or paid-tier fallback. */
(function(root){
 'use strict';
 const base='https://api.llm7.io/v1';let catalog=null,tail=Promise.resolve();
 async function request(path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const res=await fetch(base+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
   const data=await res.json();
   if(!res.ok){const err=new Error(res.status===429?'AI is busy. Please retry shortly.':res.status===401||res.status===403?'The provider is not allowing anonymous AI access.':`AI provider unavailable (${res.status}).`);err.status=res.status;err.code=data.error?.code;err.retry=Math.min(15,Math.max(2,Number(res.headers.get('Retry-After')||data.error?.retry_after)||10));throw err;}
   return data;
  }catch(e){if(e.name==='AbortError')throw new Error('AI did not respond within 30 seconds. Please retry.');if(e instanceof TypeError)throw new Error('Cannot connect to AI. Check your connection and retry.');throw e;}finally{clearTimeout(timer);}
 }
 async function models(){
  if(catalog&&Date.now()-catalog.time<300000)return catalog.ids;
  const data=await request('/models');
  const available=(data.data||[]).filter(m=>m.model_type==='chat'&&m.usage_based_only===false&&['free','turbo'].includes(m.tier));
  const preferred=['codestral-latest','mistral-Nemo-Instruct-2407','GLM-5.3-Flash'];
  available.sort((a,b)=>(preferred.includes(a.id)?preferred.indexOf(a.id):99)-(preferred.includes(b.id)?preferred.indexOf(b.id):99));
  if(!available.length)throw new Error('No anonymous chat model is currently available. Please retry later.');
  catalog={time:Date.now(),ids:available.map(m=>m.id)};return catalog.ids;
 }
 async function run({system,messages,onStatus=()=>{},dialogueMode,validateResponse}){
  onStatus('Checking available AI models…');const ids=await models();let last;
  for(const model of ids.slice(0,3)){
   for(let attempt=0;attempt<2;attempt++){
    try{
     onStatus(`AI is responding · ${model}…`);
     const data=await request('/chat/completions',{model,messages:[{role:'system',content:system+'\n'+(dialogueMode==='simulation'?'Stay in the assigned operational role. Never provide tutoring, language correction, translation or writing review.':(root.MaritimeDialoguePolicy||''))},...messages.slice(-24).map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.content).slice(0,10000)}))],max_tokens:1200,temperature:0.5});
     const text=data.choices?.[0]?.message?.content;
     if(typeof text!=='string'||!text.trim())throw new Error('AI returned an empty response. Please retry.');
     const problem=validateResponse?.(text.trim());if(problem){const e=new Error(problem);e.code='invalid_role';throw e;}
     return {text:text.trim(),model:data.model||model};
    }catch(e){last=e;
     if(e.status===429&&attempt===0){onStatus(`AI is busy; retrying in ${e.retry} seconds…`);await new Promise(r=>setTimeout(r,e.retry*1000));continue;}
     if(e.code==='invalid_role'||e.status===400||e.status===404||e.status>=500){catalog=null;break;}
     throw e;
    }
   }
  }
  throw last||new Error('No AI model could respond. Please retry later.');
 }
 function reply(options){const job=tail.then(()=>run(options));tail=job.catch(()=>{});return job;}
 root.MaritimeAI={reply};
})(globalThis);
