'use strict';
// Generates a REVIEW CANDIDATE, never deploys it. The application remains
// test-gated. Changing this file alone cannot make the fund production-ready.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function replaceOnce(text,before,after){if(text.split(before).length!==2)throw Error('Expected exactly one candidate insertion point');return text.replace(before,after);}
function generate(source){
 let out=replaceOnce(source,"rules_version = '2';", "rules_version = '2';\n// RELEASE CANDIDATE FOR REVIEW ONLY — NOT APPROVED FOR DEPLOYMENT.\n// No protected restore or complete release workflow exists yet.");
 out=replaceOnce(out,'    // TEST ONLY: experimental Faculty Fund; fictitious records only.', '    // CANDIDATE ONLY: activated workspaces, pending review and safe recovery.');
 const previous="  function signed(o) { return o.matches('^org~faculty fund test .+$') && request.auth != null && exists(member(o,request.auth.uid)); }";
 const next=`  // This separate control must be provisioned by a privileged administrator;
  // no application client can create, modify or remove it under these rules.
  function facultyRelease(o) { return /databases/$(database)/documents/organizations/$(o)/facultyFundRelease/current; }
  function signed(o) { return request.auth != null && exists(member(o,request.auth.uid))
    && exists(facultyRelease(o)) && get(facultyRelease(o)).data.enabled == true
    && get(facultyRelease(o)).data.schema == 1; }
  match /organizations/{o}/facultyFundRelease/{id} {
   allow read: if id == 'current' && request.auth != null && exists(member(o,request.auth.uid));
   allow write: if false;
  }`;
 return replaceOnce(out,previous,next);
}
if(require.main===module){const src=fs.readFileSync(path.join(root,'firestore.faculty-test.rules'),'utf8');fs.writeFileSync(path.join(root,'firestore.faculty-release-candidate.rules'),generate(src));}
module.exports={generate};
