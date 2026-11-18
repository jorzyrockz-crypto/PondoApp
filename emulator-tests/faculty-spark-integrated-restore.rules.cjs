'use strict';
// Builds an IN-MEMORY emulator-only combination. Never writes or deploys rules.
const fs=require('node:fs'),path=require('node:path');
function replaceOnce(source,before,after){if(source.split(before).length!==2)throw Error('Integrated restore proof insertion point changed');return source.replace(before,()=>after);}
function rules(){
 let candidate=fs.readFileSync(path.join(__dirname,'../firestore.faculty-release-candidate.rules'),'utf8');const proof=fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-capture-proof.rules'),'utf8');
 candidate=replaceOnce(candidate,'  function revisionAdvanced(o) {\n   return ', '  function revisionAdvanced(o) {\n   return !exists(lock(o)) && !existsAfter(lock(o)) && ');
 const gate="  function signed(o) { return request.auth != null && exists(member(o,request.auth.uid))\n    && (o.matches('^org~faculty fund test .+$') || (exists(facultyRelease(o))\n    && get(facultyRelease(o)).data.enabled == true && get(facultyRelease(o)).data.schema == 1)); }";
 candidate=replaceOnce(candidate,gate,gate.replace('function signed(o)','function recoveryMember(o)')+"\n  function signed(o) { return recoveryMember(o) && !exists(lock(o)); }\n  function recoveryOwner(o) { return recoveryMember(o) && get(member(o,request.auth.uid)).data.role == 'owner'; }");
 const start=proof.indexOf('  function header(o,b)'),versionStart=proof.indexOf('  match /organizations/{o}/sparkDiscoveryRevision/{id}'),versionEnd=proof.indexOf('  match /organizations/{o}/{k}/{id}');
 if(start<0||versionStart<0||versionEnd<0||!proof.endsWith(' }\n}\n'))throw Error('Restore proof rules layout changed');
 const extraFunctions=proof.slice(start,versionStart),versionBlock=proof.slice(versionStart,versionEnd);
 let extraMatches=proof.slice(versionEnd,-5).replaceAll('owner(o)','recoveryOwner(o)');
 extraMatches=replaceOnce(extraMatches,'   allow read: if recoveryOwner(o) && kind(k);','   allow get: if recoveryOwner(o) && kind(k);\n   allow list: if recoveryOwner(o) && kind(k) && !exists(lock(o));');
 extraMatches=replaceOnce(extraMatches,"   allow read: if signed(o) && id == 'current';","   allow read: if recoveryMember(o) && id == 'current';");
 extraMatches+="  match /organizations/{o}/sparkDiscoveryRevision/{id} { allow get: if id == 'current' && recoveryOwner(o) && exists(lock(o)); }\n";
 const proofUpdate=versionBlock.slice(versionBlock.indexOf('   allow update:'),versionBlock.lastIndexOf('  }')).replaceAll('owner(o)','recoveryOwner(o)');
 const existingStart=candidate.indexOf('  match /organizations/{o}/sparkDiscoveryRevision/{id}'),existingEnd=candidate.indexOf('  match /organizations/{o}/sparkDiscoveryConfig/{id}');if(existingStart<0||existingEnd<0)throw Error('Missing candidate revision rules');
 let revision=candidate.slice(existingStart,existingEnd);
 revision=replaceOnce(revision,"allow create: if id == 'current' && (collector(o) || president(o))", "allow create: if id == 'current' && !exists(lock(o)) && !existsAfter(lock(o)) && (collector(o) || president(o))");
 revision=replaceOnce(revision,"allow update: if id == 'current' && (collector(o) || president(o))", "allow update: if id == 'current' && !exists(lock(o)) && !existsAfter(lock(o)) && (collector(o) || president(o))");
 revision=replaceOnce(revision,'   allow delete: if false;',proofUpdate+'   allow delete: if false;');
 candidate=candidate.slice(0,existingStart)+revision+candidate.slice(existingEnd);
 if(!candidate.endsWith('  }\n}\n'))throw Error('Candidate rules layout changed');
 return candidate.slice(0,-6)+'\n  // ISOLATED restore proof; not a deployable rules candidate.\n'+extraFunctions+extraMatches+'  }\n}\n';
}
module.exports={rules};
