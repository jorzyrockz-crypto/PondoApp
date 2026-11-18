'use strict';
// Offline, read-only text comparison. This neither retrieves nor deploys rules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {TextDecoder}=require('node:util');
const {generate}=require('./generate-faculty-release-candidate.cjs');
const {generate:generateRecovery}=require('./generate-faculty-recovery-candidate.cjs');
const root=path.resolve(__dirname,'..'),maxBytes=2*1024*1024;
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function readRules(file){
 const stat=fs.statSync(file);if(!stat.isFile()||stat.size===0||stat.size>maxBytes)throw Error('Expected a nonempty regular text file no larger than 2 MiB');
 const bytes=fs.readFileSync(file);if(!bytes.length||bytes.length>maxBytes)throw Error('Rules file size changed or exceeds 2 MiB');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('Rules file must be valid UTF-8 text')}
 if(text.includes('\0'))throw Error('Rules file contains a NUL byte');return {bytes,text,hash:digest(bytes)};
}
function compare(publishedPath,showDiff=false){
 const published=readRules(publishedPath),config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
 const activePath=config?.firestore?.rules;if(typeof activePath!=='string'||!activePath||path.isAbsolute(activePath)||!path.resolve(root,activePath).startsWith(root+path.sep))throw Error('Unexpected Firebase rules path; review firebase.json manually');
 const sources=[['Firebase configured repository rules',activePath],['Repository test rules','firestore.faculty-test.rules'],['Undeployed release candidate','firestore.faculty-release-candidate.rules'],['Undeployed recovery candidate','firestore.faculty-recovery-candidate.rules']].map(([name,file])=>({name,file:path.join(root,file),...readRules(path.join(root,file))}));
 const generated=generate(sources[1].text),currentCandidate=sources[2].bytes.equals(Buffer.from(generated,'utf8'));
 const lines=['OFFLINE TEXT COMPARISON ONLY — NOT APPROVAL OR A DEPLOYMENT',
 'The supplied file is not verified as the currently published rules. Confirm the project, database, published version and retrieval time independently.',
 `Supplied file SHA-256: ${published.hash}`];
 for(const source of sources)lines.push(`${source.name} (${path.relative(root,source.file)}): ${source.bytes.equals(published.bytes)?'EXACT BYTE MATCH':'DIFFERENT'}; SHA-256 ${source.hash}`);
 lines.push(`Release candidate matches its test-rules generator: ${currentCandidate?'YES':'NO — regenerate and review before comparing'}`,
 `Recovery candidate matches its generator: ${sources[3].bytes.equals(Buffer.from(generateRecovery(),'utf8'))?'YES':'NO — regenerate and review before comparing'}`,
 'Text equality or differences do not establish effective permissions, completeness, safety, or production readiness.',
 'Review the entire difference against the supplied published copy, including ordinary workspace access and overlapping matches. Do not deploy from this report.');
 if(showDiff){
  // Git is invoked without a shell, network, external diff driver or textconv.
  // The output may contain the entire supplied rules text; never upload it automatically.
  const diff=spawnSync('git',['--no-pager','diff','--no-index','--no-color','--no-ext-diff','--no-textconv','--',path.resolve(publishedPath),sources[3].file],{encoding:'utf8',maxBuffer:16*1024*1024});
  if(diff.error||![0,1].includes(diff.status))throw Error('Unable to produce local diff: '+(diff.error?.message||diff.stderr||`git exited ${diff.status}`));
  lines.push('\n--- Local diff: supplied file → recovery candidate (may contain full rules) ---',diff.stdout||'(no byte differences)');
 }else lines.push('For a local full text diff, rerun with --diff. The output may contain all rules; keep it private.');
 // Avoid emitting a report if a file changed during the comparison. This is
 // not an atomic snapshot or proof of what was published remotely.
 if(!readRules(publishedPath).bytes.equals(published.bytes)||sources.some(x=>!readRules(x.file).bytes.equals(x.bytes)))throw Error('Rules changed during comparison; retry with stable files');
 return lines.join('\n');
}
function main(args){
 if(args.length<1||args.length>2||args[0].startsWith('--')||(args.length===2&&args[1]!=='--diff'))throw Error('Usage: node scripts/compare-faculty-rules.cjs <published-rules-file> [--diff]');
 console.log(compare(args[0],args[1]==='--diff'));
}
if(require.main===module){try{main(process.argv.slice(2))}catch(e){console.error('Comparison failed:',e.message);process.exitCode=2;}}
module.exports={compare,readRules,main};
