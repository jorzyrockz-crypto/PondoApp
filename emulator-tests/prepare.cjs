'use strict';
// Firebase CLI disallows rules outside the emulator project directory. Use
// an exact disposable copy of the checked-in rules; tests also load the source.
const fs=require('node:fs'),path=require('node:path');
fs.copyFileSync(path.join(__dirname,'../firestore.rules'),path.join(__dirname,'firestore.generated.rules'));
