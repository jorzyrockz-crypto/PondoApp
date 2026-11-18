/* Isolated experimental Spark restore coordinator. NOT wired to the app or
 * production rules. Assumes matching server-enforced immutable copies and a
 * write lock; local JSON alone cannot authorize a historical acceptance. */
(function(global){
 'use strict';
 const collections={sparkDiscoveryPeople:'people',sparkDiscoveryPayments:'payments',sparkDiscoveryPaymentSlots:'slots',sparkDiscoveryRemittances:'remittances',sparkDiscoveryLines:'lines',sparkDiscoveryWallets:'wallets',sparkDiscoveryExpenseDrafts:'expenses',sparkDiscoveryAllocations:'allocations',sparkDiscoveryCorrections:'corrections',sparkDiscoveryPresidentHistory:'presidentHistory',sparkDiscoveryMemberReceipts:'memberReceipts',sparkDiscoveryRemittanceReceipts:'remittanceReceipts'};
 const fail=m=>{throw Error(m)};
 function createRestore({db,api,getContext,makeReader,project,plan,canonical}){
  if(!db||!api||[getContext,makeReader,project,plan,canonical].some(x=>typeof x!=='function')||['doc','getDocFromServer','runTransaction','serverTimestamp','collection','query','limit','getDocsFromServer'].some(x=>typeof api[x]!=='function'))fail('Faculty Fund restore is unavailable');
  async function restore({orgId,backupId,sessionId,expected}={}){
   const c=getContext(),validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(x);
   if(!c||c.memberConfirmed!==true||c.role!=='owner'||!c.uid||c.orgId!==orgId||typeof orgId!=='string'||!orgId||orgId.includes('/')||!['number','string'].includes(typeof c.scopeToken))fail('A confirmed workspace owner is required');
   if(!validId(backupId)||!validId(sessionId))fail('Invalid restore ID');
   const same=()=>{const n=getContext();return !!n&&n.memberConfirmed===true&&n.uid===c.uid&&n.orgId===c.orgId&&n.role==='owner'&&n.scopeToken===c.scopeToken;};
   const guard=()=>{if(!same())fail('Workspace changed during Faculty Fund restore');};
   const doc=p=>api.doc(db,`organizations/${orgId}/${p}`),version=doc('sparkDiscoveryRevision/current'),header=doc('sparkVerifiedBackups/'+backupId),lock=doc('sparkRestoreProof/current'),session=doc('sparkRestoreProofSessions/'+sessionId);
   const server=async ref=>{const s=await api.getDocFromServer(ref);guard();if(!s.metadata||s.metadata.fromCache||s.metadata.hasPendingWrites)fail('Restore data is not server-confirmed');return s;};
   guard();const prior=await server(session);if(prior.exists()){const p=prior.data();if(p.backupId!==backupId||p.createdBy!==c.uid)fail('Restore session belongs to another request');if(p.state==='completed')return {status:'experiment-already-restored',revision:p.revision};if(p.state!=='active')fail('Restore session is invalid');}const h=await server(header);if(!h.exists())fail('Backup is unavailable');const meta=h.data(),manifest=meta.manifest;
   if(!Number.isSafeInteger(meta.revision)||meta.revision<1||meta.revision>Number.MAX_SAFE_INTEGER-2||!Array.isArray(manifest)||manifest.length>1000||new Set(manifest).size!==manifest.length||manifest.some(x=>typeof x!=='string'))fail('Backup manifest is invalid');
   if(expected&&(!Array.isArray(expected.manifest)||expected.revision!==meta.revision||canonical([...expected.manifest].sort())!==canonical([...manifest].sort())))fail('Backup file does not match the server recovery point');
   const expectedCopies=new Map();if(expected){if(typeof expected.encode!=='function'||!expected.payload?.records)fail('Backup file cannot be verified');for(const [kind,name] of Object.entries(collections))for(const row of expected.payload.records[name]||[]){const {id,...value}=row;expectedCopies.set(kind+'/'+id,value);}if(expected.payload.config)expectedCopies.set('sparkDiscoveryConfig/current',expected.payload.config);}
   const entries=manifest.map(key=>{const parts=key.split('/');if(parts.length!==2||!parts[1]||(parts[0]!=='sparkDiscoveryConfig'&&!Object.hasOwn(collections,parts[0]))||parts[0]==='sparkDiscoveryConfig'&&parts[1]!=='current')fail('Backup manifest is invalid');return {kind:parts[0],id:parts[1]};});
   const records=Object.fromEntries(Object.values(collections).map(x=>[x,[]])),copies=new Map();let config=null;
   const existingLock=await server(lock);if(existingLock.exists()){const x=existingLock.data();if(x.backupId!==backupId||x.sessionId!==sessionId||x.createdBy!==c.uid||x.revision!==meta.revision+1)fail('Another restore is already in progress');}const expectedRevision=meta.revision+(existingLock.exists()?1:0);
   const firstVersion=await server(version);if(!firstVersion.exists()||firstVersion.data().revision!==expectedRevision)fail('Backup is stale; no restore started');
   // Refuse to take a lock until every immutable source-backed copy is present
   // and the copied ledger can be reconciled. Incomplete capture stays inert.
   for(const {kind,id} of entries){const copy=await server(doc(`sparkVerifiedBackups/${backupId}/collections/${kind}/entries/${id}`));if(!copy.exists())fail('Backup is incomplete; no restore started');const data=copy.data();if(!data||typeof data!=='object'||kind!=='sparkDiscoveryConfig'&&Object.hasOwn(data,'id'))fail('Backup record shape is invalid');canonical(data);if(expected&&(!expectedCopies.has(kind+'/'+id)||canonical(expected.encode(data))!==canonical(expectedCopies.get(kind+'/'+id))))fail('Backup file does not match the server recovery point');copies.set(kind+'/'+id,data);if(kind==='sparkDiscoveryConfig')config=data;else records[collections[kind]].push({...data,id});}
   if(config){const a=records.presidentHistory.find(x=>x.id===config.assignmentId),millis=x=>typeof x?.toMillis==='function'?x.toMillis():NaN;if(!a||a.presidentUid!==config.presidentUid||a.assignedBy!==config.assignedBy||!Number.isFinite(millis(config.assignedAt))||millis(config.assignedAt)!==millis(a.assignedAt))fail('Backup President assignment is inconsistent');}else if(records.presidentHistory.length)fail('Backup President assignment is missing');
   const projection=project({confirmed:true,...records}),proposed={revision:meta.revision,records,config,projection};
   if(canonical(plan(proposed).map(x=>x.kind+'/'+x.id).sort())!==canonical([...manifest].sort()))fail('Backup manifest is inconsistent');
   // Compare all currently existing records before taking the lock, so a
   // conflict or unlisted extra cannot strand the workspace in recovery.
   if(!existingLock.exists()){
    for(const kind of Object.keys(collections)){
     const qs=await api.getDocsFromServer(api.query(api.collection(db,`organizations/${orgId}/${kind}`),api.limit(1001)));guard();
     if(!qs.metadata||qs.metadata.fromCache||qs.metadata.hasPendingWrites||!Array.isArray(qs.docs)||qs.docs.length>1000)fail('Live records cannot be safely checked');
     for(const item of qs.docs){if(!item.metadata||item.metadata.fromCache||item.metadata.hasPendingWrites)fail('Live records cannot be safely checked');const key=kind+'/'+item.id;if(!copies.has(key)||canonical(item.data())!==canonical(copies.get(key)))fail('Live record differs from backup; no restore started');}
    }
    const liveConfig=await server(doc('sparkDiscoveryConfig/current'));if(liveConfig.exists()&&(!copies.has('sparkDiscoveryConfig/current')||canonical(liveConfig.data())!==canonical(copies.get('sparkDiscoveryConfig/current'))))fail('Live record differs from backup; no restore started');
   }else{
    // The first attempt checked the full inventory before locking. On resume,
    // rules deny collection listings; individually check each saved path.
    for(const {kind,id} of entries){const live=await server(doc(`${kind}/${id}`));if(live.exists()&&canonical(live.data())!==canonical(copies.get(kind+'/'+id)))fail('Live record differs from backup; no record was overwritten');}
   }
   const lastVersion=await server(version);if(!lastVersion.exists()||lastVersion.data().revision!==expectedRevision)fail('Backup is stale; no restore started');
   await api.runTransaction(db,async tx=>{const [v,l,s]=await Promise.all([tx.get(version),tx.get(lock),tx.get(session)]);guard();if(!v.exists())fail('Backup is stale; no restore started');if(l.exists()){const x=l.data();if(x.backupId!==backupId||x.sessionId!==sessionId||x.revision!==meta.revision+1||v.data().revision!==x.revision||x.createdBy!==c.uid||!s.exists()||s.data().state!=='active')fail('Another restore is already in progress');}else{if(v.data().revision!==meta.revision)fail('Backup is stale; no restore started');if(s.exists())fail('Restore session cannot be reused');tx.update(version,{revision:meta.revision+1,updatedBy:c.uid,updatedAt:api.serverTimestamp()});tx.set(session,{backupId,revision:meta.revision+1,createdBy:c.uid,state:'active'});tx.set(lock,{backupId,sessionId,revision:meta.revision+1,remaining:manifest.length,manifest,createdBy:c.uid,lastKind:null,lastId:null});}});guard();
   for(const {kind,id} of entries){
    const original=doc(`${kind}/${id}`),receipt=doc(`sparkRestoreProof/current/sessions/${sessionId}/collections/${kind}/entries/${id}`);
    const saved=copies.get(kind+'/'+id),existing=await server(original);if(existing.exists()&&canonical(existing.data())!==canonical(saved))fail('Live record differs from backup; no record was overwritten');
    // The rules verify the target against the immutable copy and current lock
    // again atomically. Avoid redundant transaction reads: real rules may have
    // dependent document reads of their own, subject to Firestore limits.
    await api.runTransaction(db,async tx=>{const [l,r]=await Promise.all([tx.get(lock),tx.get(receipt)]);guard();if(!l.exists()||l.data().revision!==meta.revision+1||l.data().sessionId!==sessionId||l.data().backupId!==backupId)fail('Restore lock or revision changed');if(r.exists()){if(!existing.exists()||r.data().done!==true)fail('Restore receipt is inconsistent');return;}if(!Number.isSafeInteger(l.data().remaining)||l.data().remaining<1)fail('Restore counter is invalid');if(!existing.exists())tx.set(original,saved);tx.set(receipt,{done:true});tx.update(lock,{remaining:l.data().remaining-1,lastKind:kind,lastId:id});});guard();
   }
   // Re-read every restored record individually and reconcile while locked.
   // Other clients need not be allowed to list a partially restored ledger.
   const restoredRecords=Object.fromEntries(Object.values(collections).map(x=>[x,[]]));let restoredConfig=null;
   for(const {kind,id} of entries){const item=await server(doc(`${kind}/${id}`));if(!item.exists()||canonical(item.data())!==canonical(copies.get(kind+'/'+id)))fail('Restored ledger does not match the backup');if(kind==='sparkDiscoveryConfig')restoredConfig=item.data();else restoredRecords[collections[kind]].push({...item.data(),id});}
   if(restoredConfig){const a=restoredRecords.presidentHistory.find(x=>x.id===restoredConfig.assignmentId),ms=x=>typeof x?.toMillis==='function'?x.toMillis():NaN;if(!a||a.presidentUid!==restoredConfig.presidentUid||a.assignedBy!==restoredConfig.assignedBy||!Number.isFinite(ms(restoredConfig.assignedAt))||ms(restoredConfig.assignedAt)!==ms(a.assignedAt))fail('Restored President assignment is inconsistent');}else if(restoredRecords.presidentHistory.length)fail('Restored President assignment is missing');
   const restoredProjection=project({confirmed:true,...restoredRecords}),restored={revision:meta.revision+1,records:restoredRecords,config:restoredConfig,projection:restoredProjection};
   if(canonical(plan(restored).map(x=>x.kind+'/'+x.id).sort())!==canonical([...manifest].sort()))fail('Restored ledger does not match the backup');
   await api.runTransaction(db,async tx=>{const [v,l,s]=await Promise.all([tx.get(version),tx.get(lock),tx.get(session)]);guard();if(!v.exists()||v.data().revision!==meta.revision+1||!l.exists()||l.data().sessionId!==sessionId||l.data().backupId!==backupId||l.data().remaining!==0||!s.exists()||s.data().state!=='active')fail('Restore cannot be completed safely');tx.update(session,{state:'completed'});tx.update(version,{revision:meta.revision+2,updatedBy:c.uid,updatedAt:api.serverTimestamp()});tx.delete(lock);});guard();
   return {status:'experiment-restored',count:manifest.length,revision:meta.revision+2};
  }
  return {restore};
 }
 if(typeof module==='object'&&module.exports)module.exports={createFacultySparkRestore:createRestore};else global.createFacultySparkRestore=createRestore;
})(typeof window!=='undefined'?window:globalThis);
