'use strict';
// Separate codebase from the experimental public-report backend. These callable
// endpoints remain disabled unless the operator explicitly enables them after
// deploying matching security rules and testing the complete integration.
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createFacultyFundService,FacultyFundError}=require('./faculty-fund-service.cjs');
const {createFacultyFundReadService}=require('./faculty-fund-read.cjs');
const {createFacultyFundBackupService}=require('./faculty-fund-backup.cjs');
const {createFacultyFundRecoveryService}=require('./faculty-fund-recovery.cjs');
initializeApp();const db=getFirestore();
const transition=createFacultyFundService({db}),read=createFacultyFundReadService({db}),backup=createFacultyFundBackupService({db}),recovery=createFacultyFundRecoveryService({db});
function wrap(handler){return onCall(async request=>{
 if(process.env.PONDO_FACULTY_FUND_ENABLED!=='true')throw new HttpsError('failed-precondition','Faculty Fund is not enabled.');
 if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in first.');
 try{return await handler({auth:{uid:request.auth.uid},input:request.data||{}})}
 catch(e){if(e instanceof FacultyFundError)throw new HttpsError(e.code,e.message);console.error('Faculty Fund request failed',e);throw new HttpsError('internal','Faculty Fund could not confirm the request. Retry the same operation.');}
});}
exports.facultyFundTransition=wrap(transition);
exports.facultyFundRead=wrap(read);
exports.facultyFundRecovery=wrap(recovery);
exports.facultyFundExport=wrap(({auth,input})=>backup({auth,orgId:input.orgId}));
