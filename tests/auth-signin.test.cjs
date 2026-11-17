const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const flow=html.slice(html.indexOf('function isStandalonePwa()'),html.indexOf('// Shared sign-out action:'));
const redirect=html.slice(html.indexOf('const redirectWasPending=hasPendingRedirect();'),html.indexOf('onAuthStateChanged(auth, (user) => {'));
function harness({standalone=true,ua='Mozilla/5.0 (Windows NT 10.0) Chrome/130',mobileStandalone=false,popupError=null,redirectError=null,pending=false,result=null,currentUser=null,href='https://example.test/',clipboard=null}={}){
  let calls=[],storage=new Map(pending?[['ft_auth_redirect_pending','1']]:[]),button={disabled:false,addEventListener(){}},status={textContent:''},error={hidden:true,textContent:''},fallback={hidden:true},fallbackBtn={addEventListener(){}};
  const auth={currentUser,authStateReady:async()=>{}};
  const panel={hidden:true},field={value:'',focus(){this.focused=true},select(){this.selected=true}},copyStatus={textContent:''},copyButton={addEventListener(){}};
  const elements={authBrowserHelp:panel,authBrowserLink:field,authBrowserCopyStatus:copyStatus,authCopyBrowserLink:copyButton};
  let c=vm.createContext({window:{navigator:{userAgent:ua,standalone:mobileStandalone,platform:'Win32',maxTouchPoints:0,clipboard},matchMedia:()=>({matches:standalone}),open(){}},document:{referrer:'',getElementById:id=>elements[id]||null},URL,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},auth,googleProvider:{},authSignInBtn:button,authStatusText:status,authError:error,authManualFallback:fallback,authManualFallbackBtn:fallbackBtn,location:{href},setTimeout:()=>1,clearTimeout(){},console:{warn(){}},setGateBusy:(v,m)=>{button.disabled=v;status.textContent=m||''},showAuthError:m=>{error.hidden=false;error.textContent=m},signInWithPopup:async()=>{calls.push('popup');if(popupError)throw popupError},signInWithRedirect:async()=>{calls.push('redirect');if(redirectError)throw redirectError},getRedirectResult:async()=>{if(redirectError)throw redirectError;return result;}});
  vm.runInContext(flow,c);return {c,button,status,error,fallback,calls,storage,panel,field,copyStatus,run:s=>vm.runInContext(s,c)};
}
test('desktop installed Chrome attempts popup directly',async()=>{let t=harness();await t.run('handleSignIn()');assert.deepEqual(t.calls,['popup']);assert.equal(t.button.disabled,false);});
test('desktop installed popup block offers retry and does not redirect silently',async()=>{let t=harness({popupError:{code:'auth/popup-blocked'}});await t.run('handleSignIn()');assert.deepEqual(t.calls,['popup']);assert.equal(t.button.disabled,false);assert.match(t.error.textContent,/pop-ups/);assert.equal(t.fallback.hidden,false)});
test('Android installed app uses a popup instead of redirect',async()=>{
 let t=harness({ua:'Mozilla/5.0 Android Chrome'});await t.run('handleSignIn()');
 assert.deepEqual(t.calls,['popup']);assert.equal(t.storage.has('ft_auth_redirect_pending'),false);assert.equal(t.button.disabled,false);assert.equal(t.error.hidden,true);
});
test('Android installed popup errors offer browser fallback without redirecting',async()=>{
 for(const code of ['auth/popup-blocked','auth/operation-not-supported-in-this-environment']){
  let t=harness({ua:'Mozilla/5.0 Android Chrome',popupError:{code}});await t.run('handleSignIn()');
  assert.deepEqual(t.calls,['popup']);assert.equal(t.storage.has('ft_auth_redirect_pending'),false);assert.equal(t.button.disabled,false);assert.equal(t.fallback.hidden,false);assert.match(t.error.textContent,/pop-ups/);
 }
});
test('browser popup block tries redirect and clears marker on failure',async()=>{let t=harness({standalone:false,popupError:{code:'auth/popup-blocked'},redirectError:{message:'network issue'}});await t.run('handleSignIn()');assert.deepEqual(t.calls,['popup','redirect']);assert.equal(t.storage.has('ft_auth_redirect_pending'),false);assert.match(t.error.textContent,/network issue/);assert.equal(t.button.disabled,false)});
test('closed popup enables retry without an error',async()=>{let t=harness({popupError:{code:'auth/popup-closed-by-user'}});await t.run('handleSignIn()');assert.equal(t.button.disabled,false);assert.equal(t.error.hidden,true)});
test('unfinished redirect reports missing session and removes marker',async()=>{let t=harness({pending:true});t.run(redirect);await new Promise(r=>setImmediate(r));assert.match(t.error.textContent,/without a session/);assert.equal(t.storage.has('ft_auth_redirect_pending'),false);assert.equal(t.button.disabled,false)});
test('successful redirect and ordinary visits do not show missing-session error',async()=>{for(let opts of [{pending:true,result:{user:{uid:'1'}}},{pending:true,currentUser:{uid:'1'}},{pending:false}]){let t=harness(opts);t.run(redirect);await new Promise(r=>setImmediate(r));assert.equal(t.error.hidden,true)}});
test('redirect errors are shown and allow retry',async()=>{let t=harness({pending:true,redirectError:{message:'redirect failed'}});t.run(redirect);await new Promise(r=>setImmediate(r));assert.match(t.error.textContent,/redirect failed/);assert.equal(t.button.disabled,false);assert.equal(t.storage.has('ft_auth_redirect_pending'),false)});
test('redirect recovery blocks overlapping sign-in until it finishes',async()=>{
 let t=harness({pending:true}),finish;t.c.getRedirectResult=()=>new Promise(resolve=>{finish=resolve});t.run(redirect);
 assert.equal(t.button.disabled,true);await t.run('handleSignIn()');assert.deepEqual(t.calls,[]);
 finish(null);await new Promise(r=>setImmediate(r));assert.equal(t.button.disabled,false);assert.match(t.error.textContent,/without a session/);
});
test('Android browser popup failure may use redirect and clears the marker if redirect fails',async()=>{
 let t=harness({standalone:false,ua:'Mozilla/5.0 Android Chrome',popupError:{code:'auth/popup-blocked'},redirectError:{message:'offline'}});
 await t.run('handleSignIn()');assert.deepEqual(t.calls,['popup','redirect']);assert.equal(t.storage.has('ft_auth_redirect_pending'),false);assert.equal(t.button.disabled,false);assert.match(t.error.textContent,/offline/);
});
test('Android installed popup failure is surfaced and retry remains available',async()=>{
 let t=harness({ua:'Mozilla/5.0 Android Chrome',popupError:{code:'auth/network-request-failed',message:'offline'}});
 await t.run('handleSignIn()');assert.deepEqual(t.calls,['popup']);assert.equal(t.storage.has('ft_auth_redirect_pending'),false);assert.equal(t.button.disabled,false);assert.equal(t.fallback.hidden,false);assert.match(t.error.textContent,/offline/);
});

