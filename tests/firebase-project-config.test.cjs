const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),viewer=fs.readFileSync('public-report/viewer.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
function objectFrom(source,pattern){const match=source.match(pattern);assert.ok(match,'Firebase config missing');return vm.runInNewContext('('+match[1]+')');}
const main=objectFrom(html,/const firebaseConfig\s*=\s*(\{[\s\S]*?\});/),report=objectFrom(viewer,/const config\s*=\s*(\{[\s\S]*?\});/);
const expected={apiKey:'AIzaSyAUh0YYKDexZySfDqgUFS2E_UxMGFw7480',authDomain:'russapps-pondo.firebaseapp.com',projectId:'russapps-pondo',storageBucket:'russapps-pondo.firebasestorage.app',messagingSenderId:'676136086001',appId:'1:676136086001:web:ad131dcf119887da573c50',measurementId:'G-LS0LVDHVMY'};
test('main app and dormant public viewer target the requested Firebase web app',()=>{
 for(const [key,value] of Object.entries(expected)){assert.equal(main[key],value,key);assert.equal(report[key],value,key);}
 assert.doesNotMatch(html,/class-scheduler-63968/);assert.doesNotMatch(viewer,/class-scheduler-63968/);
});
test('Firebase Auth and Firestore use the configured app without silently enabling analytics',()=>{
 assert.match(html,/initializeApp\(firebaseConfig\)/);assert.match(html,/getAuth\(firebaseApp\)/);assert.match(html,/initializeFirestore\(firebaseApp/);assert.match(html,/getFirestore\(firebaseApp\)/);
 assert.doesNotMatch(html,/import\s*\{[^}]*getAnalytics/);assert.doesNotMatch(html,/getAnalytics\s*\(/);assert.match(sw,/const CACHE_VERSION = 'pondo-v\d+'/);
});
test('migration guidance warns about local isolation and does not enable public reports',()=>{
 const guidance=fs.readFileSync('docs/firebase-project-switch.md','utf8');assert.match(guidance,/not fully scoped/);assert.match(guidance,/do\s+not automatically move/);assert.match(guidance,/do not deploy its backend or enable public/);assert.match(guidance,/does not deploy `firestore.rules`/);
});
