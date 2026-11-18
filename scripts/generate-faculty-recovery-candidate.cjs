'use strict';
// Generates an UNDEPLOYED review candidate. This script does not contact Firebase.
// It still lacks a self-contained backup, proven complete inventory, and a
// reviewed comparison with the actual published rules. Never deploy by script.
const fs=require('node:fs'),path=require('node:path');
const {rules}=require('../emulator-tests/faculty-spark-integrated-restore.rules.cjs');
function generate(){const text=rules(),before="// RELEASE CANDIDATE FOR REVIEW ONLY — NOT APPROVED FOR DEPLOYMENT.";if(!text.includes(before))throw Error('Unexpected recovery candidate source');return text.replace(before,()=>before+'\n// OWNER RECOVERY REVIEW CANDIDATE — not production-ready or deployed.').replace('  // ISOLATED restore proof; not a deployable rules candidate.','  // Recovery review rules: not approved for deployment.');}
if(require.main===module)fs.writeFileSync(path.join(__dirname,'../firestore.faculty-recovery-candidate.rules'),generate());
module.exports={generate};