test('Messenger or Instagram in-app browsers show a safe copyable invitation without redirecting',async()=>{
 for(const ua of ['Mozilla/5.0 Android [FB_IAB/FB4A;FBAV/480]', 'Mozilla/5.0 iPhone [FBAN/MessengerForiOS;FBAV/480]', 'Mozilla/5.0 Instagram 300']){
  const t=harness({standalone:false,ua,href:'https://example.test/PondoApp/?invite=SecretCode&extra=private#oauth-fragment'});
  assert.equal(t.panel.hidden,false);assert.equal(t.field.value,'https://example.test/PondoApp/?invite=SecretCode');
  await t.run('handleSignIn()');assert.deepEqual(t.calls,[]);assert.match(t.error.textContent,/Chrome or Safari/);
 }
});
test('browser link copy has clipboard and manual selection fallbacks',async()=>{
 let copied;const t=harness({ua:'FBAN/MessengerForiOS',href:'https://example.test/app?invite=abc',clipboard:{writeText:async value=>{copied=value}}});
 await t.run('copyEmbeddedBrowserLink()');assert.equal(copied,'https://example.test/app?invite=abc');assert.match(t.copyStatus.textContent,/copied/i);
 const fallback=harness({ua:'FB_IAB',clipboard:{writeText:async()=>{throw Error('denied')}}});await fallback.run('copyEmbeddedBrowserLink()');assert.equal(fallback.field.selected,true);assert.match(fallback.copyStatus.textContent,/Select and copy/);
});
test('normal Chrome is not classified as an in-app browser',()=>{const t=harness({standalone:false,ua:'Mozilla/5.0 (Linux; Android 13) Chrome/130 Mobile'});assert.equal(t.panel.hidden,true);});
