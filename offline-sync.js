// Plans a one-way, explicit record merge from the separate offline tracker.
// It never deletes destination records or changes organization settings.
(function(root){
 'use strict';
 const fields=['funds','txs','sigs','projects','allocations','payables','auditLog','contributionActivities','contributors','contributionPayments','otherPayments'];
 const key=(field,id)=>JSON.stringify([field,id]);
 function stable(value){return JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),Object.create(null)):v)}
 function inspect(snapshot){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||!snapshot.org||typeof snapshot.org!=='object'||Array.isArray(snapshot.org))throw Error('Invalid tracker snapshot.');
  for(const field of fields){
   if(field==='otherPayments'&&snapshot[field]===undefined)continue;
   if(!Array.isArray(snapshot[field]))throw Error('Invalid '+field+' list.');const seen=new Set();
   for(const record of snapshot[field]){if(!record||typeof record!=='object'||Array.isArray(record)||typeof record.id!=='string'||!record.id.trim()||seen.has(record.id))throw Error('Invalid or duplicate ID in '+field+'.');seen.add(record.id);}
  }
 }
 function plan(target,source,choices={}){
  inspect(target);inspect(source);const merged={...target},changes=[],conflicts=[];let unchanged=0;
  for(const field of fields){
   const current=new Map((target[field]||[]).map(x=>[x.id,x]));merged[field]=(target[field]||[]).slice();const position=new Map(merged[field].map((x,i)=>[x.id,i]));
   for(const incoming of (source[field]||[])){
    const previous=current.get(incoming.id),id=key(field,incoming.id);
    if(!previous){merged[field].push(incoming);changes.push({kind:'add',field,id:incoming.id,offline:incoming});continue;}
    if(stable(previous)===stable(incoming)){unchanged++;continue;}
    const choice=choices[id];const conflict={field,id:incoming.id,key:id,destination:previous,offline:incoming,choice:choice==='offline'||choice==='destination'?choice:null};conflicts.push(conflict);
    if(choice==='offline'){merged[field][position.get(incoming.id)]=incoming;changes.push({kind:'replace',field,id:incoming.id,destination:previous,offline:incoming});}
   }
  }
  return {merged,changes,conflicts,unchanged,unresolved:conflicts.filter(c=>!c.choice).length};
 }
 const api={fields,key,plan};root.PondoOfflineSync=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
