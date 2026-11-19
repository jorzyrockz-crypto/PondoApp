const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('sw.js','utf8');
const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
function setup(){
 const notices=[],images=[],timers=new Map(),clicks=[];let timerId=0,focus=0;
 const state={orgId:'org',uid:'me',role:'owner',memberConfirmed:true,members:[{uid:'actor',photoURL:'https://lh3.googleusercontent.com/profile'}]};
 const window={pondoCurrentUser:{uid:'me'},pondoTeamState:state,focus:()=>focus++};
 class Notification{static permission='granted';constructor(title,options){this.title=title;this.options=options;notices.push(this)}close(){this.closed=true}}
 class Image{constructor(){images.push(this)}set src(v){this.url=v}}
 window.Notification=Notification;
 const ctx=vm.createContext({window,Notification,Image,URL,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),openNotification:id=>clicks.push(id)});
 vm.runInContext(extract('const NOTIFICATION_ICONS=','function notificationStorageKey()')+extract('function notificationActorPhotoURL(', '\nfunction renderNotifCenter()')+extract('function notificationDeliveryAllowed(', '\nconst reviewNotificationMemory='),ctx);
 const entry={id:'id',type:'team',title:'Hello',body:'Body',recipientUid:'me',orgId:'org',actorUid:'actor'};
 return {ctx,entry,state,window,Notification,notices,images,timers,clicks,get focus(){return focus}};
}
test('category icons are packaged offline, unknown values use Pondo, and titles never decide',()=>{
 const t=setup(),kinds=['due','overdue','refund','income','expense','donation','contribution','death-aid','backup'];
 for(const kind of kinds){t.ctx.maybeFireOSNotification({...t.entry,visualKind:kind});const path=t.notices.at(-1).options.icon;assert.equal(path,`assets/notification-icons/${kind}.png`);assert.ok(fs.existsSync(path));assert.match(worker,new RegExp(path.replace(/\./g,'\\.')))}
 t.ctx.maybeFireOSNotification({...t.entry,visualKind:'https://evil.test/icon',title:'overdue refund income'});assert.equal(t.notices.at(-1).options.icon,'icons/icon-192.png');
 t.ctx.maybeFireOSNotification({...t.entry,actorUid:null});assert.equal(t.notices.at(-1).options.icon,'icons/icon-192.png');
});
test('confirmed member photo is used only for generic team activity; bad, nonmember or untrusted URLs fall back',()=>{
 const t=setup();t.ctx.maybeFireOSNotification(t.entry);assert.equal(t.images.length,1);assert.equal(t.images[0].referrerPolicy,'no-referrer');assert.equal(t.notices.length,0);t.images[0].onload();assert.equal(t.notices[0].options.icon,'https://lh3.googleusercontent.com/profile');assert.equal(t.timers.size,0);
 for(const url of ['http://lh3.googleusercontent.com/a','https://googleusercontent.com.evil.test/a','https://u:p@ggpht.com/a','https://ggpht.com:444/a','data:image/png,x','']){t.state.members[0].photoURL=url;t.ctx.maybeFireOSNotification(t.entry);assert.equal(t.notices.at(-1).options.icon,'icons/icon-192.png')}
 t.state.members=[];t.ctx.maybeFireOSNotification(t.entry);assert.equal(t.notices.at(-1).options.icon,'icons/icon-192.png');
});
test('photo errors, timeouts, changes and constructor errors fall back once',()=>{
 let t=setup();t.ctx.maybeFireOSNotification(t.entry);t.images[0].onerror();assert.equal(t.notices[0].options.icon,'icons/icon-192.png');assert.equal(t.timers.size,0);
 t=setup();t.ctx.maybeFireOSNotification(t.entry);[...t.timers.values()][0]();assert.equal(t.notices[0].options.icon,'icons/icon-192.png');assert.equal(t.images[0].onload,null);
 t=setup();t.ctx.maybeFireOSNotification(t.entry);t.state.members[0].photoURL='https://ggpht.com/changed';t.images[0].onload();assert.equal(t.notices[0].options.icon,'icons/icon-192.png');
 t=setup();t.ctx.Image=class{set src(x){throw Error('failed')}};t.ctx.maybeFireOSNotification(t.entry);assert.equal(t.notices.length,1);assert.equal(t.timers.size,0);
});
test('permission, account, workspace, membership and role are rechecked before async delivery and click',()=>{
 for(const change of [t=>t.Notification.permission='denied',t=>t.window.pondoCurrentUser.uid='other',t=>t.state.orgId='other',t=>t.state.memberConfirmed=false,t=>t.state.role=null,t=>t.state.uid='other',t=>t.state.role='reviewer']){
  const t=setup();t.ctx.maybeFireOSNotification({...t.entry,approverOnly:true});change(t);t.images[0].onload();assert.equal(t.notices.length,0);
 }
 let t=setup();t.Notification.permission='default';t.ctx.maybeFireOSNotification(t.entry);assert.equal(t.images.length,0);assert.equal(t.notices.length,0);
 t=setup();t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});assert.deepEqual({...t.notices[0].options},{body:'Body',icon:'assets/notification-icons/refund.png',tag:'id'});t.notices[0].onclick();assert.deepEqual(t.clicks,['id']);assert.equal(t.focus,1);assert.equal(t.notices[0].closed,true);
 t=setup();t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});t.state.orgId='other';t.notices[0].onclick();assert.deepEqual(t.clicks,[]);assert.equal(t.notices[0].closed,true);
});
test('structured snapshot classification is conservative for mixed, unknown and legacy updates',()=>{
 const ctx=vm.createContext({window:{}});vm.runInContext(extract('function teamActivityVisualKind(', '\nwindow.teamActivityVisualKind='),ctx);
 const classify=(previous,current,typed={},parts=['one'])=>ctx.teamActivityVisualKind(previous,current,{donations:0,deathPayments:0,...typed},parts);
 assert.equal(classify({txs:[]},{txs:[{id:'1',type:'IN'}]}),'income');assert.equal(classify({txs:[]},{txs:[{id:'1',type:'OUT'}]}),'expense');assert.equal(classify({txs:[]},{txs:[{id:'1',type:'IN',contributionPaymentId:'p'}]}),'contribution');
 assert.equal(classify({},{},{donations:1}),'donation');assert.equal(classify({},{},{deathPayments:1}),'death-aid');
 assert.equal(classify({txs:[]},{txs:[{id:'1',type:'OUT'},{id:'2',type:'IN'}]}),undefined);assert.equal(classify({},{},{donations:1},['one','two']),undefined);assert.equal(classify({},{}),undefined);assert.equal(classify({txs:[{id:'old',type:'IN'}]},{txs:[{id:'new',type:'OUT'}]}),undefined);
});
