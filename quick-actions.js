/* Quick actions route to existing workflows; no financial records are written here. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),overlay=$('quickActionOverlay'),dialog=$('quickActionDialog'),query=$('quickActionQuery'),list=$('quickActionList'),status=$('quickActionStatus');
 let previousFocus=null,scope=null,closing=false,timer=null,matches=[],matchKind='exact',stage='actions',chosenActivity='',chosenMonth='';
 // The key that opens the dialog or selects a result must be released before
 // another Enter can act. A held key can otherwise repeat into the next form.
 let enterHeld=false,guardEnter=false;
 document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.isComposing)return;
  if(guardEnter&&(e.repeat||enterHeld)){e.preventDefault();e.stopImmediatePropagation();return;}
  enterHeld=true;
  if(!overlay.hidden&&e.target instanceof Element&&dialog.contains(e.target))guardEnter=true;
 },true);
 document.addEventListener('keyup',e=>{if(e.key==='Enter'){enterHeld=false;guardEnter=false}},true);
 window.addEventListener('blur',()=>{enterHeld=false;guardEnter=false});
 const items=[
  {id:'fund',title:'Add a fund',description:'Create a regular fund source.',keywords:'fund new create source'},
  {id:'project',title:'Add a project',description:'Create a project for the workspace.',keywords:'project new create'},
  {id:'activity',title:'Create a contribution activity',description:'Set up an activity for contributions.',keywords:'contribution activity new create dues'},
  {id:'income',title:'Record income',description:'Add money received by a fund.',keywords:'income received money deposit fund transaction'},
  {id:'expense',title:'Record an expense',description:'Record a payment from a fund.',keywords:'expense spent payment pay purchase out transaction'},
  {id:'unpaid',title:'Record an unpaid supplier bill',description:'Record an unpaid expense for a project; no cash is paid yet.',keywords:'unpaid supplier invoice bill payable project'},
  {id:'refund',title:'Request or record a refund',description:'Start a reimbursement request or record.',keywords:'refund reimburse reimbursement request advance'},
  {id:'donation',title:'Record a cash donation',description:'Add or link a donation receipt.',keywords:'donation donor gift cash received'},
  {id:'contribution',title:'Record a contribution payment',description:'Choose an activity and contributor.',keywords:'contribution dues member payment collection'},
  {id:'other',title:'Record an Other Funds payment',description:'Add a receipt in the separate Other Funds register.',keywords:'other funds payment teacher leave absence receipt'},
  {id:'death-aid',title:'Find or create a Death Aid record',description:'Find or create a separate Death Aid record, then record payments.',keywords:'death aid bereavement deceased memorial'},
  {id:'fund-balance',title:'View workspace fund balance',description:'See regular and donation fund cash across all dates.',keywords:'request account balance fund money cash total'},
  {id:'member-balance',title:'Review individual account records',description:'Prepare a member statement; no combined net balance is calculated.',keywords:'request account balance individual member statement'},
  {id:'cash-report',title:'Print a cash financial report',description:'Review fund and date filters before printing.',keywords:'print financial statement report cash pdf'},
  {id:'member-statement',title:'Print an individual account statement',description:'Review a member’s matching records before printing.',keywords:'print financial statement individual member pdf'}
 ];
 // Curated action phrases are local UI vocabulary, not workspace data. They are
 // intentionally tied to one workflow and do not imply that cash was paid.
 const synonyms={
  fund:['new fund','create fund','fund source','add fund source','set up fund','open a fund','regular fund','start a fund','create cash fund','new funding source','pondong bago','dagdag pondo'],
  project:['new project','create project','start project','set up project','add project','project setup','register a project','new initiative','create initiative','project tracker','bagong proyekto','dagdag proyekto'],
  activity:['new contribution activity','create dues tracker','start collection activity','set up contributions','create contribution drive','new dues activity','contribution tracker','create member collection','start fundraising activity','set up a collection','bagong kontribusyon','gawa ng koleksyon'],
  income:['add income','money received','cash received by fund','fund income','record a deposit','incoming funds','record revenue','cash inflow','money in','receive payment into fund','kita ng pondo','pasok na pera'],
  expense:['paid expense','money spent','fund disbursement','cash outflow','money out','record a purchase','pay from fund','paid transaction','expense already paid','record fund spending','gastos ng pondo','labas na pera'],
  unpaid:['unpaid bill','supplier bill','supplier invoice','outstanding invoice','unpaid expense','record accounts payable','bill not yet paid','project supplier expense','invoice to pay later','record a payable','hindi pa bayad na bill','utang sa supplier'],
  refund:['request reimbursement','refund request','record reimbursement','personal advance','reimburse a person','claim expenses','refund for personal purchase','expense reimbursement','money owed to member','paid out of pocket','kahilingan sa refund','bayad mula sa sariling pera'],
  donation:['cash donation','donation receipt','record a donor','money donated','receive a donation','donor contribution','donated cash','cash gift','record donation income','link donation receipt','donasyong pera','tanggap na donasyon'],
  contribution:['member contribution payment','pay contribution','member dues payment','record dues','collection payment','pay activity dues','contributor payment','record membership contribution','member payment','pay contribution activity','bayad sa kontribusyon','hulog ng miyembro'],
  other:['other funds receipt','teacher payment','leave of absence payment','other funds entry','other register payment','record other funds','separate fund receipt','other purpose payment','add other funds receipt','teacher leave payment','bayad ng guro','iba pang pondo'],
  'death-aid':['death aid','bereavement assistance','memorial contribution','death assistance','deceased person record','funeral assistance','death benefit collection','bereavement fund payment','death aid collection','aid for deceased','abuloy','tulong sa namatayan'],
  'fund-balance':['workspace fund balance','cash on hand','available fund cash','fund cash balance','workspace cash total','balance of funds','total fund money','how much cash','funds remaining','regular and donation balances','balanse ng pondo','natitirang pondo'],
  'member-balance':['individual account records','member account records','personal contribution history','member payment history','individual payment records','member ledger','review member records','person account history','individual contribution records','member transaction history','tala ng miyembro','kasaysayan ng hulog'],
  'cash-report':['cash report','financial report','print cash report','funds report','cash financial statement','workspace financial report','fund activity report','cash summary report','print fund statement','cash report pdf','ulat ng pondo','ulat pinansyal'],
  'member-statement':['individual account statement','member account statement','personal statement','member statement pdf','print member statement','individual statement','account statement for member','print individual records','member financial statement','statement of contributions','statement ng miyembro','ulat ng miyembro']
 };
 // A browser cannot reliably enumerate attached keyboards. Infer physical-keyboard
 // use from key events, and restore the button when touch is used. Ignore ordinary
 // text from a touch-only on-screen keyboard; hardware Tab/Escape/modifiers still count.
 const touchUsed=()=>document.body.classList.remove('pondo-keyboard-active');
 document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')touchUsed()},true);
 document.addEventListener('touchstart',touchUsed,{capture:true,passive:true});
 document.addEventListener('keydown',e=>{
  if(e.isComposing||e.key==='Unidentified'||e.key==='Process')return;
  const target=e.target instanceof Element?e.target:null,editing=target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
  if(editing&&!matchMedia('(any-hover: hover) and (any-pointer: fine)').matches&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!['Tab','Escape'].includes(e.key))return;
  document.body.classList.add('pondo-keyboard-active');
 },true);
 function focusEntry(){
  const fab=$('fab');if(fab?.getClientRects().length){fab.focus({preventScroll:true});return;}
  const active=[...document.querySelectorAll('.tab-section')].find(el=>el.getClientRects().length);
  if(active){active.tabIndex=-1;active.focus({preventScroll:true});}
 }
 const state=()=>window.pondoTeamState;
 const sameContext=()=>scope===donationContext();
 function readable(){const s=state();return donationCanRead()&&(!s?.orgId||(s.uid&&s.uid===window.pondoCurrentUser?.uid&&!s.listenerError&&typeof s.lastSyncedJSON==='string'));}
 function editable(){return readable()&&donationCanEdit()&&!trackerFatal;}
 function statementAllowed(){const s=state();return !!(!window.pondoGuestMode&&readable()&&s?.orgId&&s.role&&s.memberConfirmed&&s.baselineReady&&!s.recoveryLocked&&(s.members||[]).some(m=>typeof m?.uid==='string'&&m.uid));}
 function allowed(id){
  if(id==='fund-balance'||id==='cash-report')return readable();
  if(id==='death-aid')return editable()&&deathAidCanWrite();
  if(id==='member-balance'||id==='member-statement')return statementAllowed();
  if(id==='refund'&&state()?.orgId&&state().role==='reviewer')return memberRefundAvailable();
  return editable();
 }
 function activeActivities(){return contributionActivities.filter(a=>a&&!a.deathAid&&!a.archived&&!a.pendingDeletion);}
 function activity(){return activeActivities().find(a=>a.id===chosenActivity);}
 function accessibleSelection(id,activityId,personId,month){
  if(!sameContext()||!allowed(id))return false;
  if(id!=='contribution')return true;
  const a=activeActivities().find(x=>x.id===activityId);
  return !!(a&&(!monthlyContribution(a)||a.monthlyPeriods.includes(month))&&contributionPeopleForMonth(a,monthlyContribution(a)?month:null).some(p=>p.id===personId&&!p.pendingDeletion&&contributionBalance(p)>0));
 }
 function launch(id,activityId='',personId='',month=''){
  if(closing)return;
  if(!accessibleSelection(id,activityId,personId,month)){status.textContent='Selection or workspace access changed. Choose an available action again.';return;}
  const originalScope=scope;close(()=>openSelection(id,activityId,personId,month,originalScope));
 }
 function addChoice(title,description,handler){
  const button=document.createElement('button'),name=document.createElement('strong'),detail=document.createElement('span');
  button.type='button';button.className='quick-action-choice';name.textContent=title;detail.textContent=description;button.append(name,detail);button.addEventListener('click',handler);list.appendChild(button);
 }
 function selectAction(id){
  if(closing||!matches.some(i=>i.id===id)||!sameContext()||!allowed(id)){status.textContent='Selection or workspace access changed. Search again.';return;}
  if(id==='contribution'){stage='activity';chosenActivity='';chosenMonth='';showStage();return;}
  launch(id);
 }
 function showStage(){
  list.replaceChildren();$('quickActionSearchArea').hidden=stage!=='actions';$('quickActionBack').hidden=stage==='actions';
  if(stage==='actions'){
   for(const item of matches)addChoice(item.title,matchKind==='fallback'?'No matching action. This is a separate Other Funds payment.':(matchKind==='closest'?'Closest keyword match. ':'')+item.description,()=>selectAction(item.id));
   status.textContent=matches.length?(matchKind==='fallback'?'No matching action. Choose the Other Funds alternative if appropriate.':matchKind==='closest'?'Closest keyword matches. Choose an action.':matches.length+' available action'+(matches.length===1?'':'s')+'. Choose one to open it.'):query.value.trim()?'No available action matches. Try another phrase or check workspace access.':'No actions are currently available.';
   return;
  }
  if(!sameContext()||!allowed('contribution')){status.textContent='Workspace access changed. Go back and search again.';return;}
  const a=activity();
  if(stage==='activity'){
   status.textContent='Choose a contribution activity.';for(const item of activeActivities())addChoice(item.title,'Choose this activity',()=>{if(!sameContext()||!allowed('contribution')||!activeActivities().some(x=>x.id===item.id)){status.textContent='This activity or workspace is no longer available.';return;}chosenActivity=item.id;chosenMonth='';stage=monthlyContribution(item)?'period':'person';showStage();});
   if(!list.childElementCount)status.textContent='No active contribution activities are available. Go back to create one.';
  }else if(!a){status.textContent='This activity is no longer available. Go back and choose another.';}
  else if(stage==='period'){
   status.textContent='Choose a month for '+a.title+'.';for(const month of a.monthlyPeriods)addChoice(month,'Choose this month',()=>{if(!sameContext()||!allowed('contribution')||!activity()?.monthlyPeriods?.includes(month)){status.textContent='This month or workspace is no longer available.';return;}chosenMonth=month;stage='person';showStage()});
   if(!list.childElementCount)status.textContent='No months are available for this activity.';
  }else if(stage==='person'){
   status.textContent='Choose a contributor for '+a.title+(chosenMonth?' · '+chosenMonth:'')+'.';
   for(const person of contributionPeopleForMonth(a,monthlyContribution(a)?chosenMonth:null).filter(p=>!p.pendingDeletion&&contributionBalance(p)>0))addChoice(person.name,'Open contribution payment',()=>launch('contribution',a.id,person.id,chosenMonth));
   if(!list.childElementCount)status.textContent='No contributors with an outstanding balance for this activity and month.';
  }
  const first=list.querySelector('button');if(first)first.focus();else $('quickActionBack').focus();
 }
 // These are descriptions of what each existing workflow does, not extra routes
 // or workspace data. Keep unpaid bills, paid expenses, and reimbursements distinct.
 const purposes={
  fund:['organize money into separate funding sources','set aside money for a particular purpose','create a funding pool or pot','pondong gagamitin sa isang layunin'],
  project:['organize work and track a project budget','plan an initiative and its expenses','badyet para sa proyekto'],
  activity:['set up member dues for a fundraising drive','start collecting contributions from members','gumawa ng aktibidad para sa koleksyon ng hulog','simulan ang koleksyon ng hulog'],
  income:['log money coming into a regular fund','record funds received as income','money came into the fund or was deposited','pumasok na pera sa pondo'],
  expense:['log purchases already paid from a fund','track money spent on supplies','ginastos na pera ng pondo','nabayarang gastos mula sa pondo'],
  unpaid:['track an invoice from a supplier that has not been paid','record a bill to pay later','hindi pa nababayarang invoice ng supplier'],
  refund:['pay back a member who spent their own money','claim repayment for personal spending','ibalik ang sariling ginastos ng miyembro'],
  donation:['log gifts of money from a donor','link a receipt for a cash gift','perang natanggap na donasyon','regalo o donasyong pera mula sa donor'],
  contribution:['log a member dues payment for an activity','record money collected from a contributor','record a member paying monthly contributions','talaan ng hulog ng miyembro sa aktibidad'],
  other:['log teacher leave absence payments in a separate register','record a payment for other funds','tala ng bayad para sa leave ng guro'],
  'death-aid':['help the family of a deceased person with funeral assistance','collect assistance for a bereaved family','assistance when a member passed away or died','tulong sa pamilya ng namatay'],
  'fund-balance':['check how much cash the workspace has left','see the total cash remaining in funds','magkano ang natitirang pera sa pondo'],
  'member-balance':['review a person contribution and payment history','find records for an individual member','review payments made by a member','tingnan ang mga tala ng isang miyembro'],
  'cash-report':['print a summary of money in and out of funds','view financial activity for a date range','i print ang ulat ng pasok at labas ng pera'],
  'member-statement':['print a person contribution and payment history','prepare a statement for an individual member','print an account report for one member','i print ang tala ng hulog ng miyembro']
 };
 // Only suggest meaningful keyword or small typo matches; never silently choose
 // an action or route to a financial form based on an unrecognized phrase.
 // Preserve negation (not, unpaid, hindi) because it changes financial meaning.
 const searchStop=new Set(['a','an','the','for','to','my','i','want','would','like','what','do','please','can','could','where','how','is','me','need','find','open','form','using','use','ang','ng','sa','na','para','itala']);
 const phraseKey=text=>tokens(text).join(' ');
 const meaningfulPhrase=text=>tokens(text).filter(w=>!searchStop.has(w)).join(' ');
 const searchIndex=new Map(items.map(item=>{const text=(item.title+' '+item.description+' '+item.keywords+' '+(synonyms[item.id]||[]).join(' ')+' '+(purposes[item.id]||[]).join(' ')).toLocaleLowerCase();return [item.id,{text,vocabulary:[...new Set(tokens(text))]}]}));
 const broadWords=new Set(['record','create','new','add','payment','transaction','action','request','view','print','make','enter','track','tracking','log','check','show','see','look','prepare','review']);
 function tokens(text){return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)||[];}
 function typoDistance(a,b,limit){
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const current=[i];let min=i;for(let j=1;j<=b.length;j++){current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));min=Math.min(min,current[j]);}if(min>limit)return limit+1;previous=current;}
  return previous[b.length];
 }
 function closeScore(item,terms){
  const vocabulary=searchIndex.get(item.id).vocabulary,meaningful=terms.filter(t=>t.length>=3&&t.length<=32&&!broadWords.has(t));let score=0;
  for(const term of meaningful){let best=0;for(const word of vocabulary){if(word===term)best=Math.max(best,4);else if(term.length>=3&&word.startsWith(term)&&term.length>=3)best=Math.max(best,3);else if(term.length>=5&&word.length>=5&&word.length<=32&&Math.abs(term.length-word.length)<=1&&typoDistance(term,word,term.length>=8?2:1)<=(term.length>=8?2:1))best=Math.max(best,2);}score+=best;}
  // Dues payment requests, including unpaid dues, lead to the contribution
  // chooser for outstanding balances; they do not assert a payment was made.
  const has=word=>terms.includes(word),dues=['contribution','contributions','dues','hulog','kontribusyon'].some(has),bill=['bill','invoice','supplier','payable'].some(has);
  if(score&&item.id==='contribution'&&dues&&!bill&&(['paid','paying','bayad','unpaid'].some(has)))score+=4;
  if(score&&item.id==='member-balance'&&['member','individual','person','miyembro'].some(has)&&((has('look')&&has('up'))||has('history'))&&!['print','pdf','statement'].some(has))score+=4;
  return score;
 }
 // Keep a paid fund purchase separate from a supplier bill not paid yet, and
 // don't interpret unpaid member dues as a supplier invoice. These rules only
 // narrow suggestions; selecting a result still never writes any records.
 function eligibleForQuery(item,terms){
  const has=word=>terms.includes(word),unpaid=has('unpaid')||((has('not')||has('no')||has('hindi'))&&(has('paid')||has('bayad')));
  const bill=['bill','invoice','supplier','payable'].some(has),dues=['contribution','contributions','dues','hulog','kontribusyon'].some(has);
  const reimbursement=['refund','reimbursement','reimburse'].some(has);
  if(item.id==='unpaid'&&((dues&&!bill)||(reimbursement&&!bill)||(!unpaid&&has('paid')&&bill)))return false;
  if(item.id==='expense'&&unpaid&&!reimbursement&&(bill||has('expense')||has('purchase')))return false;
  return true;
 }
 function render(){
  const terms=tokens(query.value.slice(0,160)).filter(w=>!searchStop.has(w)).slice(0,12),text=query.value.toLocaleLowerCase();
  const eligible=items.filter(i=>eligibleForQuery(i,terms));
  const exact=terms.length?eligible.filter(i=>terms.every(term=>searchIndex.get(i.id).vocabulary.some(word=>word.startsWith(term)))):[];
  matchKind='exact';matches=exact.filter(i=>allowed(i.id));
  if(!exact.length&&terms.length){
   const ranked=eligible.map(item=>({item,score:closeScore(item,terms)})),best=Math.max(0,...ranked.map(x=>x.score));
   if(best){matchKind='closest';matches=ranked.filter(x=>x.score===best&&allowed(x.item.id)).map(x=>x.item);}
   else if(allowed('other')){matchKind='fallback';matches=items.filter(i=>i.id==='other');}
  }
  if(matchKind==='exact'){const normalized=phraseKey(text),meaningful=meaningfulPhrase(text),rank=i=>phraseKey(i.title)===normalized?4:(synonyms[i.id]||[]).some(p=>phraseKey(p)===normalized)?3:(purposes[i.id]||[]).some(p=>meaningfulPhrase(p)===meaningful)?2:i.title.toLocaleLowerCase().startsWith(text)?1:0;matches.sort((a,b)=>rank(b)-rank(a));}
  if(!terms.length)matches=items.filter(i=>allowed(i.id));
  stage='actions';showStage();
 }
 window.pondoQuickActionValidate=function(){
  if(overlay.hidden||stage==='actions')return;
  if(!sameContext()||!allowed('contribution')){list.replaceChildren();stage='actions';$('quickActionSearchArea').hidden=false;$('quickActionBack').hidden=true;query.value='';status.textContent='Workspace access changed. Close and reopen Quick Action.';if($('appDialogOverlay').hidden)query.focus({preventScroll:true});}
 };
 function availableToOpen(){return window.trackerReady&&!trackerFatal&&!$('pondoApp').inert&&!document.body.classList.contains('modal-open')&&$('appDialogOverlay').hidden&&$('presentation').style.display==='none'&&$('presentModal').style.display==='none'&&$('authGate').style.display==='none';}
 window.openQuickAction=function(){
  if(!overlay.hidden||!availableToOpen())return;
  closeNavMore();closeHeaderMore();window.closeTeamSwitcher?.();window.closeHeaderAvatarMenu?.();window.closeNotifCenter?.();
  if(enterHeld)guardEnter=true;
  previousFocus=document.activeElement;scope=donationContext();closing=false;clearTimeout(timer);overlay.classList.remove('is-closing');query.value='';
  const raw=window.pondoGuestMode?'':window.pondoCurrentUser?.displayName;const name=typeof raw==='string'?raw.trim().slice(0,80):'';$('quickActionGreeting').textContent=name?'Hello, '+name+'!':'Hello there!';
  overlay.hidden=false;document.body.classList.add('modal-open');render();query.focus();
 };
 function reduced(){return matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduce-motion')||appSettings?.motion?.reduceMotion;}
 function finishClose(proceed){
  if(proceed&&!$('appDialogOverlay').hidden){overlay.classList.remove('is-closing');closing=false;status.textContent='Close the open message, then choose the action again.';return;}
  overlay.hidden=true;overlay.classList.remove('is-closing');document.body.classList.remove('modal-open');closing=false;
  query.value='';matches=[];
  if(!$('appDialogOverlay').hidden){previousFocus=null;return;}
  if(proceed){focusEntry();proceed();}
  else {if(previousFocus?.isConnected&&previousFocus.getClientRects().length)previousFocus.focus({preventScroll:true});if(!previousFocus||document.activeElement!==previousFocus)focusEntry();}
  previousFocus=null;
 }
 function close(proceed){if(overlay.hidden||closing)return;closing=true;overlay.classList.add('is-closing');timer=setTimeout(()=>finishClose(proceed),reduced()?0:180);}
 function openSelection(id,activityId,personId,month,originalScope){
  if(donationContext()!==originalScope||!allowed(id)){appAlert('Workspace access changed. Open Quick action again to continue.');return;}
  if(id==='contribution'){
   const a=activeActivities().find(x=>x.id===activityId),p=a&&contributionPeopleForMonth(a,monthlyContribution(a)?month:null).find(x=>x.id===personId&&!x.pendingDeletion&&contributionBalance(x)>0);
   if(!a||!p||(monthlyContribution(a)&&!a.monthlyPeriods.includes(month))){appAlert('That activity or contributor is no longer available. Open Quick action again.');return;}
   if(monthlyContribution(a))contributionSelectedPeriod[a.id]=month;
   switchTab('contributions');focusEntry();openContributionForm('payment',a.id,p.id);return;
  }
  if(id==='fund'){openFundModal();return;}
  if(id==='project'){openProjectModal();return;}
  if(id==='activity'){switchTab('contributions');focusEntry();openContributionForm('activity');return;}
  if(id==='income'||id==='expense'){openTxModal();$('fabTxType').value=id==='income'?'IN':'OUT';syncTxProjectChoices();return;}
  if(id==='refund'){openRefundRequest();return;}
  if(id==='unpaid'){openInvoice(null,'supplier');return;}
  if(id==='death-aid'){showDeathAidCreate();return;}
  if(id==='donation'){openCashDonation();return;}
  if(id==='other'){openOtherPayment();return;}
  if(id==='fund-balance'){switchTab('dashboard');const hero=$('totalRemaining');hero.tabIndex=-1;hero.focus({preventScroll:true});hero.scrollIntoView({block:'center',behavior:reduced()?'auto':'smooth'});return;}
  if(id==='cash-report'){switchTab('report');$('reportFund').focus({preventScroll:true});$('reportFund').scrollIntoView({block:'center',behavior:reduced()?'auto':'smooth'});return;}
  if(id==='member-balance'||id==='member-statement'){switchTab('report');focusEntry();window.openAccountStatement();}
 }
 query.addEventListener('input',render);
 query.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='ArrowDown'){const first=list.querySelector('button');if(first){e.preventDefault();first.focus()}}else if(e.key==='Enter'&&stage==='actions'){e.preventDefault();if(e.repeat||closing||!query.value.trim())return;const first=list.querySelector('button');if(first)first.click()}});
 list.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const buttons=[...list.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(index<0||!buttons.length)return;e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()});
 $('quickActionBack').addEventListener('click',()=>{if(stage==='person'&&activity()&&monthlyContribution(activity()))stage='period';else if(stage==='person'||stage==='period')stage='activity';else stage='actions';showStage();if(stage==='actions')query.focus()});
 $('quickActionClose').addEventListener('click',()=>close());$('quickActionCancel').addEventListener('click',()=>close());overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}if(e.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled])')].filter(x=>x.getClientRects().length);if(!nodes.length){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes[nodes.length-1].focus()}else if(!e.shiftKey&&document.activeElement===nodes[nodes.length-1]){e.preventDefault();nodes[0].focus()}}});
 document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.defaultPrevented||e.repeat||e.isComposing||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||!overlay.hidden||!availableToOpen())return;const target=e.target instanceof Element?e.target:null;if(!target||target.closest('button,a,input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="tab"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="slider"],[role="spinbutton"],[role="textbox"],[role="combobox"],[role="treeitem"],audio[controls],video[controls],[tabindex]:not([tabindex="-1"]),.topbar,.bottomnav'))return;if(!$('navMoreMenu').hidden||!$('headerMoreMenu').hidden||$('teamHeaderBadge').getAttribute('aria-expanded')==='true'||$('headerAvatarBtn').getAttribute('aria-expanded')==='true'||$('notifBellBtn').getAttribute('aria-expanded')==='true')return;e.preventDefault();window.openQuickAction()});
})();
