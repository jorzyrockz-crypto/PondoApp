import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Only a separate public report document is read here. Private workspace
// snapshots, members, and user profiles are never accessed by this view.
const config={apiKey:'AIzaSyCnBYuNlOYUoLKKcaua5nMqnTSlFi4Di80',authDomain:'class-scheduler-63968.firebaseapp.com',projectId:'class-scheduler-63968',storageBucket:'class-scheduler-63968.firebasestorage.app',messagingSenderId:'747294517653',appId:'1:747294517653:web:795a578b113913ee1dae9c'};
const status=document.getElementById('status'),target=document.getElementById('report');
const params=new URLSearchParams(location.search),id=params.get('id'),requested=params.get('view');
const views=['funds','projects','contributions'];
let lastUpdated=null, fromCache=false, showingReport=false;
function unavailable(message){showingReport=false;target.replaceChildren();status.textContent=message;}
function updateStatus(){
  if(!showingReport)return;
  const time=lastUpdated instanceof Date&&!Number.isNaN(lastUpdated.getTime())?'Last updated '+lastUpdated.toLocaleString()+'.':'Update time unavailable.';
  const connection=!navigator.onLine?' Offline: this copy may be outdated or revoked.':fromCache?' Showing a cached copy; checking for updates. It may be outdated or revoked.':'';
  status.textContent=time+connection+' Updates depend on the report owner’s workspace being synced.';
}
window.addEventListener('online',updateStatus);
window.addEventListener('offline',updateStatus);
function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function render(data){
  const report=data?.report,currency=data?.currency;
  if(!report||report.version!==1||!(/^[A-Z]{3}$/.test(currency||''))){unavailable('This report is unavailable or has an unsupported format.');return;}
  let money;try{money=new Intl.NumberFormat(undefined,{style:'currency',currency}).format}catch(e){unavailable('This report has an unsupported currency.');return;}
  const amount=n=>Number.isSafeInteger(n)?money(n/100):'—';
  const selected=requested?[requested]:views;
  if(requested&&!views.includes(requested)){unavailable('This report view is not available.');return;}
  const fragment=document.createDocumentFragment();let any=false;
  for(const view of selected){
    if(!Array.isArray(report[view]))continue;
    any=true;
    const section=element('section');section.append(element('h2',view==='funds'?'Funds':view==='projects'?'Projects':'Contributions'));
    const cards=element('div',undefined,'cards');
    if(!report[view].length)cards.append(element('p','No records in this view.','empty'));
    report[view].forEach((entry,i)=>{
      const card=element('article',undefined,'card');
      card.append(element('h3',(view==='funds'?'Fund ':view==='projects'?'Project ':'Contribution ')+(i+1)));
      const metrics=element('div',undefined,'metrics');
      const pairs=view==='funds'?[['Received','receivedCents'],['Spent','spentCents'],['Balance','balanceCents']]:view==='projects'?[['Allocated','allocatedCents'],['Spent','spentCents'],['Remaining','remainingCents']]:[['Expected','expectedCents'],['Paid','paidCents'],['Outstanding','outstandingCents']];
      for(const [label,key] of pairs){const metric=element('div',undefined,'metric');metric.append(element('span',label),element('strong',amount(entry?.[key])));metrics.append(metric)}
      card.append(metrics);
      if(Array.isArray(entry?.transactions)&&entry.transactions.length){
        const wrap=element('div',undefined,'table-wrap'),table=element('table'),head=element('thead'),hr=element('tr');
        for(const name of ['Date','Transaction','Amount'])hr.append(element('th',name));head.append(hr);table.append(head);
        const body=element('tbody');
        for(const tx of entry.transactions){
          const row=element('tr'),date=typeof tx?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(tx.date)?tx.date:'—';
          const label=view==='contributions'?'Contribution payment':tx?.direction==='IN'?'Funds received':'Fund expense';
          row.append(element('td',date),element('td',label),element('td',amount(tx?.amountCents)));body.append(row);
        }
        table.append(body);wrap.append(table);card.append(wrap);
      }
      cards.append(card);
    });
    section.append(cards);fragment.append(section);
  }
  if(!any){unavailable('This report view is not published.');return;}
  target.replaceChildren(fragment);
  lastUpdated=data.updatedAt?.toDate?.();showingReport=true;updateStatus();
}
if(!id||!/^[A-Za-z0-9_-]{32,96}$/.test(id)){
  unavailable('This report link is invalid. Ask the owner for a current link.');
}else{
  try{
    const db=getFirestore(initializeApp(config));
    onSnapshot(doc(db,'publicReports',id),{includeMetadataChanges:true},snap=>{
      fromCache=!!snap.metadata?.fromCache;
      if(!snap.exists())unavailable('This report is unavailable or no longer shared.');
      else render(snap.data());
    },()=>unavailable('This report could not be loaded. It may be unavailable or no longer shared.'));
  }catch(e){unavailable('This report could not be loaded. Please try again later.');}
}
