'use strict';
// Read only server projection. Auth is supplied by Firebase, not client data.
const {facultyCashLedger}=require('./faculty-fund-ledger.cjs');
const {facultyReport,facultyReportCsv}=require('./faculty-fund-report.cjs');
const {renderMemberReceipts,renderRemittanceReceipt}=require('./faculty-fund-receipts.cjs');
const {FacultyFundError}=require('./faculty-fund-service.cjs');
function bad(code,msg){throw new FacultyFundError(code,msg)}
function segment(v,label,max=128){if(typeof v!=='string'||!v||v.length>max||v.includes('/')||v==='.'||v==='..')bad('invalid-argument','Invalid '+label);return v}
function createFacultyFundReadService({db}){
 if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function')throw Error('Server Firestore is required');
 return async ({auth,input})=>{
  if(!auth?.uid)bad('unauthenticated','Sign in first');
  const uid=segment(auth.uid,'user'),orgId=segment(input?.orgId,'workspace',160),view=input?.view;
  if(!['state','report','csv','memberReceipts','remittanceReceipt'].includes(view))bad('invalid-argument','Invalid view');
  const root=`organizations/${orgId}`;
  return db.runTransaction(async tx=>{
   const [member,state,control,config,organization]=await Promise.all(['members/'+uid,'facultyFund/state','facultyFund/control','facultyFund/config',''].map(p=>tx.get(db.doc(p?`${root}/${p}`:root))));
   if(!member.exists||member.data().uid!==uid||!['owner','disbursing','project-manager','reviewer'].includes(member.data().role))bad('permission-denied','Workspace membership required');
   if(state.exists!==control.exists||(config.exists&&!state.exists))bad('failed-precondition','Faculty Fund state requires recovery');
   if(control.exists&&(!Number.isSafeInteger(control.data().revision)||control.data().revision<1))bad('failed-precondition','Invalid Faculty Fund revision');
   const current=state.exists?state.data():{people:[],payments:[],expenses:[],remittances:[],audit:[]};
   const info=config.exists?config.data():null;
   try{
    if(view==='state')return {state:current,config:info,revision:control.exists?control.data().revision:0,ledger:facultyCashLedger(current),role:member.data().role};
    if(view==='report')return {report:facultyReport(current,{from:input.from||'',to:input.to||''})};
    if(view==='csv')return {csv:facultyReportCsv(current,{from:input.from||'',to:input.to||''})};
    if(!['owner','disbursing'].includes(member.data().role))bad('permission-denied','Only an authorized collector can print receipts');
    const name=organization.exists&&typeof organization.data().name==='string'?organization.data().name:'Faculty Fund';
    if(view==='memberReceipts')return {html:renderMemberReceipts(current,input.paymentIds,name)};
    return {html:renderRemittanceReceipt(current,input.remittanceId,name)};
   }catch(error){if(error instanceof FacultyFundError)throw error;bad('failed-precondition',error.message);}
  });
 };
}
module.exports={createFacultyFundReadService};
