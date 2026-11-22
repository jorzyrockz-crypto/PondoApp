/* Quick actions route to existing workflows; no financial records are written here. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),overlay=$('quickActionOverlay'),dialog=$('quickActionDialog'),query=$('quickActionQuery'),suggestion=$('quickActionSuggestion'),next=$('quickActionNext'),status=$('quickActionStatus'),requirements=$('quickActionRequirements');
 let previousFocus=null,scope=null,selected=null,closing=false,timer=null,matches=[],matchIndex=0;
 const items=[
  {id:'income',title:'Record income',description:'Add money received by a fund.',keywords:'income received money deposit fund'},
  {id:'expense',title:'Record an expense',description:'Record a payment from a fund.',keywords:'expense spent payment pay purchase out'},
  {id:'refund',title:'Request or record a refund',description:'Start a reimbursement request or record.',keywords:'refund reimburse reimbursement request advance'},
  {id:'donation',title:'Record a cash donation',description:'Add or link a donation receipt.',keywords:'donation donor gift cash received'},
  {id:'contribution',title:'Record a contribution payment',description:'Choose an activity and contributor.',keywords:'contribution dues member payment collection'},
  {id:'other',title:'Record an Other Funds payment',description:'Add a receipt in the separate Other Funds register.',keywords:'other funds payment teacher leave absence receipt'},
  {id:'fund-balance',title:'View workspace fund balance',description:'See regular and donation fund cash across all dates.',keywords:'request account balance fund money cash total'},
  {id:'member-balance',title:'Review individual account records',description:'Prepare a member statement; no combined net balance is calculated.',keywords:'request account balance individual member statement'},
  {id:'cash-report',title:'Print a cash financial report',description:'Review fund and date filters before printing.',keywords:'print financial statement report cash pdf'},
  {id:'member-statement',title:'Print an individual account statement',description:'Review a member’s matching records before printing.',keywords:'print financial statement individual member pdf'}
 ];
 const state=()=>window.pondoTeamState;
 const sameContext=()=>scope===donationContext();
 function readable(){const s=state();return donationCanRead()&&(!s?.orgId||(s.uid&&s.uid===window.pondoCurrentUser?.uid&&!s.listenerError&&typeof s.lastSyncedJSON==='string'));}
 function editable(){return readable()&&donationCanEdit()&&!trackerFatal;}
 function statementAllowed(){const s=state();return !!(!window.pondoGuestMode&&readable()&&s?.orgId&&s.role&&s.memberConfirmed&&s.baselineReady&&!s.recoveryLocked&&(s.members||[]).some(m=>typeof m?.uid==='string'&&m.uid));}
 function allowed(id){
  if(id==='fund-balance'||id==='cash-report')return readable();
  if(id==='member-balance'||id==='member-statement')return statementAllowed();
  if(id==='refund'&&state()?.orgId&&state().role==='reviewer')return memberRefundAvailable();
  return editable();
 }
 function activeActivities(){return contributionActivities.filter(a=>a&&!a.deathAid&&!a.archived&&!a.pendingDeletion);}
 function options(select,placeholder,values){select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=placeholder;select.appendChild(first);for(const [value,label] of values){const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option)}}
 function activity(){return activeActivities().find(a=>a.id===$('quickActionActivity').value);}
 function refreshPeople(){
  const a=activity(),period=$('quickActionPeriod').value,person=$('quickActionPerson');
  options(person,'Choose a contributor',a?contributionPeopleForMonth(a,monthlyContribution(a)?period:null).filter(p=>!p.pendingDeletion&&contributionBalance(p)>0).map(p=>[p.id,p.name]):[]);
  $('quickActionPersonHint').textContent=a?(person.options.length===1?'No contributors with an outstanding balance in this activity and period.':'Choose the contributor whose payment you are recording.'):'Choose an activity first.';
  updateNext();
 }
 function refreshActivity(){
  const a=activity(),period=$('quickActionPeriod'),periodWrap=$('quickActionPeriodWrap');periodWrap.hidden=!a||!monthlyContribution(a);
  options(period,'Choose a month',a&&monthlyContribution(a)?a.monthlyPeriods.map(m=>[m,m]):[]);
  if(a&&monthlyContribution(a))period.value=selectedContributionMonth(a)||'';
  refreshPeople();
 }
 function selectedValid(){
  if(!selected||!allowed(selected)||!sameContext())return false;
  if(selected!=='contribution')return true;
  const a=activity(),month=$('quickActionPeriod').value,person=$('quickActionPerson').value;
  return !!(a&&(!monthlyContribution(a)||a.monthlyPeriods.includes(month))&&contributionPeopleForMonth(a,monthlyContribution(a)?month:null).some(p=>p.id===person&&!p.pendingDeletion&&contributionBalance(p)>0));
 }
 function updateNext(){next.disabled=!selectedValid();}
 function choose(id){
  const item=matches.find(x=>x.id===id);
  if(closing||!item||!allowed(id)||!sameContext())return;
  selected=id;query.value=item.title;suggestion.hidden=true;$('quickActionGhost').replaceChildren();
  requirements.hidden=id!=='contribution';
  if(id==='contribution'){options($('quickActionActivity'),'Choose an activity',activeActivities().map(a=>[a.id,a.title]));refreshActivity()}
  updateNext();status.textContent=item.title+' selected. '+(id==='contribution'?'Choose an activity and contributor.':'Select Next to continue.');
 }
 function showSuggestion(){
  const item=matches[matchIndex];suggestion.hidden=!item;
  $('quickActionGhost').replaceChildren();
  if(!item)return;
  $('quickActionSuggestionButton').textContent=item.title;
  $('quickActionSuggestionButton').setAttribute('aria-label','Use suggestion: '+item.title);
  $('quickActionSuggestionDescription').textContent=item.description;
  $('quickActionSuggestionCount').textContent=(matchIndex+1)+' of '+matches.length;
  $('quickActionPrevious').disabled=matches.length<2;$('quickActionFollowing').disabled=matches.length<2;
  if(item.title.toLocaleLowerCase().startsWith(query.value.toLocaleLowerCase())&&query.value.length<item.title.length){
   const typed=document.createElement('span');typed.textContent=query.value;typed.className='quick-action-ghost-typed';
   $('quickActionGhost').append(typed,document.createTextNode(item.title.slice(query.value.length)));
  }
  status.textContent='Suggestion '+(matchIndex+1)+' of '+matches.length+': '+item.title+'. Press Enter or use the suggestion button to select.'+(matches.length>1?' Use arrow keys to browse.':'');
 }
 function render(){
  const words=query.value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)||[],terms=words.filter(w=>!['a','an','the','for','to','my','i','want','would','like','what','do','please'].includes(w));
  matches=terms.length?items.filter(i=>allowed(i.id)&&terms.every(term=>(i.title+' '+i.description+' '+i.keywords).toLocaleLowerCase().includes(term))):[];
  const text=query.value.toLocaleLowerCase();matches.sort((a,b)=>Number(b.title.toLocaleLowerCase().startsWith(text))-Number(a.title.toLocaleLowerCase().startsWith(text)));
  matchIndex=0;selected=null;requirements.hidden=true;updateNext();showSuggestion();
  if(!matches.length)status.textContent=terms.length?'No available action matches. Try another phrase or check workspace access.':'Start typing to see an action suggestion.';
 }
 function browse(step){if(!matches.length)return;matchIndex=(matchIndex+step+matches.length)%matches.length;showSuggestion()}
 function availableToOpen(){return window.trackerReady&&!trackerFatal&&!$('pondoApp').inert&&!document.body.classList.contains('modal-open')&&$('appDialogOverlay').hidden&&$('presentation').style.display==='none'&&$('presentModal').style.display==='none'&&$('authGate').style.display==='none';}
 window.openQuickAction=function(){
  if(!overlay.hidden||!availableToOpen())return;
  closeNavMore();closeHeaderMore();window.closeTeamSwitcher?.();window.closeHeaderAvatarMenu?.();window.closeNotifCenter?.();
  previousFocus=document.activeElement;scope=donationContext();closing=false;clearTimeout(timer);overlay.classList.remove('is-closing');query.value='';
  const raw=window.pondoGuestMode?'':window.pondoCurrentUser?.displayName;const name=typeof raw==='string'?raw.trim().slice(0,80):'';$('quickActionGreeting').textContent=name?'Hello, '+name+'!':'Hello there!';
  overlay.hidden=false;document.body.classList.add('modal-open');render();query.focus();
 };
 function reduced(){return matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduce-motion')||appSettings?.motion?.reduceMotion;}
 function finishClose(proceed){
  overlay.hidden=true;overlay.classList.remove('is-closing');document.body.classList.remove('modal-open');closing=false;
  if(!$('appDialogOverlay').hidden){previousFocus=null;return;}
  if(proceed){$('quickActionOpen').focus({preventScroll:true});proceed();}
  else if(previousFocus?.isConnected&&previousFocus.getClientRects().length)previousFocus.focus({preventScroll:true});
  else $('quickActionOpen').focus({preventScroll:true});
  previousFocus=null;
 }
 function close(proceed){if(overlay.hidden||closing)return;closing=true;overlay.classList.add('is-closing');timer=setTimeout(()=>finishClose(proceed),reduced()?0:180);}
 function openSelection(id,activityId,personId,month,originalScope){
  if(donationContext()!==originalScope||!allowed(id)){appAlert('Workspace access changed. Open Quick action again to continue.');return;}
  if(id==='contribution'){
   const a=activeActivities().find(x=>x.id===activityId),p=a&&contributionPeopleForMonth(a,monthlyContribution(a)?month:null).find(x=>x.id===personId&&!x.pendingDeletion&&contributionBalance(x)>0);
   if(!a||!p||(monthlyContribution(a)&&!a.monthlyPeriods.includes(month))){appAlert('That activity or contributor is no longer available. Open Quick action again.');return;}
   if(monthlyContribution(a))contributionSelectedPeriod[a.id]=month;
   switchTab('contributions');$('quickActionOpen').focus({preventScroll:true});openContributionForm('payment',a.id,p.id);return;
  }
  if(id==='income'||id==='expense'){openTxModal();$('fabTxType').value=id==='income'?'IN':'OUT';syncTxProjectChoices();return;}
  if(id==='refund'){openRefundRequest();return;}
  if(id==='donation'){openCashDonation();return;}
  if(id==='other'){openOtherPayment();return;}
  if(id==='fund-balance'){switchTab('dashboard');const hero=$('totalRemaining');hero.tabIndex=-1;hero.focus({preventScroll:true});hero.scrollIntoView({block:'center',behavior:reduced()?'auto':'smooth'});return;}
  if(id==='cash-report'){switchTab('report');$('reportFund').focus({preventScroll:true});$('reportFund').scrollIntoView({block:'center',behavior:reduced()?'auto':'smooth'});return;}
  if(id==='member-balance'||id==='member-statement'){switchTab('report');$('quickActionOpen').focus({preventScroll:true});window.openAccountStatement();}
 }
 query.addEventListener('input',render);
 query.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(matches.length&&!selected){e.preventDefault();browse(e.key==='ArrowDown'?1:-1)}}else if((e.key==='Enter'||e.key==='Tab')&&!selected&&matches.length){e.preventDefault();choose(matches[matchIndex].id);if(e.key==='Tab'&&!next.disabled)next.focus()}});
 $('quickActionSuggestionButton').addEventListener('click',()=>{if(matches[matchIndex]){choose(matches[matchIndex].id);query.focus()}});
 $('quickActionPrevious').addEventListener('click',()=>browse(-1));$('quickActionFollowing').addEventListener('click',()=>browse(1));
 $('quickActionActivity').addEventListener('change',refreshActivity);$('quickActionPeriod').addEventListener('change',refreshPeople);$('quickActionPerson').addEventListener('change',updateNext);
 next.addEventListener('click',()=>{if(!selectedValid()){status.textContent='Selection or workspace access changed. Choose an available action again.';updateNext();query.focus();return;}const id=selected,a=$('quickActionActivity').value,p=$('quickActionPerson').value,m=$('quickActionPeriod').value,originalScope=scope;close(()=>openSelection(id,a,p,m,originalScope));});
 $('quickActionClose').addEventListener('click',()=>close());$('quickActionCancel').addEventListener('click',()=>close());overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}if(e.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled])')].filter(x=>x.getClientRects().length);if(!nodes.length){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes[nodes.length-1].focus()}else if(!e.shiftKey&&document.activeElement===nodes[nodes.length-1]){e.preventDefault();nodes[0].focus()}}});
 document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.defaultPrevented||e.repeat||e.isComposing||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||!overlay.hidden||!availableToOpen())return;const target=e.target instanceof Element?e.target:null;if(!target||target.closest('button,a,input,select,textarea,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="link"],[role="tab"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="slider"],[role="spinbutton"],[role="textbox"],[role="combobox"],[role="treeitem"],audio[controls],video[controls],[tabindex]:not([tabindex="-1"]),.topbar,.bottomnav'))return;if(!$('navMoreMenu').hidden||!$('headerMoreMenu').hidden||$('teamHeaderBadge').getAttribute('aria-expanded')==='true'||$('headerAvatarBtn').getAttribute('aria-expanded')==='true'||$('notifBellBtn').getAttribute('aria-expanded')==='true')return;e.preventDefault();window.openQuickAction()});
})();
