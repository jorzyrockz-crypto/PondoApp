'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createService}=require('./service.cjs');
initializeApp();
const service=createService({db:getFirestore(),FieldValue,HttpsError});
for(const [exportName,method] of Object.entries({orgCreate:'create',orgSetVisibility:'visibility',orgSearch:'search',orgRequestJoin:'request',orgPendingRequests:'pending',orgDecideRequest:'decide',orgMyRequests:'mine'})){
 exports[exportName]=onCall({region:'us-central1'},request=>service[method](request));
}
