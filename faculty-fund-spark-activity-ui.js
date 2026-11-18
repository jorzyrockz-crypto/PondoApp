/* Read-only, date-bounded activity browsing for the experimental Spark fund.
 * Pages do not calculate balances or authorize writes. Only confirmed pages
 * from a single revision and current workspace may be displayed. */
(function(global){
 'use strict';
 function createActivityUI({root,getContext,makePager}){
  if(!root||typeof getContext!=='function'||typeof makePager!=='function')throw Error('History browser unavailable');
  const doc=root.ownerDocument;let epoch=0,pager=null,pinned=null,latest=null,scope=null,loading=false,kind=null,count=0;
  const current=()=>{const c=getContext();return !!scope&&!!c&&c.memberConfirmed===true&&c.uid===scope.uid&&c.orgId===scope.orgId&&c.role===scope.role&&c.scopeToken===scope.scopeToken;};
  const node=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  let status,results,load,search,from,to,type;
  function stop(message){epoch++;pager?.reset?.();pager=null;pinned=null;loading=false;count=0;if(results)results.replaceChildren();if(load)load.disabled=true;if(search)search.disabled=false;if(status)status.textContent=message||'';}
  function reset(){stop();scope=null;latest=null;root.replaceChildren();root.hidden=true;}
  function display(item){
   const row=node('div');row.className='faculty-item';
   if(item.kind==='payment'){
    row.append(node('strong',item.memberName+' · '+money(item.amountCents)),node('small','Payment date: '+item.paymentDate+' · Absence: '+item.absenceDate),node('small','Status: '+(item.status==='voided'?'Voided':'Active')+(item.remittanceId?' · Linked handover: '+item.remittanceId:' · Not linked to a handover')));
    if(item.status==='voided'&&item.voidReason)row.append(node('small','Void reason: '+item.voidReason));
   }else{
    const t=item.occurredAt instanceof Date?item.occurredAt.getTime():item.occurredAt?.toMillis?.();
    const when=Number.isFinite(t)?new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(t))+' (Philippine time)':'Time unavailable';
    row.append(node('strong',item.description+' · '+money(item.amountCents)),node('small','Payee: '+item.payee+' · '+when),node('small','Status: '+item.status));
    if(item.reference)row.append(node('small','Reference: '+item.reference));
   }
   row.append(node('small','Record ID: '+item.id));return row;
  }
  function money(n){return '₱'+(n/100).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});}
  async function next(){
   if(!pager||loading)return;if(!current()){stop('Workspace changed. Reopen history.');return;}const g=epoch;loading=true;search.disabled=load.disabled=true;status.textContent='Loading confirmed records…';
   try{
    const result=await pager.next(kind);if(g!==epoch)return;if(!current()){stop('Workspace changed. Reopen history.');return;}
    if(latest!==null&&latest>result.revision){stop('Faculty Fund changed. Search again for a consistent history.');return;}
    if(pinned!==null&&pinned!==result.revision)throw Error('Faculty Fund changed');pinned=result.revision;
    for(const item of result.items)results.append(display(item));count+=result.items.length;load.disabled=!result.hasMore;
    status.textContent=count+' record(s) shown'+(result.hasMore?' · more available':' · end of range')+'. This list is not a balance or financial report.';
   }catch(e){if(g===epoch)stop(current()?'Could not confirm this page or the fund changed. Check your connection and search again.':'Workspace changed. Reopen history.');}
   finally{if(g===epoch){loading=false;search.disabled=false;}}
  }
  function notifyRevision(revision){if(!Number.isSafeInteger(revision)||revision<0)return;latest=revision;if(pinned!==null&&revision>pinned)stop('Faculty Fund changed. Search again for a consistent history.');}
  function open(){
   reset();const c=getContext();if(!c||c.memberConfirmed!==true||!c.uid||!c.orgId||!c.role)return;scope={uid:c.uid,orgId:c.orgId,role:c.role,scopeToken:c.scopeToken};root.hidden=false;
   const title=node('h3','Browse dated history');const info=node('p','Read-only pages of payments or expenses. This is not a balance, a complete audit, or a report. Dates use Philippine time.');
   const form=node('form');form.className='faculty-form';form.setAttribute('aria-label','Browse Faculty Fund history');
   function input(label,control){const l=node('label',label);l.append(control);form.append(l);}
   type=node('select');type.name='kind';for(const [v,t] of [['payments','Payments'],['expenses','Expenses']]){const o=node('option',t);o.value=v;type.append(o);}input('Record type',type);
   from=node('input');from.type='date';from.required=true;input('From',from);to=node('input');to.type='date';to.required=true;input('To',to);
   search=node('button','Search history');search.type='submit';form.append(search);
   status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');results=node('div');results.className='faculty-list';
   load=node('button','Load more');load.type='button';load.disabled=true;
   form.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();stop();if(!current())return;try{kind=type.value;pager=makePager({orgId:scope.orgId,from:from.value,to:to.value});void next();}catch(err){stop('Choose a valid date range and try again.');}});
   load.addEventListener('click',()=>void next());root.append(title,info,form,status,results,load);
  }
  return {open,reset,notifyRevision};
 }
 if(typeof module==='object'&&module.exports)module.exports={createActivityUI};else global.createFacultyFundActivityUI=createActivityUI;
})(typeof window!=='undefined'?window:globalThis);
