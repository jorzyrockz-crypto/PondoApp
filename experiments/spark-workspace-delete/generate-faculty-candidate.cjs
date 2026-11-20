'use strict';
// Generate isolated experimental rules fixtures only; never deploy targets.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),here=__dirname,base=fs.readFileSync(path.join(here,'firestore.rules'),'utf8');
if(!base.endsWith('  }\n}\n'))throw Error('Base rules layout changed; review generator.');
const fixtures=[
 {file:'firestore.faculty-test.rules',marker:'\n    // TEST ONLY: experimental Faculty Fund; fictitious records only.\n',guard:'function signed(o) { return o.matches(\'^org~faculty fund test .+$\') && request.auth != null && exists(member(o,request.auth.uid)); }',replacement:'function signed(o) { return o.matches(\'^org~faculty fund test .+$\') && request.auth != null && orgActive(o) && exists(member(o,request.auth.uid)); }'},
 ...['firestore.faculty-release-candidate.rules','firestore.faculty-recovery-candidate.rules'].map(file=>({file,marker:'\n    // CANDIDATE ONLY: activated workspaces, pending review and safe recovery.\n',guard:'return request.auth != null && exists(member(o,request.auth.uid))\n    && (o.matches',replacement:'return request.auth != null && orgActive(o) && exists(member(o,request.auth.uid))\n    && (o.matches',release:true})),
];
function replaceOnce(source,old,next){if(source.split(old).length!==2)throw Error('Expected exactly one guard; review generator.');return source.replace(old,()=>next);}
for(const f of fixtures){
 const original=fs.readFileSync(path.join(root,f.file),'utf8');if(original.split(f.marker).length!==2)throw Error('Rules layout changed; review generator: '+f.file);
 let suffix=original.slice(original.indexOf(f.marker));suffix=replaceOnce(suffix,f.guard,f.replacement);
 if(f.release)suffix=replaceOnce(suffix,"allow read: if id == 'current' && request.auth != null && exists(member(o,request.auth.uid));","allow read: if id == 'current' && request.auth != null && orgActive(o) && exists(member(o,request.auth.uid));");
 const output=base.slice(0,-6)+suffix;
 const target=path.join(here,f.file);
 if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error('Experimental fixture is stale: '+f.file);}
 else fs.writeFileSync(target,output);
}
