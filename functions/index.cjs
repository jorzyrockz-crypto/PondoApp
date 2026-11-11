'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {randomBytes,createHash}=require('node:crypto');
const {buildPublicReport}=require('./projection.js');
const {validatePublicReport}=require('./validate.cjs');
initializeApp();
const db=getFirestore();
const KEYS=['funds','projects','contributions'];
function authUid(request){if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in first.');return request.auth.uid;}
function workspace(request){
 const uid=authUid(request),orgId=request.data?.orgId;
 if(orgId==null){
  // Personal workspaces are device-local: two devices on the same account
  // must never publish one another's data under the same share.
  const deviceId=request.data?.deviceId;
  if(typeof deviceId!=='string'||!/^[a-f0-9]{32}$/.test(deviceId))throw new HttpsError('invalid-argument','Invalid personal device.');
  return {uid,orgId:null,deviceId,key:'u_'+uid+'_'+deviceId};
 }
 if(typeof orgId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(orgId))throw new HttpsError('invalid-argument','Invalid workspace.');
 return {uid,orgId,key:'o_'+orgId};
}
function selections(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!KEYS.includes(k))||KEYS.some(k=>typeof value[k]!=='boolean')||!KEYS.some(k=>value[k]))throw new HttpsError('invalid-argument','Choose at least one view.');
 return {funds:value.funds,projects:value.projects,contributions:value.contributions};
}
function currency(value){if(typeof value!=='string'||!/^[A-Z]{3}$/.test(value))throw new HttpsError('invalid-argument','Choose a three-letter currency code.');return value;}
function projection(snapshot,selected){try{return validatePublicReport(buildPublicReport(snapshot,selected),selected)}catch(e){throw new HttpsError('failed-precondition','The report could not be prepared. Check the data or report size.') }}
function safeReport(report,selected){try{return validatePublicReport(report,selected)}catch(e){throw new HttpsError('invalid-argument','The report is invalid or too large.') }}
async function requireOwner(tx,ws){
 if(!ws.orgId)return;
 const member=await tx.get(db.doc(`organizations/${ws.orgId}/members/${ws.uid}`));
 if(!member.exists||member.data().role!=='owner')throw new HttpsError('permission-denied','Only the organization owner can manage public sharing.');
}
const configRef=ws=>db.doc('publicShareConfig/'+ws.key);
const publicRef=id=>db.doc('publicReports/'+id);
function publicDocument(report,currencyCode){return {report,currency:currencyCode,updatedAt:FieldValue.serverTimestamp()}}
// A confirmation is bound to the exact sanitized report, selection and
// currency the owner reviewed. This is not an authorization credential.
function previewDigest(report,selection,code){
 return createHash('sha256').update(JSON.stringify({report,selection,currency:code})).digest('hex');
}
async function reportFor(tx,ws,selection,personalReport){
 if(!ws.orgId)return safeReport(personalReport,selection);
 const source=await tx.get(db.doc(`organizations/${ws.orgId}/data/snapshot`));
 if(!source.exists)throw new HttpsError('failed-precondition','No synced organization data yet.');
 return projection(source.data(),selection);
}
// Preview never writes or enables sharing. For teams it is generated from the
// authoritative synced snapshot, not from the owner's potentially stale tab.
exports.publicReportPreview=onCall(async request=>{
 const ws=workspace(request),selection=selections(request.data?.selection),code=currency(request.data?.currency);
 return db.runTransaction(async tx=>{
  await requireOwner(tx,ws);
  const report=await reportFor(tx,ws,selection,request.data?.report);
  return {report,selection,currency:code,previewDigest:previewDigest(report,selection,code)};
 });
});


