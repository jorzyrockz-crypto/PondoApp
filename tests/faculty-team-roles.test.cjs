'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('faculty-fund-ui.js','utf8');
test('AO and President guidance uses existing team roles without falsely assigning President',()=>{
 const select=html.match(/<select id="teamInviteRole"[\s\S]*?<\/select>/)?.[0];assert.ok(select);
 assert.match(select,/<option value="disbursing">Administrative Officer \(AO\) \/ Disbursing Officer/);
 assert.match(select,/<option value="reviewer">Reviewer \(for Faculty President, assign separately\)/);
 assert.doesNotMatch(select,/value="president"/);
 assert.match(html,/Choosing Reviewer alone does not assign the President/);
 assert.match(html,/Faculty President is a separate Faculty Fund assignment, not a team role/);
 assert.match(html,/assignFacultyPresident\.hidden = pondoTeamState\.role !== 'owner'/);
 assert.match(html,/id="teamAssignFacultyPresident"[^>]*onclick="closeSettings\(\);switchTab\('funds'\);window\.PondoFacultyFundUI\?\.open\(\)"/);
 assert.match(html,/Reviewer \(President assigned separately\)/);
 assert.match(ui,/choosing Reviewer alone does not assign them/i);
 assert.match(ui,/data\.config\?\.presidentUid===c\.uid/);
});
test('preview-only role selector points users to real team settings',()=>{
 const preview=html.match(/<div class="role-preview-settings">[\s\S]*?<\/div>/)?.[0];assert.ok(preview);
 assert.match(preview,/This preview does not assign a person/);assert.match(preview,/onclick="switchSettingsTab\('team'\)"/);
 assert.match(preview,/Faculty President.*assign them separately/);
});
