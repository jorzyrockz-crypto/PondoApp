'use strict';
// Read-only administrative inventory for Firestore Spark. This is not a
// delete implementation, and it must never be imported into the web app.
// It deliberately uses Admin listCollections/listDocuments, including missing
// parents with surviving descendants, which browser Firestore cannot enumerate.
const MAX_WORKSPACE_REFS=10000,MAX_USERS=1000,MAX_DEPTH=12;
function workspaceId(value){
 if(typeof value!=='string'||!value||value.length>150||value.includes('/')||value==='.'||value==='..'||/^__.*__$/.test(value))throw Error('Invalid workspace ID.');
 return value;
}
async function inventoryWorkspace({db,orgId,limits={}}){
 orgId=workspaceId(orgId);
 if(!db||typeof db.doc!=='function'||typeof db.collection!=='function')throw Error('An administrative Firestore connection is required.');
 const cap=(n,fallback,max)=>n===undefined?fallback:(Number.isSafeInteger(n)&&n>0&&n<=max?n:(()=>{throw Error('Invalid inventory limit.')})());
 const maxRefs=cap(limits.maxRefs,MAX_WORKSPACE_REFS,MAX_WORKSPACE_REFS),maxUsers=cap(limits.maxUsers,MAX_USERS,MAX_USERS),maxDepth=cap(limits.maxDepth,MAX_DEPTH,MAX_DEPTH);
 const root=db.doc('organizations/'+orgId),rootSnap=await root.get();
 const groups=Object.create(null);let scannedRefs=0,missingParentRefs=0;
 async function walkDocument(ref,prefix,depth){
  if(depth>maxDepth)throw Error('Inventory stopped: maximum nesting depth reached. Results are incomplete.');
  const children=await ref.listCollections();
  for(const col of children){
   const pattern=prefix?prefix+'/*/'+col.id:col.id;
   const refs=await col.listDocuments();
   for(const child of refs){
    if(++scannedRefs>maxRefs)throw Error('Inventory stopped: maximum workspace document count reached. Results are incomplete.');
    const snap=await child.get();if(snap.exists)groups[pattern]=(groups[pattern]||0)+1;else missingParentRefs++;
    await walkDocument(child,pattern,depth+1);
   }
  }
 }
 await walkDocument(root,'',0);
 const users=await db.collection('users').listDocuments();
 if(users.length>maxUsers)throw Error('Inventory stopped: maximum user count reached. Results are incomplete.');
 let profileMemberships=0,profileActive=0,profileLegacy=0,requestIndexes=0,notices=0;
 for(const user of users){
  const profile=await user.get(),data=profile.exists?profile.data():{};
  if(Array.isArray(data.orgMemberships)&&data.orgMemberships.includes(orgId))profileMemberships++;
  if(data.activeOrganizationId===orgId)profileActive++;
  if(data.organizationId===orgId)profileLegacy++;
  if((await user.collection('organizationRequests').doc(orgId).get()).exists)requestIndexes++;
  const result=await user.collection('teamNotices').where('orgId','==',orgId).get();notices+=result.size;
 }
 const invites=await db.collection('invites').where('orgId','==',orgId).get();
 const shares=await db.collection('publicShareConfig').where('orgId','==',orgId).get();
 let publicReports=0;
 for(const snap of shares.docs){const id=snap.data()?.publicId;if(typeof id==='string'&&id&&!id.includes('/')&&(await db.doc('publicReports/'+id).get()).exists)publicReports++;}
 return {
  workspaceRootExists:rootSnap.exists,
  workspaceCollections:Object.fromEntries(Object.entries(groups).sort(([a],[b])=>a.localeCompare(b))),
  missingParentReferences:missingParentRefs,
  scannedWorkspaceReferences:scannedRefs,
  scannedUserReferences:users.length,
  accountIndexes:{profileMemberships,profileActive,profileLegacy,requestIndexes,notices},
  externalRecords:{invites:invites.size,publicShareConfigurations:shares.size,referencedPublicReports:publicReports},
  limitations:['Read-only inventory; no records or access were changed.','Known external indexes only; unknown top-level references are not inventoried.','Storage objects, backups, downloaded files, offline caches and other Firebase projects are not inventoried.','A concurrent writer can change the inventory after it is read; it is not a deletion lock.'],
 };
}
async function main(argv){
 if(argv.length!==2)throw Error('Usage: node scripts/workspace-firestore-inventory.cjs PROJECT_ID WORKSPACE_ID');
 const [projectId,orgId]=argv;
 if(process.env.FIRESTORE_EMULATOR_HOST)throw Error('Refusing to label an emulator inventory as a live project. Unset FIRESTORE_EMULATOR_HOST for an administrator-run inventory.');
 if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))throw Error('Invalid Firebase project ID.');
 workspaceId(orgId);
 let adminApp,adminFirestore;
 try{adminApp=require('../emulator-tests/node_modules/firebase-admin/app');adminFirestore=require('../emulator-tests/node_modules/firebase-admin/firestore');}
 catch(e){throw Error('Install administrative dependencies first: npm ci --prefix emulator-tests --ignore-scripts');}
 const app=adminApp.initializeApp({projectId},'pondo-readonly-inventory');
 try{const db=adminFirestore.getFirestore(app),result=await inventoryWorkspace({db,orgId});console.log(JSON.stringify({projectId,workspaceId:orgId,...result},null,2));}
 finally{await adminApp.deleteApp(app);}
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error('Inventory failed: '+e.message);process.exitCode=1;});
module.exports={inventoryWorkspace};
