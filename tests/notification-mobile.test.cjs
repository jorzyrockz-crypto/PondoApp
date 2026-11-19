const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('sw.js','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
class Element{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.attributes={};this.textContent=''}
 append(...nodes){this.children.push(...nodes)}
 appendChild(node){this.append(node)}
 setAttribute(k,v){this.attributes[k]=v}
 remove(){if(this.id)delete this.doc.elements[this.id]}
}
function setup(){
 const sent=[],opened=[],sounds=[],timers=new Map(),storage=new Map();let tid=0,now=10000;
 const state={orgId:'org',uid:'user',memberConfirmed:true,role:'owner',members:[]},entry={id:'n_1',title:'Refund request',body:'Please review',recipientUid:'user',orgId:'org',type:'team',action:{tab:'refunds'}};
 let visible=[entry];const win={pondoTeamState:state,pondoCurrentUser:{uid:'user'},focus:()=>{}};
 const doc={visibilityState:'visible',elements:{},getElementById(id){return this.elements[id]||null},createElement(tag){return new Element(tag,this)}};doc.body={appendChild(node){doc.elements[node.id]=node}};
 const Notification=class{static permission='granted';constructor(){throw Error('Android constructor unsupported')}};win.Notification=Notification;
 const sw={scriptURL:'https://host/PondoApp/sw.js',postMessage:data=>sent.push(data)};win.navigator={serviceWorker:{controller:sw}};win.location={href:'https://host/PondoApp/index.html'};
 const ctx=vm.createContext({window:win,document:doc,Notification,URL,Date:{now:()=>now},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},visibleNotifications:()=>visible,playSound:()=>sounds.push(1),openNotification:id=>opened.push(id),setTimeout:fn=>{timers.set(++tid,fn);return tid},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(slice('const NOTIFICATION_ICONS=','function notificationStorageKey()')+slice('function notificationActorPhotoURL(', '\nfunction renderNotifCenter()')+slice('function notificationDeliveryAllowed(', '\nconst reviewNotificationMemory='),ctx);
 return {ctx,win,state,entry,doc,Notification,sw,sent,opened,sounds,storage,setVisible:v=>visible=v,setTime:t=>now=t};
}
test('foreground banner uses text safely, sound is throttled, and click checks scope',()=>{
 const t=setup();t.entry.title='<b>Refund</b>';t.win.pondoPresentNotification(t.entry);const banner=t.doc.getElementById('pondoNotificationBanner');assert.ok(banner);assert.equal(banner.children[0].children[0].textContent,'<b>Refund</b>');assert.equal(t.sounds.length,1);
 t.win.pondoPresentNotification(t.entry);assert.equal(t.sounds.length,1);t.state.orgId='other';t.doc.getElementById('pondoNotificationBanner').children[0].onclick();assert.deepEqual(t.opened,[]);assert.equal(t.doc.getElementById('pondoNotificationBanner'),null);
 t.state.orgId='org';t.setTime(13000);t.win.pondoPresentNotification(t.entry);t.doc.getElementById('pondoNotificationBanner').children[0].onclick();assert.deepEqual(t.opened,['n_1']);assert.equal(t.sounds.length,2);
 t.doc.visibilityState='hidden';t.setTime(16000);t.win.pondoPresentNotification(t.entry);assert.equal(t.doc.getElementById('pondoNotificationBanner'),null);assert.equal(t.sounds.length,2);
});
test('Android constructor failure posts only to this app worker and respects permissions and scope',()=>{
 const t=setup();t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});assert.equal(t.sent.length,1);assert.equal(t.sent[0].type,'PONDO_SHOW_NOTIFICATION');assert.equal(t.sent[0].id,'n_1');
 t.sw.scriptURL='https://host/other/sw.js';t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});assert.equal(t.sent.length,1);
 t.sw.scriptURL='https://host/PondoApp/sw.js';t.Notification.permission='denied';t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});assert.equal(t.sent.length,1);
 t.Notification.permission='granted';t.state.memberConfirmed=false;t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});assert.equal(t.sent.length,1);
});
test('first-load worker readiness rechecks account and scope before dispatch',async()=>{
 const t=setup();let ready;t.win.navigator.serviceWorker.controller=null;t.win.navigator.serviceWorker.ready=new Promise(r=>ready=r);
 t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});t.state.orgId='other';ready({scope:'https://host/PondoApp/',active:t.sw});await new Promise(r=>setImmediate(r));assert.equal(t.sent.length,0);
 t.state.orgId='org';t.win.navigator.serviceWorker.ready=Promise.resolve({scope:'https://host/PondoApp/',active:t.sw});t.ctx.maybeFireOSNotification({...t.entry,visualKind:'refund'});await new Promise(r=>setImmediate(r));assert.equal(t.sent.length,1);
});
test('worker click checks exact recipient, workspace and approval generation',()=>{
 const t=setup(),click={type:'PONDO_NOTIFICATION_CLICK',id:'n_1',recipientUid:'user',orgId:'org',approvalKey:null};t.win.pondoHandleNotificationClick(click);assert.deepEqual(t.opened,['n_1']);
 t.state.orgId='other';t.win.pondoHandleNotificationClick(click);t.state.orgId='org';t.win.pondoCurrentUser.uid='other';t.win.pondoHandleNotificationClick(click);assert.deepEqual(t.opened,['n_1']);
 t.win.pondoCurrentUser.uid='user';const approval={id:'approved:org2',recipientUid:'user',orgId:'org2',kind:'workspaceApproval',approvalKey:'new',title:'Approved'};t.setVisible([approval]);t.win.pondoHandleNotificationClick({...click,id:approval.id,orgId:'org2',approvalKey:'old'});assert.deepEqual(t.opened,['n_1']);t.win.pondoHandleNotificationClick({...click,id:approval.id,orgId:'org2',approvalKey:'new'});assert.deepEqual(t.opened,['n_1',approval.id]);
});
test('server-backed unread notices announce once per account and remain in the inbox',()=>{
 const t=setup(),approval={id:'approved:org2',recipientUid:'user',orgId:'org2',kind:'workspaceApproval',approvalKey:'v1',title:'Approved',read:false};t.setVisible([approval]);t.win.pondoAnnounceSpecialNotices();t.win.pondoAnnounceSpecialNotices();assert.equal(t.sent.length,1);assert.ok(t.doc.getElementById('pondoNotificationBanner'));assert.equal(t.storage.size,1);
 t.setVisible([{...approval,approvalKey:'v2'}]);t.win.pondoAnnounceSpecialNotices();assert.equal(t.sent.length,2);
});
test('service worker sends system alert and routes clicks only to originating client',async()=>{
 const handlers={},alerts=[],messages=[],focus=[];const client={id:'client-1',url:'https://host/PondoApp/index.html',focus:async()=>focus.push(1),postMessage:d=>messages.push(d)};
 const self={location:{href:'https://host/PondoApp/sw.js',origin:'https://host'},registration:{scope:'https://host/PondoApp/',showNotification:async(...args)=>alerts.push(args)},clients:{get:async id=>id===client.id?client:null},addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn)};
 vm.runInNewContext(worker,{self,URL,Promise,console});const data={type:'PONDO_SHOW_NOTIFICATION',title:'Refund',body:'Review',icon:'assets/notification-icons/refund.png',id:'n_1',recipientUid:'user',orgId:'org',approvalKey:null};
 const run=async(source,d)=>{let pending;for(const fn of handlers.message)fn({data:d,source,waitUntil:p=>pending=p});if(pending)await pending};
 await run(client,data);assert.equal(alerts.length,1);assert.equal(alerts[0][1].data.clientId,'client-1');
 await run({...client,url:'https://host/other/index.html'},data);await run(client,{...data,icon:'https://evil.example/a.png'});assert.equal(alerts.length,1);
 let closed=false,pending;handlers.notificationclick[0]({notification:{data:alerts[0][1].data,close:()=>closed=true},waitUntil:p=>pending=p});await pending;assert.equal(closed,true);assert.equal(focus.length,1);assert.equal(messages[0].id,'n_1');
});
