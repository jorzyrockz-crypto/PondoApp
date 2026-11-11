const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const flow=html.slice(html.indexOf('function isStandalonePwa()'),html.indexOf('// Shared sign-out action:'));
const redirect=html.slice(html.indexOf('const redirectWasPending=hasPendingRedirect();'),html.indexOf('onAuthStateChanged(auth, (user) => {'));
function harness({standalone=true,ua='Mozilla/5.0 (Windows NT 10.0) Chrome/130',mobileStandalone=false,popupError=null,redirectError=null,pending=false,result=null,currentUser=null}={}){
  let calls=[],storage=new Map(pending?[['ft_auth_redirect_pending','1']]:[]),button={disabled:false,addEventListener(){}},status={textContent:''},error={hidden:true,textContent:''},fallback={hidden:true},fallbackBtn={addEventListener(){}};
  const auth={currentUser,authStateReady:async()=>{}};
  let c=vm.createContext({window:{navigator:{userAgent:ua,standalone:mobileStandalone,platform:'Win32',maxTouchPoints:0},matchMedia:()=>({matches:standalone}),open(){}},document:{referrer:''},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},auth,googleProvider:{},authSignInBtn:button,authStatusText:status,authError:error,authManualFallback:fallback,authManualFallbackBtn:fallbackBtn,location:{href:'https://example.test/'},setTimeout:()=>1,clearTimeout(){},console:{warn(){}},setGateBusy:(v,m)=>{button.disabled=v;status.textContent=m||''},showAuthError:m=>{error.hidden=false;error.textContent=m},signInWithPopup:async()=>{calls.push('popup');if(popupError)throw popupError},signInWithRedirect:async()=>{calls.push('redirect');if(redirectError)throw redirectError},getRedirectResult:async()=>{if(redirectError)throw redirectError;return result;}});
  vm.runInContext(flow,c);return {c,button,status,error,fallback,calls,storage,run:s=>vm.runInContext(s,c)};
}
test('desktop installed Chrome attempts popup directly',async()=>{let t=harness();await t.run('handleSignIn()');assert.deepEqual(t.calls,['popup']);assert.equal(t.button.disabled,false);});
test('desktop installed popup block offers retry and does not redirect silently',async()=>{let t=harness({popupError:{code:'auth/popup-blocked'}});await t.run('handleSignIn()');assert.deepEqual(t.calls,['popup']);assert.equal(t.button.disabled,false);assert.match(t.error.textContent,/pop-ups/);assert.equal(t.fallback.hidden,false)});
test('mobile installed app retains redirect and marks the attempt',async()=>{let t=harness({ua:'Mozilla/5.0 Android Chrome'});await t.run('handleSignIn()');assert.deepEqual(t.calls,['redirect']);assert.equal(t.storage.get('ft_auth_redirect_pending'),'1')});
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
test('a rejected mobile redirect clears the pending marker and allows retry',async()=>{
 let t=harness({ua:'Mozilla/5.0 Android Chrome',redirectError:{message:'offline'}});await t.run('handleSignIn()');assert.equal(t.storage.has('ft_auth_redirect_pending'),false);assert.equal(t.button.disabled,false);assert.match(t.error.textContent,/offline/);
});
