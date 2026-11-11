const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('index.html', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

test('organization bootstrap and invite redemption use atomic writes', () => {
  const create = app.slice(app.indexOf('async function createOrganization()'), app.indexOf('async function joinWithInviteCode'));
  const join = app.slice(app.indexOf('async function joinWithInviteCode'), app.indexOf('async function joinWithPastedInput'));
  assert.match(create, /writeBatch\(firestoreDb\)/);
  assert.match(create, /await batch\.commit\(\)/);
  assert.match(join, /runTransaction\(firestoreDb/);
  assert.match(join, /transaction\.set\(memberRef/);
  assert.match(join, /transaction\.update\(inviteRef/);
  assert.match(rules, /request\.time < get\(/);
  assert.match(rules, /getAfter\(\/databases\/\$\(database\)\/documents\/invites/);
  assert.match(rules, /!exists\(\/databases\/\$\(database\)\/documents\/organizations\/\$\(orgId\)\)/);
});

test('failed team writes remain visible and debounce cannot write into another workspace', () => {
  assert.match(app, /mode === 'live' && \(pondoTeamState\.syncError \|\| pondoTeamState\.listenerError\)/);
  assert.match(app, /pondoTeamState\.syncError = true/);
  assert.match(app, /pondoTeamState\.orgId === orgId\) doPush/);
  assert.match(app, /A team save is awaiting confirmation/);
});
