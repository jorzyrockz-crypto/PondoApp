'use strict';
// Run ONLY in a coordinated maintenance window with old clients and writers
// disabled. Default is a read-only audit. Resolve duplicate/invalid names by
// agreement before --apply; never choose a winner automatically.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {canonicalName,nameId}=require('./service.cjs');
function parseArgs(args,project){
 if(!project || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project))throw Error('Set GCLOUD_PROJECT to the exact intended Firebase project ID.');
 const allowed=new Set(['--apply','--writers-stopped',`--confirm-project=${project}`]);
 if(args.some(a=>!allowed.has(a)) || new Set(args).size!==args.length)throw Error('Unknown, repeated, or mismatched argument.');
 const apply=args.includes('--apply');
 if(apply && (!args.includes('--writers-stopped') || !args.includes(`--confirm-project=${project}`)))throw Error('Apply requires --writers-stopped and --confirm-project=<exact GCLOUD_PROJECT>.');
 if(!apply && args.length)throw Error('Confirmation flags are only valid with --apply.');
 return apply;
}
async function main(){
 const apply=parseArgs(process.argv.slice(2),process.env.GCLOUD_PROJECT);initializeApp({credential:applicationDefault(),projectId:process.env.GCLOUD_PROJECT});const db=getFirestore();
 const marker=await db.doc('organizationDirectoryConfig/migration').get();if(marker.exists&&marker.data().ready===true)throw Error('Migration is already marked ready; do not rerun.');
 const all=await db.collection('organizations').get(),seen=new Map(),entries=[],issues=[];
 for(const doc of all.docs){try{const n=canonicalName(doc.data().name),key=nameId(n.key);if(seen.has(key))issues.push(`Duplicate: ${seen.get(key)} and ${doc.id}`);else seen.set(key,doc.id);entries.push({id:doc.id,key:n.key,hash:key});}catch(e){issues.push(`Invalid name on ${doc.id}: ${e.message}`)}}
 const existing=await db.collection('organizationNames').get();for(const d of existing.docs){const found=entries.find(e=>e.hash===d.id);if(!found||d.data().orgId!==found.id||d.data().key!==found.key)issues.push(`Conflicting existing reservation: ${d.id}`)}
 console.log(`Project ${process.env.GCLOUD_PROJECT}: ${entries.length} organizations; ${issues.length} issues.`);issues.forEach(x=>console.error(x));
 if(issues.length)throw Error('Resolve every issue before applying.');
 if(!apply){console.log('Audit only; no writes. After verifying the maintenance and rollout plan, use --apply --writers-stopped --confirm-project=<exact project ID>.');return;}
 // Idempotent on retry after an interrupted migration. Writes are bounded and
 // the ready flag is written only after all reservations succeed.
 for(let i=0;i<entries.length;i+=200){const batch=db.batch();for(const e of entries.slice(i,i+200)){batch.set(db.doc(`organizationNames/${e.hash}`),{key:e.key,orgId:e.id});batch.update(db.doc(`organizations/${e.id}`),{discoverable:false});}await batch.commit();}
 await db.doc('organizationDirectoryConfig/migration').set({ready:true,version:1});console.log('Registry ready. Existing organizations remain undiscoverable until owners opt in.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