exports.publicReportStatus=onCall(async request=>{
 const ws=workspace(request),ref=configRef(ws);
 return db.runTransaction(async tx=>{
  await requireOwner(tx,ws);const snap=await tx.get(ref);
  if(!snap.exists)return {enabled:false};
  const data=snap.data();return {enabled:true,id:data.publicId,selection:data.selection,currency:data.currency,status:data.status||'ready',revision:data.revision||0};
 });
});
exports.publicReportEnable=onCall(async request=>{
 const ws=workspace(request),selection=selections(request.data?.selection),code=currency(request.data?.currency),ref=configRef(ws);
 const candidate=randomBytes(24).toString('hex');
 return db.runTransaction(async tx=>{
  await requireOwner(tx,ws);const old=await tx.get(ref);
  const report=await reportFor(tx,ws,selection,request.data?.report);
  if(typeof request.data?.previewDigest!=='string'||request.data.previewDigest!==previewDigest(report,selection,code))
   throw new HttpsError('failed-precondition','The report changed since preview. Review it again before publishing.');
  // Each confirmation starts a new share generation. A delayed update from
  // an earlier configuration must not overwrite the freshly approved report.
  // Changing settings therefore invalidates the old link as well.
  const previous=old.exists?old.data():null,publicId=candidate;
  if(previous && previous.publicId!==publicId)tx.delete(publicRef(previous.publicId));
  tx.set(ref,{publicId,orgId:ws.orgId,deviceId:ws.deviceId||null,ownerUid:ws.uid,selection,currency:code,status:'ready',revision:0});
  tx.set(publicRef(publicId),publicDocument(report,code));
  return {enabled:true,id:publicId,selection,currency:code,revision:0};
 });
});
exports.publicReportDisable=onCall(async request=>{
 const ws=workspace(request),ref=configRef(ws);
 return db.runTransaction(async tx=>{
  await requireOwner(tx,ws);const old=await tx.get(ref);
  if(old.exists){tx.delete(publicRef(old.data().publicId));tx.delete(ref)}
  return {enabled:false};
 });
});
exports.publicReportUpdatePersonal=onCall(async request=>{
 const ws=workspace(request);if(ws.orgId)throw new HttpsError('invalid-argument','Personal workspaces only.');
 const revision=request.data?.revision;if(!Number.isSafeInteger(revision)||revision<1)throw new HttpsError('invalid-argument','Invalid revision.');
 return db.runTransaction(async tx=>{
  const ref=configRef(ws),cfg=await tx.get(ref);
  if(!cfg.exists)throw new HttpsError('failed-precondition','Sharing is disabled.');
  const settings=cfg.data();
  if(settings.orgId!==null||settings.ownerUid!==ws.uid||settings.publicId!==request.data?.id)throw new HttpsError('permission-denied','This share is no longer active.');
  if(revision<=(settings.revision||0))throw new HttpsError('aborted','A newer public update exists. Refresh and try again.');
  const report=safeReport(request.data?.report,settings.selection);
  tx.set(publicRef(settings.publicId),publicDocument(report,settings.currency));tx.update(ref,{revision,status:'ready'});
  return {revision};
 });
});
// Every team snapshot change refreshes from the *latest* snapshot in a
// transaction. Reading the config inside that transaction prevents an old
// event from resurrecting a revoked share or overwriting a newer update.
async function refreshTeamReport(orgId){
 const ref=configRef({key:'o_'+orgId});
 await db.runTransaction(async tx=>{
  const cfg=await tx.get(ref);if(!cfg.exists)return;
  const settings=cfg.data(),source=await tx.get(db.doc(`organizations/${orgId}/data/snapshot`));
  const member=await tx.get(db.doc(`organizations/${orgId}/members/${settings.ownerUid}`));
  if(!source.exists||!member.exists||member.data().role!=='owner'){
    tx.delete(publicRef(settings.publicId));tx.update(ref,{status:'unavailable'});return;
  }
  let report;
  try{report=projection(source.data(),settings.selection)}catch(e){tx.delete(publicRef(settings.publicId));tx.update(ref,{status:'invalid-or-too-large'});return;}
  tx.set(publicRef(settings.publicId),publicDocument(report,settings.currency));tx.update(ref,{status:'ready'});
 });
}
exports.publicReportTeamRefresh=onDocumentWritten('organizations/{orgId}/data/snapshot',event=>refreshTeamReport(event.params.orgId));
exports.publicReportMembershipRefresh=onDocumentWritten('organizations/{orgId}/members/{memberId}',event=>refreshTeamReport(event.params.orgId));
