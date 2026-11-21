'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
test('regular team roles remain available without Faculty President assignment',()=>{
 const invite=html.match(/<select id="teamInviteRole"[\s\S]*?<\/select>/)?.[0];assert.ok(invite);
 assert.match(invite,/<option value="disbursing">Administrative Officer \(AO\)/);assert.match(invite,/<option value="reviewer">Viewer \/ Reviewer/);
 assert.match(html,/!\['owner','disbursing','project-manager','reviewer'\]\.includes\(role\)/);
 assert.doesNotMatch(html,/faculty-president|assignPresident|startFacultyWatch|facultyPresidentUid/);
});
test('preview-only role selector points users to real team settings',()=>{
 const preview=html.match(/<div class="role-preview-settings">[\s\S]*?<\/div>/)?.[0];assert.ok(preview);
 assert.match(preview,/This preview does not assign a person/);assert.match(preview,/onclick="closeSettings\(\);openTeamModal\(\)"/);
});
