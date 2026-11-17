'use strict';
// Experimental Firebase Spark client. NOT enabled or loaded by the app.
// Only the isolated emulator fixture supports these paths; production rules
// must not enable them until the complete workflow has been reviewed.
// Rules are the authority: local checks provide readable errors and retries.
function createIntegratedClient({db,api,orgId,uid,useRevision=false,trackRemittanceReleases=false}) {
 if(trackRemittanceReleases&&!useRevision)throw Error('Recovery discovery requires versioned rules');
 const {doc,runTransaction,serverTimestamp}=api;
 if(!db||!orgId||!uid||orgId.includes('/'))throw Error('Missing workspace or actor');
 // The discovery fixture uses a fresh namespace; it cannot safely mix with
 // older records that lack a rule-enforced release counter.
 const pathName=name=>trackRemittanceReleases?name.replace(/^spark/,'sparkDiscovery'):name;
 const ref=(name,key)=>doc(db,`organizations/${orgId}/${pathName(name)}/${key}`);
 const fail=message=>{throw Error(message)};
 const identifier=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))fail('Invalid operation ID');return v};
 const amount=v=>{if(!Number.isSafeInteger(v)||v<=0||v>100000000)fail('Invalid amount');return v};
 const text=(v,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail('Invalid text');return v};
 const millis=t=>t instanceof Date?t.getTime():typeof t?.toMillis==='function'?t.toMillis():NaN;
 // Optional versioned experiment. The marker is read before every other read
 // and written in the same transaction; replays do not advance it.
 async function atomic(operation){
  if(!useRevision)return runTransaction(db,operation);
  const marker=ref('sparkRevision','current');
  return runTransaction(db,async tx=>{const s=await tx.get(marker),prior=s.exists()?s.data().revision:0;
   if(!Number.isSafeInteger(prior)||prior<0||prior>=Number.MAX_SAFE_INTEGER)fail('Faculty Fund revision is invalid');
   const result=await operation(tx);if(result?.replayed===false)tx.set(marker,{revision:prior+1,updatedAt:serverTimestamp(),updatedBy:uid});return result;
  });
 }

 function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('Invalid date');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail('Invalid date');return v;}
 async function createPerson(personId,name){
  if(typeof personId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(personId))fail('Invalid faculty ID');text(name,160);name=name.trim();const p=ref('sparkPeople',personId);
  return atomic(async tx=>{const s=await tx.get(p);if(s.exists()){if(s.data().name!==name||s.data().createdBy!==uid)fail('Faculty ID already has different data');return {replayed:true};}tx.set(p,{name,createdBy:uid,createdAt:serverTimestamp()});return {replayed:false};});
 }
 async function assignPresident(presidentUid,assignmentId){
  if(typeof presidentUid!=='string'||!presidentUid||presidentUid.length>128||presidentUid.includes('/'))fail('Invalid President');const c=ref('sparkConfig','current');
  if(!useRevision)return atomic(async tx=>{const s=await tx.get(c);if(s.exists()&&s.data().presidentUid===presidentUid)return {replayed:true};tx.set(c,{presidentUid,assignedBy:uid,assignedAt:serverTimestamp()});return {replayed:false};});
  const h=ref('sparkPresidentHistory',identifier(assignmentId));return atomic(async tx=>{const [config,history]=await Promise.all([tx.get(c),tx.get(h)]);const prior=config.exists()?config.data().presidentUid:null;
   if(history.exists()){const old=history.data();if(old.presidentUid!==presidentUid||old.assignedBy!==uid)fail('Assignment ID already has different data');return {replayed:true,currentlyAssigned:prior===presidentUid};}
   if(prior===presidentUid)return {replayed:true,currentlyAssigned:true};tx.set(h,{presidentUid,previousPresidentUid:prior,assignedBy:uid,assignedAt:serverTimestamp()});tx.set(c,{presidentUid,assignmentId,assignedBy:uid,assignedAt:serverTimestamp()});return {replayed:false,currentlyAssigned:true};
  });
 }
 async function createRemittance(remittanceId,paymentIds){
  identifier(remittanceId);if(!Array.isArray(paymentIds)||!paymentIds.length||paymentIds.length>200||new Set(paymentIds).size!==paymentIds.length)fail('Select distinct payments');paymentIds.forEach(identifier);
  const plan=[...paymentIds],r=ref('sparkRemittances',remittanceId);return atomic(async tx=>{const s=await tx.get(r);if(s.exists()){const old=s.data();if(old.createdBy!==uid||JSON.stringify(old.paymentIds)!==JSON.stringify(plan))fail('Remittance ID already has a different payment plan');return {replayed:true,status:old.status};}tx.set(r,{status:'draft',amountCents:0,count:0,lastPaymentId:null,correctionId:null,paymentIds:plan,createdBy:uid,createdAt:serverTimestamp(),...(trackRemittanceReleases?{linkedCount:0,needsRelease:false,lastReleasedPaymentId:null}:{})});return {replayed:false,status:'draft'};});
 }
 async function addPayment(remittanceId,paymentId){
  identifier(remittanceId);identifier(paymentId);const r=ref('sparkRemittances',remittanceId),p=ref('sparkPayments',paymentId),line=ref('sparkLines',remittanceId+'~'+paymentId);
  return atomic(async tx=>{const [rs,ps,ls]=await Promise.all([tx.get(r),tx.get(p),tx.get(line)]);if(!rs.exists()||!ps.exists())fail('Remittance or payment unavailable');const rem=rs.data(),pay=ps.data();
   if(pay.remittanceId===remittanceId&&ls.exists())return {replayed:true};if(ls.exists()||rem.status!=='draft'||!rem.paymentIds.includes(paymentId)||pay.remittanceId!==null||pay.voidedAt)fail('Payment unavailable for remittance');
   tx.update(p,{remittanceId});tx.set(line,{remittanceId,paymentId,amountCents:pay.amountCents,linkedAt:serverTimestamp(),linkedBy:uid});tx.update(r,{amountCents:rem.amountCents+pay.amountCents,count:rem.count+1,lastPaymentId:paymentId,...(trackRemittanceReleases?{linkedCount:rem.linkedCount+1}:{})});return {replayed:false};});
 }
 async function submitRemittance(remittanceId){
  const r=ref('sparkRemittances',identifier(remittanceId)),c=ref('sparkConfig','current');return atomic(async tx=>{const [rs,cs]=await Promise.all([tx.get(r),tx.get(c)]);if(!rs.exists()||!cs.exists())fail('Remittance or President assignment unavailable');const rem=rs.data();if(rem.status!=='draft')return {replayed:true,status:rem.status};if(!rem.count||rem.count!==rem.paymentIds.length)fail('The remittance is incomplete; resume adding the selected payments');tx.update(r,{status:'pending',presidentUid:cs.data().presidentUid,submittedAt:serverTimestamp()});return {replayed:false,status:'pending'};});
 }
 async function declineRemittance(remittanceId,reason){
  const r=ref('sparkRemittances',identifier(remittanceId));text(reason,500);return atomic(async tx=>{const s=await tx.get(r);if(!s.exists())fail('Remittance unavailable');const rem=s.data();if(rem.status==='declined'&&rem.declinedBy===uid&&rem.reason===reason)return {replayed:true};if(rem.status!=='pending'||rem.presidentUid!==uid)fail('Remittance cannot be declined');tx.update(r,{status:'declined',declinedBy:uid,declinedAt:serverTimestamp(),reason,...(trackRemittanceReleases?{needsRelease:rem.linkedCount>0}:{})});return {replayed:false};});
 }
 async function cancelRemittance(remittanceId,reason){
  const r=ref('sparkRemittances',identifier(remittanceId));text(reason,500);return atomic(async tx=>{const s=await tx.get(r);if(!s.exists())fail('Remittance unavailable');const rem=s.data();if(rem.status==='cancelled'&&rem.cancelledBy===uid&&rem.reason===reason)return {replayed:true};if(!['draft','pending'].includes(rem.status))fail('Remittance cannot be cancelled');tx.update(r,{status:'cancelled',cancelledBy:uid,cancelledAt:serverTimestamp(),reason,...(trackRemittanceReleases?{needsRelease:rem.linkedCount>0}:{})});return {replayed:false};});
 }
 async function releasePayment(remittanceId,paymentId){
  identifier(remittanceId);identifier(paymentId);const r=ref('sparkRemittances',remittanceId),p=ref('sparkPayments',paymentId),line=ref('sparkLines',remittanceId+'~'+paymentId);
  return atomic(async tx=>{const [rs,ps,ls]=await Promise.all([tx.get(r),tx.get(p),tx.get(line)]);if(!rs.exists()||!ps.exists()||!ls.exists()||!['declined','cancelled','voided'].includes(rs.data().status))fail('Payment cannot be released');const pay=ps.data();if(pay.remittanceId===null)return {replayed:true};if(pay.remittanceId!==remittanceId)fail('Payment belongs to another remittance');if(trackRemittanceReleases){const rem=rs.data();if(!Number.isSafeInteger(rem.linkedCount)||rem.linkedCount<1||rem.needsRelease!==true)fail('Remittance release count is inconsistent');tx.update(r,{linkedCount:rem.linkedCount-1,needsRelease:rem.linkedCount>1,lastReleasedPaymentId:paymentId});}tx.update(p,{remittanceId:null});return {replayed:false};});
 }
 async function requestCorrection(correctionId,remittanceId,reason){
  identifier(correctionId);identifier(remittanceId);text(reason,500);const c=ref('sparkCorrections',correctionId),r=ref('sparkRemittances',remittanceId);
  return atomic(async tx=>{const [cs,rs]=await Promise.all([tx.get(c),tx.get(r)]);if(cs.exists()){const old=cs.data();if(old.remittanceId!==remittanceId||old.requestedBy!==uid||old.reason!==reason)fail('Correction ID already has different data');return {replayed:true,status:old.status};}if(!rs.exists()||rs.data().status!=='accepted'||rs.data().correctionId!==null)fail('Remittance cannot be corrected');tx.set(c,{remittanceId,status:'pending',requestedBy:uid,requestedAt:serverTimestamp(),reason});tx.update(r,{correctionId});return {replayed:false,status:'pending'};});
 }
 async function decideCorrection(correctionId,decision,reason=''){
  identifier(correctionId);if(!['approved','declined'].includes(decision))fail('Invalid correction decision');if(decision==='declined')text(reason,500);const c=ref('sparkCorrections',correctionId);
  return atomic(async tx=>{const cs=await tx.get(c);if(!cs.exists())fail('Correction unavailable');const old=cs.data();if(old.status===decision&&old.decidedBy===uid&&(decision!=='declined'||old.decisionReason===reason))return {replayed:true};if(old.status!=='pending')fail('Correction already decided');const r=ref('sparkRemittances',identifier(old.remittanceId)),w=ref('sparkWallets',old.remittanceId),[rs,ws]=await Promise.all([tx.get(r),tx.get(w)]);if(!rs.exists()||!ws.exists()||rs.data().correctionId!==correctionId)fail('Correction no longer pending');
   if(decision==='declined'){tx.update(c,{status:decision,decidedBy:uid,decidedAt:serverTimestamp(),decisionReason:reason});tx.update(r,{correctionId:null});}
   else{const wallet=ws.data();if(wallet.status!=='open'||wallet.unspentCents!==wallet.amountCents)fail('Reverse dependent expenses before approving this correction');tx.update(c,{status:decision,decidedBy:uid,decidedAt:serverTimestamp()});tx.update(r,{status:'voided',voidedBy:uid,voidedAt:serverTimestamp(),...(trackRemittanceReleases?{needsRelease:rs.data().linkedCount>0}:{})});tx.update(w,{status:'voided'});}
   return {replayed:false};});
 }
 async function confirmPrint(kind,id,remittanceId){
  if(!['member','remittance'].includes(kind))fail('Invalid receipt kind');identifier(id);if(kind==='member')identifier(remittanceId);const target=ref(kind==='member'?'sparkMemberReceipts':'sparkRemittanceReceipts',kind==='member'?remittanceId+'~'+id:id);
  return atomic(async tx=>{const s=await tx.get(target);if(s.exists())return {replayed:true};tx.set(target,{...(kind==='member'?{paymentId:id,remittanceId}:{}),printedAt:serverTimestamp(),printedBy:uid});return {replayed:false};});
 }
 async function createPayment(paymentId,{personId,absenceDate,paymentDate,amountCents}){
  identifier(paymentId);if(typeof personId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(personId))fail('Invalid faculty member');date(absenceDate);date(paymentDate);amount(amountCents);
  const slotId=personId+'~'+absenceDate,p=ref('sparkPayments',paymentId),s=ref('sparkPaymentSlots',slotId),person=ref('sparkPeople',personId);
  return atomic(async tx=>{const [ps,ss,ms]=await Promise.all([tx.get(p),tx.get(s),tx.get(person)]);if(ps.exists()){const old=ps.data();if(old.slotId!==slotId||old.amountCents!==amountCents||old.paymentDate!==paymentDate||old.createdBy!==uid)fail('Payment ID already has different data');return {replayed:true,voided:!!old.voidedAt};}
   if(!ms.exists())fail('Faculty member not registered');if(ss.exists()&&ss.data().activePaymentId!==null)fail('An active payment already exists for this absence');
   tx.set(p,{slotId,personId,memberName:ms.data().name,absenceDate,paymentDate,amountCents,createdAt:serverTimestamp(),createdBy:uid,remittanceId:null,voidedAt:null,voidedBy:null,voidReason:null});
   if(ss.exists())tx.update(s,{activePaymentId:paymentId,revision:ss.data().revision+1});else tx.set(s,{personId,absenceDate,activePaymentId:paymentId,revision:1});return {replayed:false};
  });
 }
 async function voidPayment(paymentId,reason){identifier(paymentId);text(reason,500);const p=ref('sparkPayments',paymentId);return atomic(async tx=>{const ps=await tx.get(p);if(!ps.exists())fail('Payment missing');const old=ps.data();
  if(old.voidedAt){if(old.voidedBy!==uid||old.voidReason!==reason)fail('Payment already voided for a different reason');return {replayed:true};}
  if(old.remittanceId!==null)fail('Resolve the associated remittance before voiding this payment');const s=ref('sparkPaymentSlots',old.slotId),ss=await tx.get(s);if(!ss.exists()||ss.data().activePaymentId!==paymentId)fail('Payment slot is inconsistent');
  tx.update(p,{voidedAt:serverTimestamp(),voidedBy:uid,voidReason:reason});tx.update(s,{activePaymentId:null,revision:ss.data().revision+1});return {replayed:false};
 });}
 async function accept(remittanceId){
  const r=ref('sparkRemittances',identifier(remittanceId)),w=ref('sparkWallets',remittanceId);
  return atomic(async tx=>{const [rs,ws]=await Promise.all([tx.get(r),tx.get(w)]);if(!rs.exists())fail('Remittance unavailable');const rem=rs.data();
   if(rem.status==='accepted'&&rem.acceptedBy===uid&&ws.exists())return {replayed:true};
   if(rem.status!=='pending'||rem.presidentUid!==uid||ws.exists())fail('Remittance cannot be accepted');
   tx.update(r,{status:'accepted',acceptedBy:uid,acceptedAt:serverTimestamp()});
   tx.set(w,{status:'open',amountCents:rem.amountCents,unspentCents:rem.amountCents,acceptedAt:serverTimestamp(),revision:0,lastAllocation:null,lastRelease:null});return {replayed:false};
  });
 }
 async function createExpense(expenseId,{amountCents,description,payee,reference='',occurredAt}){
  identifier(expenseId);amount(amountCents);text(description,300);text(payee,160);if(typeof reference!=='string'||reference.length>160)fail('Invalid reference');if(!Number.isFinite(millis(occurredAt)))fail('Invalid expense time');const e=ref('sparkExpenseDrafts',expenseId);
  return atomic(async tx=>{const s=await tx.get(e);if(s.exists()){const old=s.data();if(old.amountCents!==amountCents||old.description!==description||old.payee!==payee||old.reference!==reference||millis(old.occurredAt)!==millis(occurredAt)||old.createdBy!==uid)fail('Expense ID already has different data');return {replayed:true,status:old.status};}
   tx.set(e,{status:'draft',amountCents,allocatedCents:0,count:0,lastAllocation:null,lastRelease:null,description,payee,reference,occurredAt,createdAt:serverTimestamp(),createdBy:uid});return {replayed:false,status:'draft'};
  });
 }
 async function allocate(expenseId,walletId,allocationId,amountCents){
  identifier(expenseId);identifier(walletId);identifier(allocationId);amount(amountCents);const e=ref('sparkExpenseDrafts',expenseId),w=ref('sparkWallets',walletId),a=ref('sparkAllocations',allocationId);
  return atomic(async tx=>{const [es,ws,as]=await Promise.all([tx.get(e),tx.get(w),tx.get(a)]);if(as.exists()){const old=as.data();if(old.expenseId!==expenseId||old.walletId!==walletId||old.amountCents!==amountCents||old.recordedBy!==uid)fail('Allocation ID already has different data');return {replayed:true,released:!!old.releasedAt};}
   if(!es.exists()||!ws.exists())fail('Expense or accepted funds are missing');const draft=es.data(),wallet=ws.data();if(draft.status!=='draft'||wallet.status!=='open'||draft.allocatedCents+amountCents>draft.amountCents||wallet.unspentCents<amountCents||millis(draft.occurredAt)<millis(wallet.acceptedAt))fail('Funds unavailable for this expense time or amount');
   tx.set(a,{expenseId,walletId,amountCents,recordedAt:serverTimestamp(),recordedBy:uid,releasedAt:null,releasedBy:null});tx.update(w,{unspentCents:wallet.unspentCents-amountCents,revision:wallet.revision+1,lastAllocation:allocationId});tx.update(e,{allocatedCents:draft.allocatedCents+amountCents,count:draft.count+1,lastAllocation:allocationId});return {replayed:false};
  });
 }
 async function finalizeExpense(expenseId){const e=ref('sparkExpenseDrafts',identifier(expenseId));return atomic(async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const draft=s.data();if(draft.status==='recorded')return {replayed:true};if(draft.status!=='draft'||draft.allocatedCents!==draft.amountCents||draft.count<1)fail('Expense allocations are incomplete');tx.update(e,{status:'recorded',recordedAt:serverTimestamp()});return {replayed:false};});}
 async function cancelExpense(expenseId,reason){const e=ref('sparkExpenseDrafts',identifier(expenseId));text(reason,500);return atomic(async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const draft=s.data();if(['cancelling','cancelled'].includes(draft.status)){if(draft.cancelReason!==reason||draft.cancelRequestedBy!==uid)fail('Expense already cancelled for a different reason');return {replayed:true,status:draft.status};}if(draft.status!=='draft')fail('Only unrecorded expenses can be cancelled');tx.update(e,{status:'cancelling',cancelReason:reason,cancelRequestedBy:uid,cancelRequestedAt:serverTimestamp()});return {replayed:false,status:'cancelling'};});}
 async function release(allocationId){const a=ref('sparkAllocations',identifier(allocationId));return atomic(async tx=>{const as=await tx.get(a);if(!as.exists())fail('Allocation missing');const line=as.data();if(line.releasedAt)return {replayed:true};const e=ref('sparkExpenseDrafts',identifier(line.expenseId)),w=ref('sparkWallets',identifier(line.walletId)),[es,ws]=await Promise.all([tx.get(e),tx.get(w)]);if(!es.exists()||!ws.exists())fail('Expense or funds missing');const draft=es.data(),wallet=ws.data();if(!['cancelling','voiding'].includes(draft.status)||wallet.status!=='open')fail('Allocation cannot be released');tx.update(a,{releasedAt:serverTimestamp(),releasedBy:uid});tx.update(e,{allocatedCents:draft.allocatedCents-line.amountCents,count:draft.count-1,lastRelease:allocationId});tx.update(w,{unspentCents:wallet.unspentCents+line.amountCents,revision:wallet.revision+1,lastRelease:allocationId});return {replayed:false};});}
 async function finishCancellation(expenseId){const e=ref('sparkExpenseDrafts',identifier(expenseId));return atomic(async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const old=s.data();if(old.status==='cancelled')return {replayed:true};if(old.status!=='cancelling'||old.allocatedCents!==0||old.count!==0)fail('Release every allocation before finishing cancellation');tx.update(e,{status:'cancelled',cancelledAt:serverTimestamp()});return {replayed:false};});}
 async function beginVoid(expenseId,reason){const e=ref('sparkExpenseDrafts',identifier(expenseId));text(reason,500);return atomic(async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const old=s.data();if(['voiding','voided'].includes(old.status)){if(old.voidReason!==reason||old.voidRequestedBy!==uid)fail('Expense already voided for a different reason');return {replayed:true,status:old.status};}if(old.status!=='recorded')fail('Only a recorded expense can be voided');tx.update(e,{status:'voiding',voidReason:reason,voidRequestedBy:uid,voidRequestedAt:serverTimestamp()});return {replayed:false,status:'voiding'};});}
 async function finishVoid(expenseId){const e=ref('sparkExpenseDrafts',identifier(expenseId));return atomic(async tx=>{const s=await tx.get(e);if(!s.exists())fail('Expense missing');const old=s.data();if(old.status==='voided')return {replayed:true};if(old.status!=='voiding'||old.allocatedCents!==0||old.count!==0)fail('Release every allocation before finishing the void');tx.update(e,{status:'voided',voidedAt:serverTimestamp()});return {replayed:false};});}
 // A confirmed parent, immutable selection and matching history lines let a
 // caller resume a partially assembled remittance on another device. This is
 // still a recovery view, not a lock: subsequent writes must use transactions.
 async function inspectRemittance(remittanceId){
  identifier(remittanceId);const {collection,query,where,getDocFromServer,getDocsFromServer}=api;
  if(!collection||!query||!where||!getDocFromServer||!getDocsFromServer)fail('Server reads are unavailable');
  const parent=ref('sparkRemittances',remittanceId),lines=collection(db,`organizations/${orgId}/${pathName('sparkLines')}`),clean=s=>{if(s.metadata?.fromCache||s.metadata?.hasPendingWrites)fail('Unconfirmed data; connect and retry');};
  const one=await getDocFromServer(parent);clean(one);if(!one.exists())fail('Remittance missing');const result=await getDocsFromServer(query(lines,where('remittanceId','==',remittanceId)));clean(result);const two=await getDocFromServer(parent);clean(two);if(!two.exists())fail('Remittance changed; reload');
  const before=one.data(),after=two.data(),fingerprint=x=>JSON.stringify([x.status,x.amountCents,x.count,x.lastPaymentId,x.paymentIds,x.correctionId,x.presidentUid]);
  if(fingerprint(before)!==fingerprint(after))fail('Remittance changed during recovery; reload');
  if(!['draft','pending','accepted','declined','cancelled','voided'].includes(after.status)||!Array.isArray(after.paymentIds)||after.paymentIds.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x))||after.paymentIds.length<1||after.paymentIds.length>200||new Set(after.paymentIds).size!==after.paymentIds.length||result.size>200||!Number.isSafeInteger(after.count)||!Number.isSafeInteger(after.amountCents))fail('Remittance recovery data is invalid');
  const seen=new Set();let total=0;for(const snap of result.docs){clean(snap);const row=snap.data();if(row.remittanceId!==remittanceId||typeof row.paymentId!=='string'||!after.paymentIds.includes(row.paymentId)||seen.has(row.paymentId)||snap.id!==remittanceId+'~'+row.paymentId||!Number.isSafeInteger(row.amountCents)||row.amountCents<=0)fail('Remittance history is invalid');seen.add(row.paymentId);total+=row.amountCents;if(!Number.isSafeInteger(total))fail('Remittance total is invalid');}
  if(total!==after.amountCents||seen.size!==after.count||(!['draft','cancelled'].includes(after.status)&&seen.size!==after.paymentIds.length))fail('Remittance history is inconsistent; reload');
  return {status:after.status,amountCents:total,paymentIds:[...after.paymentIds],linkedPaymentIds:after.paymentIds.filter(x=>seen.has(x)),missingPaymentIds:after.paymentIds.filter(x=>!seen.has(x))};
 }
 // Read only from Firestore's server, not an offline or locally pending view.
 // Double-read the monotonic parent around the allocation query. No client may
 // treat an inconsistent view as proof that a multi-step operation completed.
 async function inspectExpense(expenseId){
  identifier(expenseId);const {collection,query,where,getDocFromServer,getDocsFromServer}=api;
  if(!collection||!query||!where||!getDocFromServer||!getDocsFromServer)fail('Server reads are unavailable');
  const parent=ref('sparkExpenseDrafts',expenseId),lines=collection(db,`organizations/${orgId}/${pathName('sparkAllocations')}`);
  const clean=s=>{if(s.metadata?.fromCache||s.metadata?.hasPendingWrites)fail('Unconfirmed data; connect and retry');};
  const one=await getDocFromServer(parent);clean(one);if(!one.exists())fail('Expense missing');
  const result=await getDocsFromServer(query(lines,where('expenseId','==',expenseId)));clean(result);
  const two=await getDocFromServer(parent);clean(two);if(!two.exists())fail('Expense changed; reload');
  const before=one.data(),after=two.data();
  const fingerprint=x=>JSON.stringify([x.status,x.amountCents,x.allocatedCents,x.count,x.lastAllocation,x.lastRelease,x.createdBy]);
  if(fingerprint(before)!==fingerprint(after))fail('Expense changed during recovery; reload');
  if(!['draft','recorded','cancelling','cancelled','voiding','voided'].includes(after.status)||!Number.isSafeInteger(after.amountCents)||after.amountCents<=0||!Number.isSafeInteger(after.allocatedCents)||!Number.isSafeInteger(after.count)||result.size>200)fail('Expense recovery data is invalid');
  const entries=[];let activeAmount=0,activeCount=0;
  for(const snap of result.docs){clean(snap);const row=snap.data();if(row.expenseId!==expenseId||typeof row.walletId!=='string'||!Number.isSafeInteger(row.amountCents)||row.amountCents<=0||!(row.releasedAt===null||typeof row.releasedAt?.toMillis==='function')||(row.releasedAt===null?row.releasedBy!==null:typeof row.releasedBy!=='string'))fail('Expense allocation data is invalid');
   if(row.releasedAt===null){activeAmount+=row.amountCents;activeCount++;if(!Number.isSafeInteger(activeAmount))fail('Expense allocation total is invalid');}
   entries.push({id:snap.id,walletId:row.walletId,amountCents:row.amountCents,released:row.releasedAt!==null});
  }
  if(activeAmount!==after.allocatedCents||activeCount!==after.count||activeAmount>after.amountCents)fail('Expense allocations are inconsistent; reload');
  if(after.status==='recorded'&&activeAmount!==after.amountCents)fail('Recorded expense is incomplete');
  if(['cancelled','voided'].includes(after.status)&&activeCount!==0)fail('Expense reversal is incomplete');
  return {status:after.status,amountCents:after.amountCents,allocatedCents:activeAmount,allocations:entries.sort((a,b)=>a.id.localeCompare(b.id))};
 }
 return {createPerson,assignPresident,createPayment,voidPayment,createRemittance,addPayment,submitRemittance,accept,declineRemittance,cancelRemittance,releasePayment,requestCorrection,decideCorrection,confirmPrint,createExpense,allocate,finalizeExpense,cancelExpense,release,finishCancellation,beginVoid,finishVoid,inspectExpense,inspectRemittance};
}
if(typeof module==='object'&&module.exports)module.exports={createIntegratedClient};
else if(typeof window!=='undefined')window.createFacultyFundSparkClient=createIntegratedClient;
