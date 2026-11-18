'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('faculty-fund-ui.js','utf8');
test('team roles offer AO and direct Faculty President assignment for an existing Viewer',()=>{
 const invite=html.match(/<select id="teamInviteRole"[\s\S]*?<\/select>/)?.[0];assert.ok(invite);
 assert.match(invite,/<option value="disbursing">Administrative Officer \(AO\)/);assert.match(invite,/<option value="reviewer">Viewer \/ Reviewer/);
 assert.match(html,/opt\.value='faculty-president';opt\.textContent='Faculty President'/);
 assert.match(html,/if\(m\.role==='reviewer'\|\|assigned\)/);
 assert.match(html,/await window\.PondoFacultyFundUI\.assignPresident\(uid,expected\)/);
 assert.match(html,/!\['owner','disbursing','project-manager','reviewer'\]\.includes\(role\)/);
 assert.match(ui,/await mutate\('assignPresident',\{presidentUid\},'transition',c\)/);
 assert.match(ui,/data\.config\?\.presidentUid===c\.uid/);
 assert.match(html,/snap\.metadata\.fromCache\|\|snap\.metadata\.hasPendingWrites/);
});
test('preview-only role selector points users to real team settings',()=>{
 const preview=html.match(/<div class="role-preview-settings">[\s\S]*?<\/div>/)?.[0];assert.ok(preview);
 assert.match(preview,/This preview does not assign a person/);assert.match(preview,/onclick="closeSettings\(\);openTeamModal\(\)"/);
 assert.match(preview,/choose Faculty President beside a Viewer/);
});
