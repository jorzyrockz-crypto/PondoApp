'use strict';
// Builds an IN-MEMORY emulator-only combination. Never writes or deploys rules.
const fs=require('node:fs'),path=require('node:path');
function replaceOnce(source,before,after){if(source.split(before).length!==2)throw Error('Integrated restore proof insertion point changed');return source.replace(before,()=>after);}
function rules(){
 let candidate=fs.readFileSync(path.join(__dirname,'../firestore.faculty-release-candidate.rules'),'utf8');const proof=fs.readFileSync(path.join(__dirname,'fixtures/faculty-spark-capture-proof.rules'),'utf8');
 candidate=replaceOnce(candidate,'  function revisionAdvanced(o) {\n   return ', '  function revisionAdvanced(o) {\n   return !exists(lock(o)) && !existsAfter(lock(o)) && ');
 const start=proof.indexOf('  function header(o,b)'),versionStart=proof.indexOf('  match /organizations/{o}/sparkDiscoveryRevision/{id}'),versionEnd=proof.indexOf('  match /organizations/{o}/{k}/{id}');
 if(start<0||versionStart<0||versionEnd<0||!proof.endsWith(' }\n}\n'))throw Error('Restore proof rules layout changed');
 const extraFunctions=proof.slice(start,versionStart),extraMatches=proof.slice(versionEnd,-5),versionBlock=proof.slice(versionStart,versionEnd);
 const proofUpdate=versionBlock.slice(versionBlock.indexOf('   allow update:'),versionBlock.lastIndexOf('  }'));
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
