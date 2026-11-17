/* Device-local best-effort Faculty Fund notification cursors. Only feed this
 * confirmed server snapshots from the currently confirmed team workspace. */
(function(global){
 'use strict';
 const memory=new Map();
 function processFacultyNotifications(snapshot,state,config,io){
  if(!snapshot||!state?.uid||!state.orgId||!state.role||!state.memberConfirmed||!Array.isArray(snapshot.remittances)||typeof io?.push!=='function')return;
  const key='ft_faculty_notif_v1:'+encodeURIComponent(state.uid)+':'+encodeURIComponent(state.orgId);
  let seen=memory.get(key);if(!seen){try{const raw=JSON.parse(io.storage.getItem(key)||'null');if(Array.isArray(raw))seen=new Set(raw.filter(x=>typeof x==='string'))}catch(e){}if(!seen)seen=new Set();}
  const next=new Set(seen);
  function deliver(event,title,actorUid){
   if(seen.has(event))return true;
   const result=io.push({type:'team',title,body:'Open the Faculty Fund in this workspace to review.',actorUid,recipientUid:state.uid,orgId:state.orgId,action:{tab:'funds',facultyFund:true}});
   if(result)next.add(event);return !!result;
  }
  for(const r of snapshot.remittances){
   if(!r||typeof r.id!=='string'||!r.id)continue;
   const pending='pending:'+r.id;
   if(r.status==='pending'){
    if(r.presidentUid===state.uid&&r.submittedByUid!==state.uid)deliver(pending,'Faculty Fund remittance awaiting acceptance',r.submittedByUid);
    else next.add(pending);
   }
   if(r.status==='accepted'||r.status==='declined'){
    const stamp=r.status==='accepted'?r.acceptedAt:r.declinedAt;
    const event=r.status+':'+r.id+':'+(stamp||'');
    const actor=r.status==='accepted'?r.acceptedByUid:r.declinedByUid;
    if(seen.has(pending)&&r.submittedByUid===state.uid&&actor!==state.uid)deliver(event,r.status==='accepted'?'Faculty Fund remittance accepted':'Faculty Fund remittance declined',actor);
    else next.add(event); // First snapshot never replays old decisions.
   }
   if(r.status==='accepted'&&r.voidRequest?.requestedAt){
    const event='correction:'+r.id+':'+r.voidRequest.requestedAt;
    if(config?.presidentUid===state.uid&&r.voidRequest.requestedByUid!==state.uid)deliver(event,'Faculty Fund correction awaiting review',r.voidRequest.requestedByUid);
    else next.add(event);
   }
  }
  const bounded=[...next].slice(-5000);memory.set(key,new Set(bounded));try{io.storage.setItem(key,JSON.stringify(bounded))}catch(e){/* session memory still avoids repeats */}
 }
 if(typeof module==='object'&&module.exports)module.exports={processFacultyNotifications};
 else global.processFacultyNotifications=processFacultyNotifications;
})(typeof window!=='undefined'?window:globalThis);
