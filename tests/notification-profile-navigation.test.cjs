const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function source(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));}
function env(){
 const state={orgId:'org',memberConfirmed:true,baselineReady:true,role:'owner',members:[{uid:'actor',displayName:'Leonard Fuentes',photoURL:'https://lh3.googleusercontent.com/a/photo'}]};
 const events=[],n={id:'n',type:'team',orgId:'org',actorUid:'actor',body:'1 new contribution payment',action:{tab:'contributions',activityId:'a',period:'2026-11'}};
 const ctx=vm.createContext({window:{pondoTeamState:state},URL,document:{body:{classList:{contains:()=>false}},getElementById:()=>null,querySelector:()=>null},visibleNotifications:()=>[n],markNotificationRead:id=>events.push(['read',id]),renderNotifCenter:()=>events.push(['render']),closeNotifCenter:()=>events.push(['close']),switchTab:t=>events.push(['tab',t]),openContributionDetails:id=>events.push(['details',id]),appAlert:msg=>events.push(['alert',msg]),contributionActivities:[{id:'a',monthlyPeriods:['2026-10','2026-11']}],contributionSelectedPeriod:{}});
 vm.runInContext(source('function escapeTeamText(', '\nfunction ',)+'\n'+source('function notifActorAvatar(', '\nfunction renderNotifCenter(')+source('function notificationAction(', '\nwindow.openNotification='),ctx);
 return {ctx,state,events,n};
}
test('team avatar resolves only confirmed current workspace members and safely falls back',()=>{
 const {ctx,state,n}=env();let avatar=ctx.notifActorAvatar(n);assert.match(avatar,/LF/);assert.match(avatar,/https:\/\/lh3\.googleusercontent\.com/);assert.match(avatar,/referrerpolicy="no-referrer"/);
 state.members[0].photoURL='https://evil.example/googleusercontent.com/?x=" onerror="alert(1)';assert.doesNotMatch(ctx.notifActorAvatar(n),/<img/);
 state.members[0].photoURL='javascript:alert(1)';state.members[0].displayName='<script> Evil';avatar=ctx.notifActorAvatar(n);assert.doesNotMatch(avatar,/<script>|<img/);assert.match(avatar,/&lt;E/);
 state.memberConfirmed=false;assert.match(ctx.notifActorAvatar(n),/<svg/);state.memberConfirmed=true;state.orgId='other';assert.match(ctx.notifActorAvatar(n),/<svg/);state.orgId='org';state.members=[];assert.match(ctx.notifActorAvatar(n),/<svg/);delete n.actorUid;assert.match(ctx.notifActorAvatar(n),/<svg/);
});
test('specific matching contribution opens safely, marks read, and selects period',()=>{
 const {ctx,events}=env();ctx.openNotification('n');assert.deepEqual(events,[['read','n'],['render'],['close'],['tab','contributions'],['details','a']]);assert.equal(ctx.contributionSelectedPeriod.a,'2026-11');
});
test('missing activity, unsynced or different workspace never opens a specific record',()=>{
 for(const change of ['missing','dirty','unconfirmed','other']){const {ctx,state,events}=env();if(change==='missing')ctx.contributionActivities=[];if(change==='dirty')state.dirty=true;if(change==='unconfirmed')state.memberConfirmed=false;if(change==='other')state.orgId='other';ctx.openNotification('n');assert.ok(events.some(e=>e[0]==='tab'));assert.ok(!events.some(e=>e[0]==='details'));}
});
test('legacy summaries route usefully while existing actions stay intact',()=>{
 const {ctx}=env();for(const [body,tab] of [['1 new contribution payment','contributions'],['1 new contribution activity','contributions'],['1 cash donation','transactions'],['2 new projects','projects'],['1 new fund','funds'],['Shared records were updated.','dashboard']])assert.equal(ctx.notificationAction({type:'team',body}).tab,tab);
 assert.equal(ctx.notificationAction({type:'team',body:'1 new contribution payment',action:{tab:'transactions',audit:true}}).tab,'transactions');assert.equal(ctx.notificationAction({type:'reminder',action:{tab:'contributions'}}).tab,'contributions');assert.equal(ctx.notificationAction({type:'reminder'}),null);assert.equal(ctx.notificationAction({type:'team',action:{tab:'malicious'}}).tab,'dashboard');
});
test('modal defers navigation and read state; hidden notification is ignored',()=>{
 const {ctx,events}=env();ctx.document.body.classList.contains=()=>true;ctx.openNotification('n');assert.equal(events[0][0],'alert');assert.ok(!events.some(e=>e[0]==='read'));events.length=0;ctx.openNotification('unknown');assert.equal(events.length,0);
});
test('snapshot routing identifies only unambiguous activities and periods',()=>{
 const c=vm.createContext({});vm.runInContext(source('function teamActivityAction(', '\nwindow.teamActivityAction='),c);const plain=x=>JSON.parse(JSON.stringify(x));
 const before={contributionActivities:[{id:'a',monthlyPeriods:['2026-10','2026-11']}],contributors:[{id:'p',activityId:'a',period:'2026-11'},{id:'q',activityId:'a',period:'2026-10'}],contributionPayments:[]};
 const after={...before,contributionPayments:[{id:'pay',contributorId:'p'}]};assert.deepEqual(plain(c.teamActivityAction(before,after,{})),{tab:'contributions',activityId:'a',period:'2026-11'});
 assert.deepEqual(plain(c.teamActivityAction(before,{...after,contributionPayments:[...after.contributionPayments,{id:'pay2',contributorId:'q'}]},{})),{tab:'contributions'});
 assert.deepEqual(plain(c.teamActivityAction(before,{...after,contributionPayments:[{id:'pay',contributorId:'missing'}]},{})),{tab:'contributions'});
 assert.deepEqual(plain(c.teamActivityAction(before,after,{deathPayments:1})),{tab:'transactions'});
 assert.deepEqual(plain(c.teamActivityAction({}, {projects:[{id:'p'}]},{})),{tab:'projects'});
 assert.deepEqual(plain(c.teamActivityAction({}, {},{})),{tab:'dashboard'});
});
test('notification markup uses native button, escaped IDs and photo error fallback',()=>{
 assert.match(html,/data-notif-id="'\+escapeTeamText\(n.id\)/);assert.match(html,/openNotification\(this.dataset.notifId\)/);assert.match(html,/img.addEventListener\('error',\(\)=>\{img.hidden=true\}/);assert.match(html,/actorUid:typeof updatedBy==='string'\?updatedBy:null/);
});
test('Faculty Fund notification opens the fund workspace and its dedicated section',()=>{
 const {ctx,events,n}=env();n.action={tab:'funds',facultyFund:true};ctx.window.PondoFacultyFundUI={open:()=>events.push(['faculty'])};ctx.openNotification('n');assert.ok(events.some(e=>e[0]==='tab'&&e[1]==='funds'));assert.ok(events.some(e=>e[0]==='faculty'));
});
