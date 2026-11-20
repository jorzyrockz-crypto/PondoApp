'use strict';
// Offline TEST-ONLY review candidate. Never deploys or changes Firebase config.
// It is not safe to publish without comparing freshly published rules, review,
// rollback planning, and tests. No actual fund data may be used.
const fs=require('node:fs'),path=require('node:path');
const {generate:recovery}=require('./generate-faculty-recovery-candidate.cjs');
function replaceOnce(text,before,after){if(text.split(before).length!==2)throw Error('Unexpected recovery candidate layout');return text.replace(before,()=>after);}
function generate(){
 let text=recovery();
 text=replaceOnce(text,'// OWNER RECOVERY REVIEW CANDIDATE — not production-ready or deployed.', '// TEST-WORKSPACE RECOVERY REVIEW CANDIDATE — fictitious data only; not approved or deployed.');
 text=replaceOnce(text,'    // CANDIDATE ONLY: activated workspaces, pending review and safe recovery.', '    // TEST ONLY: named test workspaces; experimental recovery; fictitious data only.');
 const old=`  // This separate control must be provisioned by a privileged administrator;
  // no application client can create, modify or remove it under these rules.
  function facultyRelease(o) { return /databases/$(database)/documents/organizations/$(o)/facultyFundRelease/current; }
  function recoveryMember(o) { return request.auth != null && exists(member(o,request.auth.uid))
    && (o.matches('^org~faculty fund test .+$') || (exists(facultyRelease(o))
    && get(facultyRelease(o)).data.enabled == true && get(facultyRelease(o)).data.schema == 1)); }
  function signed(o) { return recoveryMember(o) && !exists(lock(o)); }
  function recoveryOwner(o) { return recoveryMember(o) && get(member(o,request.auth.uid)).data.role == 'owner'; }
  match /organizations/{o}/facultyFundRelease/{id} {
   allow read: if id == 'current' && request.auth != null && exists(member(o,request.auth.uid));
   allow write: if false;
  }`;
 const scoped=`  function recoveryMember(o) { return o.matches('^org~faculty fund test .+$')
    && request.auth != null && exists(member(o,request.auth.uid)); }
  function signed(o) { return recoveryMember(o) && !exists(lock(o)); }
  function recoveryOwner(o) { return recoveryMember(o) && get(member(o,request.auth.uid)).data.role == 'owner'; }`;
 return replaceOnce(text,old,scoped);
}
if(require.main===module)fs.writeFileSync(path.join(__dirname,'../firestore.faculty-test-recovery-candidate.rules'),generate());
module.exports={generate};
