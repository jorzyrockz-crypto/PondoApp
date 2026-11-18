/* Experimental server-verified copy capture for the Faculty Fund.
 * NOT connected to the app. Copies alone are NOT a complete backup or restore.
 * Requires matching rules that compare every immutable copy to its source and
 * pin all copies to a protected revision. Administrators bypass those rules. */
(function(global){
 'use strict';
 const paths={people:'sparkDiscoveryPeople',payments:'sparkDiscoveryPayments',slots:'sparkDiscoveryPaymentSlots',remittances:'sparkDiscoveryRemittances',lines:'sparkDiscoveryLines',wallets:'sparkDiscoveryWallets',expenses:'sparkDiscoveryExpenseDrafts',allocations:'sparkDiscoveryAllocations',corrections:'sparkDiscoveryCorrections',presidentHistory:'sparkDiscoveryPresidentHistory',memberReceipts:'sparkDiscoveryMemberReceipts',remittanceReceipts:'sparkDiscoveryRemittanceReceipts'};
 const fail=m=>{throw Error(m)};
 function stable(v,depth=0){
  if(depth>50)fail('Unsupported capture value');
  if(v===null||typeof v==='string'||typeof v==='boolean')return 'scalar:'+JSON.stringify(v);
  if(typeof v==='number'&&Number.isFinite(v))return 'scalar:'+JSON.stringify(v);
  if(v&&typeof v.toMillis==='function'&&Number.isSafeInteger(v.seconds)&&Number.isInteger(v.nanoseconds)&&v.nanoseconds>=0&&v.nanoseconds<1000000000)return 'timestamp:'+v.seconds+':'+v.nanoseconds;
  if(Array.isArray(v))return 'array:'+JSON.stringify(v.map(x=>stable(x,depth+1)));
  if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail('Unsupported capture value');
  return 'object:'+JSON.stringify(Object.keys(v).sort().map(k=>[k,stable(v[k],depth+1)]));
 }
 function plan(snapshot){
  if(!snapshot||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||!snapshot.records||!snapshot.projection)fail('A reconciled Faculty Fund snapshot is required');
  if(Object.keys(snapshot.records).sort().join(',')!==Object.keys(paths).sort().join(','))fail('Incomplete Faculty Fund collections');
  const result=[];
  for(const [name,kind] of Object.entries(paths)){
   const items=snapshot.records[name];if(!Array.isArray(items)||items.length>1000)fail('Faculty Fund exceeds the safe capture limit');const ids=new Set();
   for(const item of items){const id=item?.id;if(typeof id!=='string'||!id||id.includes('/')||id==='.'||id==='..'||new TextEncoder().encode(id).length>1500||ids.has(id))fail('Invalid Faculty Fund record ID');ids.add(id);result.push({kind,id});}
  }
  if(snapshot.config)result.push({kind:'sparkDiscoveryConfig',id:'current'});
  if(result.length>1000||new TextEncoder().encode(JSON.stringify(result)).length>500000)fail('Faculty Fund exceeds the experimental capture limit');
  return result;
 }
 function createCapture({db,api,getContext,makeReader}){
  if(!db||!api||typeof getContext!=='function'||typeof makeReader!=='function'||['doc','runTransaction','serverTimestamp','getDocFromServer'].some(x=>typeof api[x]!=='function'))fail('Faculty Fund capture is unavailable');
  async function capture({orgId,backupId}={}){
   const c=getContext();if(!c||c.memberConfirmed!==true||c.role!=='owner'||!c.uid||!c.orgId||c.orgId!==orgId||c.orgId.includes('/')||typeof c.scopeToken!=='number'&&typeof c.scopeToken!=='string')fail('A confirmed workspace owner is required');
   if(typeof backupId!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(backupId))fail('Invalid backup ID');
   const current=()=>{const n=getContext();return !!n&&n.memberConfirmed===true&&n.role==='owner'&&n.uid===c.uid&&n.orgId===c.orgId&&n.scopeToken===c.scopeToken;};
   const guard=()=>{if(!current())fail('Workspace changed while capturing Faculty Fund');};guard();
   const snapshot=await makeReader(c,current).read();guard();const entries=plan(snapshot),manifest=entries.map(x=>x.kind+'/'+x.id).sort(),root=`organizations/${orgId}`,doc=p=>api.doc(db,`${root}/${p}`),version=doc('sparkDiscoveryRevision/current'),header=doc('sparkVerifiedBackups/'+backupId);
   await api.runTransaction(db,async tx=>{const [v,h]=await Promise.all([tx.get(version),tx.get(header)]);guard();if(!v.exists()||v.data().revision!==snapshot.revision)fail('Faculty Fund changed during capture');if(h.exists()){const x=h.data();if(x.revision!==snapshot.revision||x.createdBy!==c.uid||stable(x.manifest)!==stable(manifest))fail('Backup ID belongs to another capture');}else tx.set(header,{revision:snapshot.revision,createdBy:c.uid,createdAt:api.serverTimestamp(),manifest});});guard();
   for(const {kind,id} of entries){
    const source=doc(kind+'/'+id),copy=doc('sparkVerifiedBackups/'+backupId+'/collections/'+kind+'/entries/'+id);
    await api.runTransaction(db,async tx=>{const [v,s,x]=await Promise.all([tx.get(version),tx.get(source),tx.get(copy)]);guard();if(!v.exists()||v.data().revision!==snapshot.revision)fail('Faculty Fund changed during capture');if(!s.exists())fail('Faculty Fund record disappeared during capture');if(x.exists()){if(stable(x.data())!==stable(s.data()))fail('Existing capture does not match the original');}else{stable(s.data());tx.set(copy,s.data());}});guard();
   }
   const end=await api.getDocFromServer(version);guard();if(!end.metadata||end.metadata.fromCache||end.metadata.hasPendingWrites||!end.exists()||end.data().revision!==snapshot.revision)fail('Faculty Fund changed during capture');
   // There is intentionally no seal or restore here. Rules cannot infer that
   // all source documents were copied, and privileged writes bypass revision.
   return {backupId,revision:snapshot.revision,count:entries.length,status:'copies-created-not-restorable'};
  }
  return {capture};
 }
 if(typeof module==='object'&&module.exports)module.exports={createFacultySparkCapture:createCapture,planFacultySparkCapture:plan,canonicalFacultySparkCapture:stable};else {global.createFacultySparkCapture=createCapture;global.planFacultySparkCapture=plan;global.canonicalFacultySparkCapture=stable;}
})(typeof window!=='undefined'?window:globalThis);
