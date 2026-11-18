/* EXPERIMENTAL recovery screen; not imported by the live app. Host must call
 * reset() immediately when auth, role, workspace or scope changes. The adapter
 * and Firestore rules, not this UI, enforce authorization and consistency. */
(function(global){
 'use strict';
 const fail=m=>{throw Error(m)};
 function createRecoveryUI({root,getContext,makeRecovery,askReason,confirmAction}){
  if(!root||![getContext,makeRecovery,askReason,confirmAction].every(x=>typeof x==='function'))fail('Invalid recovery screen setup');
  let generation=0,busy=false,items=[],note='Refresh to check for unfinished work.',viewContext=null,viewAdapter=null,hasNext=false,continuation=null;
  const valid=c=>!!c&&c.memberConfirmed===true&&typeof c.uid==='string'&&!!c.uid&&typeof c.orgId==='string'&&!!c.orgId&&['owner','disbursing'].includes(c.role)&&['string','number'].includes(typeof c.scopeToken);
  function capture(){const c=getContext();if(!valid(c))fail('Open an authorized team workspace.');return {...c};}
  function same(a){const b=getContext();return !!a&&valid(b)&&a.uid===b.uid&&a.orgId===b.orgId&&a.role===b.role&&a.scopeToken===b.scopeToken;}
  const current=(c,g)=>g===generation&&same(c);
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);return el;};
  const money=n=>Number.isSafeInteger(n)&&n>=0?'₱'+(n/100).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}):'Unavailable';
  function when(value){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(d)+' (Philippine time)':'Unavailable';}
  function button(text,action,handler){const el=node('button',text);el.type='button';el.dataset.recoveryAction=action;el.disabled=busy;el.addEventListener('click',handler);return el;}
  function show(){
   root.replaceChildren();root.classList.add('faculty-recovery');root.append(node('h2','Unfinished Faculty Fund work'));
   root.append(node('p','Only server-visible unfinished records appear here. An empty list does not prove that an earlier request failed. Check transaction and remittance history before making another entry.'));
   const status=node('p',note);status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
   root.append(button('Refresh recovery','refresh',()=>{void refresh()}));
   if(busy){root.append(node('p','Checking the server…'));return;}
   if(hasNext)root.append(button('Next recovery page','next',()=>{void nextPage()}));
   if(continuation)root.append(button('Continue scanning this expense','continue',()=>{void act(continuation.item,'resume',continuation.token)}));
   for(const item of items){
    const card=node('section');card.className='faculty-recovery-card';card.dataset.recoveryId=item.id;
    card.append(node('h3',(item.kind==='expense'?'Expense':'Remittance')+' · '+item.status));
    card.append(node('p','Record ID: '+item.id+' · Created by: '+item.createdBy+' · '+when(item.createdAt)));
    if(item.kind==='expense'){
     card.append(node('p','Expense: '+item.description+' · Payee: '+item.payee));if(item.reference)card.append(node('p','Reference: '+item.reference));
     card.append(node('p','Occurred: '+when(item.occurredAt)+' · Amount: '+money(item.amountCents)+' · Currently reserved: '+money(item.allocatedCents)));
    }else{
     card.append(node('p','Linked payments: '+item.linkedCount+' of '+item.payments.length+' · Linked amount: '+money(item.amountCents)));
     const list=node('ul');for(const p of item.payments){const text=p.missing?'Payment unavailable: '+p.id:(p.memberName+' · absence '+p.absenceDate+' · '+money(p.amountCents)+' · '+(p.linked?'linked':'not linked')+' · '+p.id);list.append(node('li',text));}card.append(list);
    }
    if(item.status==='draft'){
     if(item.canResume)card.append(button('Resume this draft','resume',()=>{void act(item,'resume')}));else card.append(node('p','Resume is unavailable for this draft. Review its details; an authorized collector may cancel it.'));
     card.append(button('Cancel this draft','cancel',()=>{void act(item,'cancel')}));
    }else card.append(button('Finish recovery','finish',()=>{void act(item,'finish')}));
    root.append(card);
   }
  }
  function validateItems(data){
   if(!Array.isArray(data?.items))fail('Invalid recovery response');const seen=new Set();
   for(const x of data.items){
    const statuses=x?.kind==='remittance'?['draft','cancelled','declined','voided']:x?.kind==='expense'?['draft','cancelling','voiding']:[];
    if(typeof x?.id!=='string'||!x.id||x.id.length>128||seen.has(x.kind+':'+x.id)||!statuses.includes(x.status)||typeof x.createdBy!=='string'||!x.createdBy||typeof x.createdAt!=='string'||!Number.isFinite(Date.parse(x.createdAt))||!Number.isSafeInteger(x.amountCents)||x.amountCents<0||typeof x.canResume!=='boolean'||x.remaining!==true)fail('Invalid recovery record');
    seen.add(x.kind+':'+x.id);
    if(x.kind==='expense'){
     if(typeof x.description!=='string'||typeof x.payee!=='string'||typeof x.reference!=='string'||typeof x.occurredAt!=='string'||!Number.isFinite(Date.parse(x.occurredAt))||!Number.isSafeInteger(x.allocatedCents)||x.allocatedCents<0||x.allocatedCents>x.amountCents)fail('Invalid expense recovery record');
    }else if(!Number.isSafeInteger(x.linkedCount)||x.linkedCount<0||!Array.isArray(x.payments)||x.payments.length<1||x.payments.length>200||x.linkedCount>x.payments.length||x.payments.some(p=>!p||typeof p.id!=='string'||!p.id||(!p.missing&&(typeof p.memberName!=='string'||typeof p.absenceDate!=='string'||!Number.isSafeInteger(p.amountCents)||p.amountCents<=0||typeof p.linked!=='boolean'))))fail('Invalid remittance recovery record');
   }
   return data.items;
  }
  function reset(){generation++;viewAdapter?.reset?.();busy=false;items=[];viewContext=null;viewAdapter=null;hasNext=false;continuation=null;note='Refresh to check for unfinished work.';show();}
  function applyPage(data){
   const rows=validateItems(data);if(data.paged===true){if(typeof data.complete!=='boolean'||typeof data.hasMore!=='boolean'||data.hasMore===data.complete||!Number.isSafeInteger(data.revision)||!['draftRemittances','releaseRemittances','expenses'].includes(data.category))fail('Invalid recovery page');hasNext=data.hasMore;return {rows,note:rows.length?'Review this record before choosing an action.' : data.complete?'End of recovery pages. Review history for any uncertain request.':'No records on this page. Continue to check the remaining pages.'};}
   hasNext=false;return {rows,note:rows.length?'Review each record before choosing an action.':'No server-visible unfinished work was found. Review history for any uncertain request.'};
  }
  async function refresh(){
   if(busy)return;let c;try{c=capture()}catch(e){reset();note=e.message;show();return;}
   const g=++generation;viewAdapter?.reset?.();busy=true;items=[];hasNext=false;continuation=null;viewContext=c;viewAdapter=null;note='Checking unfinished work.';show();
   try{const adapter=makeRecovery(c);if(!adapter?.list)fail('Recovery is unavailable');viewAdapter=adapter;const data=await adapter.list({orgId:c.orgId});if(!current(c,g))return;const page=applyPage(data);items=page.rows;note=page.note;}
   catch(e){if(current(c,g)){items=[];hasNext=false;note='Unable to confirm unfinished work. Reconnect and refresh; do not assume a request failed.';}}
   finally{if(current(c,g)){busy=false;show();}}
  }
  async function nextPage(){
   if(busy||!hasNext||!viewContext||!same(viewContext)||!viewAdapter)return;const c=viewContext,g=++generation;busy=true;items=[];note='Checking the next recovery page.';show();
   try{const data=await viewAdapter.list({orgId:c.orgId});if(!current(c,g))return;const page=applyPage(data);items=page.rows;note=page.note;}
   catch(e){if(current(c,g)){items=[];hasNext=false;continuation=null;note='Unable to confirm the next page. Refresh and review history; do not assume a request failed.';}}
   finally{if(current(c,g)){busy=false;show();}}
  }
  function outcome(result,item){
   const known=item.kind==='remittance'?['draft','pending','accepted','declined','cancelled','voided']:['draft','recorded','cancelling','cancelled','voiding','voided'];
   if(!result||result.kind!==item.kind||result.id!==item.id||!known.includes(result.status)||typeof result.remaining!=='boolean'||!Number.isSafeInteger(result.revision))fail('Invalid recovery result');
   if(result.remaining)return 'Server status: '+result.status+'. Further recovery is still required; review and refresh.';
   const messages={pending:'Submitted and awaiting the Faculty President’s decision.',accepted:'Already accepted by the Faculty President; it was not cancelled.',recorded:'Already recorded as an expense; it was not cancelled.',cancelled:'Cancelled; the server reports no remaining recovery for this record.',declined:'Declined; the server reports no remaining recovery for this record.',voided:'Voided; the server reports no remaining recovery for this record.'};
   return messages[result.status]||'Server status: '+result.status+'. Review the record history.';
  }
  async function act(item,action,scanToken){
   if(busy||!viewContext||!same(viewContext))return;const c=viewContext,g=++generation;busy=true;continuation=null;note='Reviewing the selected action.';show();let submitted=false;
   try{
    let reason;if(action==='cancel'){reason=await askReason('Why are you cancelling this draft?');if(!current(c,g))return;if(reason==null||!String(reason).trim()){note='No cancellation was requested.';return;}reason=String(reason).trim();if(reason.length>500){note='The cancellation reason must be 500 characters or fewer.';return;}}
    const prompt=action==='resume'?'Resume this draft? It may submit the remittance or record the expense.':action==='cancel'?'Cancel this draft? Check history if it was already accepted or recorded.':'Finish releasing this record’s reserved amounts?';
    const confirmed=await confirmAction(prompt);if(!current(c,g))return;if(!confirmed){note='No change was requested.';return;}
    const adapter=viewAdapter;if(!adapter?.resolve||!adapter?.list)fail('Recovery is unavailable');submitted=true;const result=await adapter.resolve({orgId:c.orgId,kind:item.kind,id:item.id,action,...(reason?{reason}:{}),...(scanToken?{continuation:scanToken}:{})});if(!current(c,g))return;let summary=outcome(result,item);items=[];hasNext=false;
    if(result.continuation){const token=result.continuation;if(item.kind!=='expense'||action!=='resume'||result.status!=='draft'||result.remaining!==true||result.reason!=='scan-limit'||token.version!==1||token.orgId!==c.orgId||token.uid!==c.uid||token.expenseId!==item.id||token.revision!==result.revision||typeof token.walletId!=='string'||!token.walletId)fail('Invalid scan continuation');continuation={item,token};summary='Expense remains unfinished. Continue scanning for eligible funds, or refresh to restart the scan.';}note=summary;
    try{const data=await adapter.list({orgId:c.orgId});if(!current(c,g))return;const page=applyPage(data);items=page.rows;}
    catch(e){if(current(c,g)){hasNext=false;continuation=null;note=summary+' Unable to refresh the recovery list; refresh before another action.';}}
   }catch(e){if(current(c,g)){items=[];hasNext=false;continuation=null;note=submitted?'The result is unconfirmed. Refresh and review the record history before trying again; it may already have completed.':'No change was requested. Refresh and try again.';}}
   finally{if(current(c,g)){busy=false;show();}}
  }
  reset();return {refresh,reset};
 }
 if(typeof module==='object'&&module.exports)module.exports={createSparkRecoveryUI:createRecoveryUI};else global.createFacultyFundSparkRecoveryUI=createRecoveryUI;
})(typeof window!=='undefined'?window:globalThis);
