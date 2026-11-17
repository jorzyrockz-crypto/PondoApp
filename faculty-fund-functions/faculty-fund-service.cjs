'use strict';
// Experimental backend adapter. Deliberately NOT exported as a callable from
// index.cjs: it is not integrated with the fund ledger, backup, or clients.
// Calls must be made only from trusted server code, never from a browser.
const {createHash}=require('node:crypto');
const domain=require('./faculty-fund-domain.cjs');
const MAX_STATE_BYTES=450_000,MAX_INPUT_BYTES=40_000,MAX_BATCH=200;
const digest=value=>createHash('sha256').update(value).digest('hex');
class FacultyFundError extends Error{constructor(code,message){super(message);this.code=code}}
const reject=(code,message)=>{throw new FacultyFundError(code,message)};
function segment(value,label,max=128){
 if(typeof value!=='string'||!value||value.length>max||value.includes('/')||value==='.'||value==='..')reject('invalid-argument','Invalid '+label);
 return value;
}
function requestId(value){if(typeof value!=='string'||!/^[a-f0-9]{32}$/.test(value))reject('invalid-argument','Invalid request ID');return value}
function normalized(input){
 if(!input||typeof input!=='object'||Array.isArray(input))reject('invalid-argument','Invalid input');
 const op=input.operation;
 switch(op){
  case 'assignPresident':return {operation:op,presidentUid:segment(input.presidentUid,'President UID')};
  case 'registerPerson':return {operation:op,name:input.name};
  case 'recordPayment':return {operation:op,personId:input.personId,absenceDate:input.absenceDate,paymentDate:input.paymentDate,amountCents:input.amountCents??domain.DEFAULT_ABSENCE_CENTS};
  case 'recordExpense':return {operation:op,occurredAt:input.occurredAt,amountCents:input.amountCents,description:input.description,payee:input.payee,reference:input.reference??''};
  case 'voidPayment':return {operation:op,paymentId:input.paymentId,reason:input.reason};
  case 'voidExpense':return {operation:op,expenseId:input.expenseId,reason:input.reason};
  case 'submitRemittance':return {operation:op,paymentIds:input.paymentIds};
  case 'accept':return {operation:op,remittanceId:input.remittanceId};
  case 'decline':return {operation:op,remittanceId:input.remittanceId,reason:input.reason};
  case 'cancelRemittance':return {operation:op,remittanceId:input.remittanceId,reason:input.reason};
  case 'requestRemittanceVoid':return {operation:op,remittanceId:input.remittanceId,reason:input.reason};
  case 'approveRemittanceVoid':return {operation:op,remittanceId:input.remittanceId};
  case 'declineRemittanceVoid':return {operation:op,remittanceId:input.remittanceId,reason:input.reason};
  case 'markMemberPrinted':return {operation:op,paymentId:input.paymentId};
  case 'markMemberBatchPrinted':return {operation:op,paymentIds:input.paymentIds};
  case 'markRemittancePrinted':return {operation:op,remittanceId:input.remittanceId};
  default:reject('invalid-argument','Unknown operation');
 }
}
function todayManila(date){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=type=>parts.find(p=>p.type===type).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
function validateBatch(value){if(!Array.isArray(value)||value.length<1||value.length>MAX_BATCH)reject('invalid-argument','Invalid batch size');}
function createFacultyFundService({db,clock=()=>new Date()}){
 if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function')throw new Error('A server Firestore instance is required');
 return async function transition({auth,input}){
  // Identity is from verified callable authentication, never from request data.
  if(!auth?.uid)reject('unauthenticated','Sign in first');
  const uid=segment(auth.uid,'user UID'),orgId=segment(input?.orgId,'workspace ID',160),token=requestId(input?.requestId);
  let serialized;try{serialized=JSON.stringify(input)}catch{reject('invalid-argument','Invalid input')}
  if(!serialized||Buffer.byteLength(serialized,'utf8')>MAX_INPUT_BYTES)reject('invalid-argument','Input is too large');
  const op=normalized(input);
  if(op.operation==='submitRemittance'||op.operation==='markMemberBatchPrinted')validateBatch(op.paymentIds);
  const operationHash=digest(JSON.stringify(op)),key=digest(JSON.stringify([uid,token]));
  // IDs are generated deterministically by the server from a per-actor request
  // ID, so retries never produce a second record.
  const recordId=(op.operation==='recordPayment'?'pay_':op.operation==='registerPerson'?'person_':op.operation==='recordExpense'?'exp_':'rem_')+key;
  const root=`organizations/${orgId}`, memberRef=db.doc(`${root}/members/${uid}`), configRef=db.doc(`${root}/facultyFund/config`),stateRef=db.doc(`${root}/facultyFund/state`),controlRef=db.doc(`${root}/facultyFund/control`),opRef=db.doc(`${root}/facultyFundOperations/${key}`);
  return db.runTransaction(async tx=>{
   const [memberSnap,configSnap,stateSnap,controlSnap,opSnap]=await Promise.all([tx.get(memberRef),tx.get(configRef),tx.get(stateRef),tx.get(controlRef),tx.get(opRef)]);
   // Check current membership even on retries: a removed member can't retrieve
   // an operation result. Roles and office assignment are never client-supplied.
   if(!memberSnap.exists)reject('permission-denied','Workspace membership is required');
   const member=memberSnap.data();
   if(member.uid!==uid||!['owner','disbursing','project-manager','reviewer'].includes(member.role))reject('permission-denied','Invalid workspace membership');
   if(stateSnap.exists!==controlSnap.exists||(configSnap.exists&&!stateSnap.exists))reject('failed-precondition','Faculty Fund state and control do not match; recovery is required');
   const revision=controlSnap.exists?controlSnap.data().revision:0;
   if(!Number.isSafeInteger(revision)||revision<0||revision===Number.MAX_SAFE_INTEGER||(controlSnap.exists&&revision===0))reject('failed-precondition','Invalid Faculty Fund revision');
   if(opSnap.exists){const previous=opSnap.data();if(previous.uid!==uid||previous.hash!==operationHash)reject('already-exists','Request ID already used for a different operation');return {...previous.result,replayed:true};}
   const config=configSnap.exists?configSnap.data():{};
   const state=stateSnap.exists?stateSnap.data():{people:[],payments:[],expenses:[],remittances:[],audit:[]};
   const now=clock();if(!(now instanceof Date)||!Number.isFinite(now.getTime()))reject('internal','Server clock unavailable');
   const at=now.toISOString(),actorName=typeof member.displayName==='string'&&member.displayName.trim()?member.displayName.trim().slice(0,160):(typeof member.email==='string'&&member.email.trim()?member.email.trim().slice(0,160):null),ctx={uid,actorName,role:member.role,memberConfirmed:true,presidentUid:config.presidentUid||null,now:at,today:todayManila(now)};
   let next=state,result={ok:true};
   if(op.operation==='assignPresident'){
    if(member.role!=='owner')reject('permission-denied','Only an owner can assign the Faculty President');
    const target=await tx.get(db.doc(`${root}/members/${op.presidentUid}`));
    if(!target.exists||target.data().uid!==op.presidentUid)reject('failed-precondition','President must be a current workspace member');
    if(config.presidentUid===op.presidentUid)reject('failed-precondition','This member is already assigned');
    next=structuredClone(state);next.audit.push({kind:'president-assigned',id:op.presidentUid,actorUid:uid,at,previousPresidentUid:config.presidentUid||null});
    result={ok:true,presidentUid:op.presidentUid};
   }else{
    if(['submitRemittance','accept','decline','approveRemittanceVoid','declineRemittanceVoid'].includes(op.operation)){
     if(!config.presidentUid)reject('failed-precondition','Assign a Faculty President first');
     // The officeholder must still be a member even if the caller is the AO.
     const officeholder=await tx.get(db.doc(`${root}/members/${segment(config.presidentUid,'stored President UID')}`));
     if(!officeholder.exists||officeholder.data().uid!==config.presidentUid)reject('failed-precondition','Assigned President is no longer a member');
    }
    try{
     switch(op.operation){
      case 'registerPerson':next=domain.addPerson(state,{id:recordId,name:op.name},ctx);result={ok:true,personId:recordId};break;
      case 'recordPayment':{const person=(state.people||[]).find(p=>p.id===op.personId);if(!person)reject('failed-precondition','Choose a registered faculty member');next=domain.addPayment(state,{...op,id:recordId,memberName:person.name},ctx);result={ok:true,paymentId:recordId};break;}
      case 'recordExpense':next=domain.addExpense(state,{...op,id:recordId},ctx);result={ok:true,expenseId:recordId};break;
      case 'voidPayment':next=domain.voidPayment(state,op.paymentId,op.reason,ctx);break;
      case 'voidExpense':next=domain.voidExpense(state,op.expenseId,op.reason,ctx);break;
      case 'submitRemittance':next=domain.createRemittance(state,{id:recordId,paymentIds:op.paymentIds},ctx);result={ok:true,remittanceId:recordId};break;
      case 'accept':next=domain.decideRemittance(state,op.remittanceId,'accept',ctx);break;
      case 'decline':next=domain.decideRemittance(state,op.remittanceId,'decline',{...ctx,reason:op.reason});break;
      case 'cancelRemittance':next=domain.cancelRemittance(state,op.remittanceId,op.reason,ctx);break;
      case 'requestRemittanceVoid':next=domain.requestRemittanceVoid(state,op.remittanceId,op.reason,ctx);break;
      case 'approveRemittanceVoid':next=domain.decideRemittanceVoid(state,op.remittanceId,'approve',ctx);break;
      case 'declineRemittanceVoid':next=domain.decideRemittanceVoid(state,op.remittanceId,'decline',{...ctx,reason:op.reason});break;
      case 'markMemberPrinted':next=domain.markReceiptPrinted(state,'member',op.paymentId,ctx);break;
      case 'markMemberBatchPrinted':next=domain.markMemberReceiptsPrinted(state,op.paymentIds,ctx);break;
      case 'markRemittancePrinted':next=domain.markReceiptPrinted(state,'remittance',op.remittanceId,ctx);break;
      default:reject('invalid-argument','Unknown operation');
     }
    }catch(error){if(error instanceof FacultyFundError)throw error;reject('failed-precondition',error.message);}
   }
   if(Buffer.byteLength(JSON.stringify(next),'utf8')>MAX_STATE_BYTES)reject('resource-exhausted','Faculty Fund prototype capacity reached; no change was saved');
   // The state, assignment and idempotency receipt are one transaction.
   tx.set(stateRef,next);
   tx.set(controlRef,{revision:revision+1,updatedAt:at,updatedByUid:uid});
   if(op.operation==='assignPresident')tx.set(configRef,{presidentUid:op.presidentUid,assignedAt:at,assignedByUid:uid});
   tx.create(opRef,{uid,hash:operationHash,result,createdAt:at});
   return {...result,replayed:false};
  });
 };
}
module.exports={createFacultyFundService,FacultyFundError,MAX_STATE_BYTES,MAX_BATCH};
