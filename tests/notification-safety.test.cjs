const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function storage(){const m=new Map();return {m,getItem:k=>m.get(String(k))??null,setItem:(k,v)=>m.set(String(k),String(v)),removeItem:k=>m.delete(String(k))};}
function setupFeed(){
 const ls=storage(),state={orgId:'a',role:'owner',memberConfirmed:true},win={pondoCurrentUser:{uid:'u1'},pondoTeamState:state};
 const code=html.slice(html.indexOf('const NOTIF_MAX=60;'),html.indexOf('function notifTimeAgo('));
 const ctx=vm.createContext({window:win,localStorage:ls,document:{getElementById:()=>null},maybeFireOSNotification(){},renderNotifCenter(){},Date,Math});vm.runInContext(code,ctx);return {ctx,ls,state,win};
}
test('feeds are isolated by account and workspace and legacy entries never leak',()=>{
 const t=setupFeed(),c=t.ctx;t.ls.setItem('ft_notifications_v1',JSON.stringify([{id:'old',title:'Sensitive old alert'}]));
 c.pushNotification({title:'Team A'});assert.equal(c.visibleNotifications().length,1);t.state.orgId='b';assert.equal(c.visibleNotifications().length,0);c.pushNotification({title:'Team B'});t.win.pondoCurrentUser.uid='u2';assert.equal(c.visibleNotifications().length,0);c.pushNotification({title:'User two'});
 t.win.pondoCurrentUser.uid='u1';t.state.orgId='a';assert.equal(c.visibleNotifications()[0].title,'Team A');assert.equal(t.ls.m.has('ft_notifications_v1'),true);
});
test('role restrictions hide approver alerts without changing their read state',()=>{
 const t=setupFeed(),c=t.ctx;c.pushNotification({title:'Review',approverOnly:true});t.state.role='reviewer';assert.equal(c.visibleNotifications().length,0);c.markAllNotificationsRead();t.state.role='owner';assert.equal(c.unreadNotificationCount(),1);
});
test('unavailable notification storage does not report success',()=>{
 const t=setupFeed();t.ls.setItem=()=>{throw Error('quota')};assert.equal(t.ctx.pushNotification({title:'Test'}),null);
});
test('contribution reminders use workspace-scoped keys and re-arm after status or date changes',()=>{
 const ls=storage(),events=[],state={orgId:'a'},win={pondoCurrentUser:{uid:'u'},pondoTeamState:state};
 const a={id:'activity',title:'Dues',dueDate:'2026-01-01',label:'Due soon'};
 const code=html.slice(html.indexOf('function reminderStorageKey('),html.indexOf('\nasync function toggleContributionArchive'));
 const ctx=vm.createContext({window:win,localStorage:ls,document:{getElementById:()=>null},funds:[],txs:[],projects:[],sigs:[],contributionActivities:[a],org:{name:'Your organization'},pushNotification:n=>{if(n.action?.tab==='contributions')events.push(n);return n},contributionTotals:()=>({}),contributionDueInfo:a=>({label:a.label})});win.pushNotification=ctx.pushNotification;vm.runInContext(code,ctx);
 ctx.checkReminderNotifications();ctx.checkReminderNotifications();assert.equal(events.length,1);a.dueDate='2026-02-01';ctx.checkReminderNotifications();assert.equal(events.length,2);
 a.label='Paid';ctx.checkReminderNotifications();a.label='Due soon';ctx.checkReminderNotifications();assert.equal(events.length,3);
 state.orgId='b';ctx.checkReminderNotifications();assert.equal(events.length,4);state.orgId='a';ctx.checkReminderNotifications();assert.equal(events.length,4);
});
test('backup export, snooze and reminders all use account and workspace keys',()=>{
 assert.match(html,/reminderStorageKey\('ft_last_backup_ts'\)/);assert.match(html,/reminderStorageKey\('ft_backup_reminder_until'\)/);assert.match(html,/reminderStorageKey\('ft_backup_overdue_notified'\)/);
});
test('unknown or unconfirmed membership cannot generate team alerts',()=>{
 const t=setupFeed();t.state.memberConfirmed=false;assert.equal(t.ctx.pushNotification({title:'Team update'}),null);t.state.memberConfirmed=true;assert.ok(t.ctx.pushNotification({title:'Team update'}));
});
