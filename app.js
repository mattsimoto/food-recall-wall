const FDA_URL = 'https://api.fda.gov/food/enforcement.json?search=status:%22Ongoing%22&limit=1000';
const FSIS_URL = 'https://www.fsis.usda.gov/fsis/api/recall/v/1';

const STATES = {
  WA:[1,1], MT:[3,1], ND:[5,1], MN:[6,1], WI:[7,2], MI:[8,2], VT:[11,1], ME:[12,1],
  OR:[1,2], ID:[2,2], WY:[3,2], SD:[5,2], IA:[6,3], IL:[7,3], IN:[8,3], OH:[9,3], PA:[10,3], NY:[10,2], NH:[11,2], MA:[12,2],
  CA:[1,4], NV:[2,3], UT:[3,3], CO:[4,3], NE:[5,3], MO:[6,4], KY:[8,4], WV:[9,4], VA:[10,4], MD:[11,4], NJ:[11,3], CT:[12,3], RI:[12,4],
  AZ:[2,5], NM:[3,5], KS:[5,4], AR:[6,5], TN:[8,5], NC:[10,5], DE:[11,5],
  OK:[5,5], LA:[6,6], MS:[7,6], AL:[8,6], GA:[9,6], SC:[10,6],
  TX:[5,6], FL:[10,7], AK:[1,7], HI:[2,7], DC:[11,6]
};
const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};

let recalls = [];
let selectedCategory = 'All';
const snapshots = JSON.parse(localStorage.getItem('foodRecallWallSnapshots') || '{}');

function get(obj, ...keys){ for(const k of keys){ if(obj && obj[k] != null && obj[k] !== '') return obj[k]; } return ''; }
function dateOnly(v){ if(!v) return null; const s=String(v); if(/^\d{8}$/.test(s)) return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T12:00:00`); const d=new Date(s); return isNaN(d)?null:d; }
function daysAgo(d){ if(!d) return 9999; return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000)); }
function stripHtml(s){ const d=document.createElement('div'); d.innerHTML=String(s||''); return d.textContent || ''; }
function classifyCategory(text){
  const t=text.toLowerCase();
  if(/beef|steak|ground beef|veal|pork|ham|sausage|meat|chicken|turkey|poultry|duck/.test(t)) return 'Meat & Poultry';
  if(/milk|cheese|cream|butter|yogurt|dairy/.test(t)) return 'Dairy';
  if(/fish|salmon|tuna|shrimp|crab|oyster|seafood|shellfish/.test(t)) return 'Seafood';
  if(/lettuce|spinach|pepper|tomato|produce|fruit|vegetable|melon|cucumber|sprout/.test(t)) return 'Produce';
  if(/cookie|cake|bread|cereal|snack|chip|candy|chocolate|bakery|cracker/.test(t)) return 'Packaged Foods';
  if(/allergen|undeclared|peanut|sesame|wheat|soy|egg/.test(t)) return 'Allergens';
  if(/drink|juice|water|beverage|coffee|tea/.test(t)) return 'Beverages';
  return 'Other';
}
function parseStates(text){
  const t=` ${String(text||'').replace(/[.;()]/g,' ')} `;
  if(/nationwide|all 50 states|national distribution|throughout the united states/i.test(t)) return {nationwide:true, states:Object.keys(STATES).filter(s=>s!=='DC')};
  const found=new Set();
  for(const [abbr,name] of Object.entries(STATE_NAMES)){
    const nameRe=new RegExp(`\\b${name.replace(' ','\\s+')}\\b`,'i');
    const abbrRe=new RegExp(`(?:^|[\\s,;/])${abbr}(?=$|[\\s,;/])`);
    if(nameRe.test(t) || abbrRe.test(t)) found.add(abbr);
  }
  return {nationwide:false, states:[...found]};
}
function riskClass(v){
  const t=String(v||'').toLowerCase();
  if(t.includes('class i') || t.includes('high')) return 'Class I';
  if(t.includes('class ii') || t.includes('medium')) return 'Class II';
  if(t.includes('class iii') || t.includes('low')) return 'Class III';
  return 'Unclassified';
}
function computeScore(r){
  const risk={ 'Class I':100,'Class II':62,'Class III':34,'Unclassified':45 }[r.classification];
  const scope=r.nationwide?45:Math.min(38,r.states.length*2.2);
  const age=daysAgo(r.date);
  const recency=age<=2?30:age<=7?23:age<=30?12:age<=90?5:0;
  const active=r.active?12:0;
  return Math.round(risk+scope+recency+active);
}
function normalizeFDA(x){
  const distribution=get(x,'distribution_pattern'); const geo=parseStates(distribution);
  const r={
    id:`FDA-${get(x,'event_id','recall_number')}`,
    agency:'FDA', company:get(x,'recalling_firm')||'Unknown firm', product:get(x,'product_description')||'Food product',
    reason:get(x,'reason_for_recall')||'See official recall notice.', classification:riskClass(get(x,'classification')),
    status:get(x,'status')||'Ongoing', active:/ongoing/i.test(get(x,'status')||'Ongoing'), date:dateOnly(get(x,'recall_initiation_date','report_date')),
    distribution, states:geo.states, nationwide:geo.nationwide, recallNumber:get(x,'recall_number','event_id'),
    url:'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', source:x
  };
  r.category=classifyCategory(`${r.product} ${r.reason}`); r.score=computeScore(r); return r;
}
function normalizeFSIS(x){
  const title=stripHtml(get(x,'field_recall_title','recall_title','title','RecallTitle'));
  const description=stripHtml(get(x,'field_recall_summary','recall_description','description','RecallDescription'));
  const distribution=stripHtml(get(x,'field_states','states','impacted_states','distribution','field_recall_distribution'));
  const geo=parseStates(distribution || description);
  const r={
    id:`FSIS-${get(x,'field_recall_number','recall_number','id','nid','RecallNumber') || title.slice(0,50)}`,
    agency:'USDA FSIS', company:stripHtml(get(x,'field_recall_company','company_name','company','establishment')) || 'USDA-regulated firm',
    product:title || stripHtml(get(x,'field_product_items','product_description')) || 'Meat, poultry, or egg product',
    reason:stripHtml(get(x,'field_recall_reason','recall_reason','reason')) || description || 'See official recall notice.',
    classification:riskClass(get(x,'field_recall_classification','risk_level','classification','field_risk_level')),
    status:String(get(x,'field_recall_status','recall_type','status')||'Active'), active:!/closed|complete|inactive/i.test(String(get(x,'field_recall_status','recall_type','status')||'Active')),
    date:dateOnly(get(x,'field_recall_date','recall_date','date','created','RecallDate')),
    distribution, states:geo.states, nationwide:geo.nationwide, recallNumber:get(x,'field_recall_number','recall_number','notice_id_number','RecallNumber'),
    url:get(x,'field_recall_url','recall_url','url','RecallURL') || 'https://www.fsis.usda.gov/recalls', source:x
  };
  r.category=classifyCategory(`${r.product} ${r.reason}`); r.score=computeScore(r); return r;
}
async function fetchJSON(url){ const res=await fetch(url,{headers:{'Accept':'application/json'}}); if(!res.ok) throw new Error(`${res.status}`); return res.json(); }
async function loadData(){
  document.getElementById('statusText').textContent='LOADING MARKET';
  const [fda,fsis]=await Promise.allSettled([fetchJSON(FDA_URL),fetchJSON(FSIS_URL)]);
  const errors=[];
  if(fda.status==='fulfilled') recalls.push(...(fda.value.results||[]).map(normalizeFDA)); else errors.push('FDA');
  if(fsis.status==='fulfilled'){
    const raw=Array.isArray(fsis.value)?fsis.value:(fsis.value.results||fsis.value.data||[]);
    recalls.push(...raw.map(normalizeFSIS).filter(r=>r.active));
  } else errors.push('USDA FSIS');
  recalls=dedupe(recalls).filter(r=>r.active).sort((a,b)=>b.score-a.score);
  saveSnapshots();
  render();
  document.getElementById('statusText').textContent=errors.length?'PARTIAL FEED':'LIVE DATA';
  document.getElementById('updatedAt').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  if(errors.length) showError(`${errors.join(' + ')} feed unavailable in this browser. Other source remains live.`);
}
function dedupe(arr){ const seen=new Set(); return arr.filter(r=>{ const k=`${r.agency}|${r.recallNumber||r.product}`; if(seen.has(k)) return false; seen.add(k); return true; }); }
function saveSnapshots(){
  recalls.forEach(r=>{ const old=snapshots[r.id]; r.deltaStates=old?Math.max(0,r.states.length-old.states):0; snapshots[r.id]={states:r.states.length,score:r.score,ts:Date.now()}; });
  localStorage.setItem('foodRecallWallSnapshots',JSON.stringify(snapshots));
}
function filtered(){
  const agency=document.getElementById('agencyFilter').value; const sort=document.getElementById('sortFilter').value;
  let rows=recalls.filter(r=>(selectedCategory==='All'||r.category===selectedCategory)&&(agency==='all'||r.agency===agency));
  rows.sort((a,b)=>sort==='newest'?(b.date||0)-(a.date||0):sort==='scope'?b.states.length-a.states.length:b.score-a.score);
  return rows;
}
function render(){ renderFilters(); renderSummary(); renderMap(); renderLeaderboard(); }
function renderFilters(){
  const cats=['All',...new Set(recalls.map(r=>r.category))];
  document.getElementById('categoryFilters').innerHTML=cats.map(c=>`<button class="filter-btn ${c===selectedCategory?'active':''}" data-cat="${c}">${c.toUpperCase()}</button>`).join('');
  document.querySelectorAll('.filter-btn').forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.cat;render();});
}
function renderSummary(){
  const rows=filtered();
  document.getElementById('activeCount').textContent=rows.length.toLocaleString();
  document.getElementById('highCount').textContent=rows.filter(r=>r.classification==='Class I').length;
  document.getElementById('nationwideCount').textContent=rows.filter(r=>r.nationwide).length;
  document.getElementById('newCount').textContent=rows.filter(r=>daysAgo(r.date)<=7).length;
  const counts={}; rows.forEach(r=>counts[r.category]=(counts[r.category]||0)+1); document.getElementById('topCategory').textContent=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
}
function renderGrid(rows){
  const hot=new Set(rows.flatMap(r=>r.states));
  document.getElementById('usGrid').innerHTML=Object.entries(STATES).map(([abbr,[col,row]])=>`<div class="state-cell ${hot.has(abbr)?'hot':''}" style="grid-column:${col};grid-row:${row}" title="${STATE_NAMES[abbr]}">${abbr}</div>`).join('');
}
function centroid(states){
  const pts=states.map(s=>STATES[s]).filter(Boolean); if(!pts.length) return [6.5,4];
  return [pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length];
}
function cardSize(score){ if(score>=170)return [190,118]; if(score>=135)return [160,100]; if(score>=100)return [135,86]; return [112,72]; }
function placeCards(rows){
  const stage=document.getElementById('recallLayer'); const W=stage.clientWidth||1000,H=stage.clientHeight||500; const placed=[];
  return rows.filter(r=>!r.nationwide&&r.states.length).slice(0,28).map((r,i)=>{
    const [cx,cy]=centroid(r.states); const [w,h]=cardSize(r.score); let x=((cx-.5)/12)*W-w/2, y=((cy-.5)/7)*H-h/2;
    for(let n=0;n<20;n++){
      const overlap=placed.some(p=>!(x+w+5<p.x||x>p.x+p.w+5||y+h+5<p.y||y>p.y+p.h+5));
      if(!overlap)break; const angle=(n*137.5)*Math.PI/180; const radius=12+9*n; x+=Math.cos(angle)*radius; y+=Math.sin(angle)*radius;
      x=Math.max(0,Math.min(W-w,x)); y=Math.max(0,Math.min(H-h,y));
    }
    x=Math.max(0,Math.min(W-w,x)); y=Math.max(0,Math.min(H-h,y)); placed.push({x,y,w,h});
    return cardHTML(r,x,y,w,h);
  }).join('');
}
function cardHTML(r,x,y,w,h){
  const cls=r.classification==='Class I'?'class-i':r.classification==='Class II'?'class-ii':'class-iii';
  const vector=r.deltaStates>0?`▲ +${r.deltaStates} ST`:'→ FLAT';
  return `<article class="recall-card ${cls}" data-id="${encodeURIComponent(r.id)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">
    <div class="score">${r.score}<small> IMPACT</small></div><div class="company">${escapeHTML(r.company)}</div><div class="product">${escapeHTML(r.product)}</div>
    <div class="meta"><span>${r.states.length||'?'} ST</span><span class="vector ${r.deltaStates>0?'up':'flat'}">${vector}</span></div></article>`;
}
function renderMap(){
  const rows=filtered(); renderGrid(rows);
  requestAnimationFrame(()=>{ document.getElementById('recallLayer').innerHTML=placeCards(rows); bindRecallClicks(); });
  document.getElementById('nationwideRail').innerHTML=rows.filter(r=>r.nationwide).slice(0,8).map(r=>`<div class="national-chip" data-id="${encodeURIComponent(r.id)}"><strong>${r.score}</strong> NATIONWIDE // ${escapeHTML(r.company)}</div>`).join('');
  bindRecallClicks();
}
function renderLeaderboard(){
  const rows=filtered().slice(0,40);
  document.getElementById('leaderboard').innerHTML=rows.map((r,i)=>`<div class="leader-row" data-id="${encodeURIComponent(r.id)}">
    <span class="rank">${String(i+1).padStart(2,'0')}</span><strong>${r.score} IDX</strong><span class="${r.classification==='Class I'?'risk-high':r.classification==='Class II'?'risk-medium':'risk-low'}">${r.classification}</span>
    <span>${escapeHTML(r.company)}</span><span class="leader-product">${escapeHTML(r.product)}</span><span>${r.nationwide?'NATL':`${r.states.length} ST`}</span><span class="agency">${r.agency}</span></div>`).join(''); bindRecallClicks();
}
function bindRecallClicks(){ document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openRecall(decodeURIComponent(el.dataset.id))); }
function openRecall(id){
  const r=recalls.find(x=>x.id===id); if(!r)return;
  document.getElementById('dialogContent').innerHTML=`<div class="section-code">${r.agency} // ${escapeHTML(r.recallNumber||'RECALL')}</div><div class="dialog-score">${r.score}</div><h2>${escapeHTML(r.product)}</h2>
  <div class="dialog-grid"><div><div class="detail-label">FIRM</div><div class="detail-value">${escapeHTML(r.company)}</div></div><div><div class="detail-label">CLASSIFICATION</div><div class="detail-value">${r.classification}</div></div>
  <div><div class="detail-label">INITIATED</div><div class="detail-value">${r.date?r.date.toLocaleDateString():'Not reported'}</div></div><div><div class="detail-label">SCOPE</div><div class="detail-value">${r.nationwide?'Nationwide':r.states.length?`${r.states.length} states`:'Distribution not parsed'}</div></div></div>
  <div class="detail-label">REASON</div><div class="dialog-reason">${escapeHTML(r.reason)}</div><div class="detail-label" style="margin-top:16px">DISTRIBUTION</div><div class="detail-value">${escapeHTML(r.distribution||r.states.join(', ')||'See official notice')}</div>
  <a class="official-link" href="${escapeHTML(r.url)}" target="_blank" rel="noopener">OPEN OFFICIAL SOURCE ↗</a>`;
  document.getElementById('recallDialog').showModal();
}
function showError(msg){ const e=document.createElement('div');e.className='error-banner';e.textContent=msg;document.getElementById('mapStage').appendChild(e); }
function escapeHTML(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
document.getElementById('agencyFilter').onchange=render;document.getElementById('sortFilter').onchange=render;document.getElementById('dialogClose').onclick=()=>document.getElementById('recallDialog').close();
window.addEventListener('resize',()=>renderMap());
loadData().catch(err=>{document.getElementById('statusText').textContent='FEED ERROR';showError('Recall feeds could not be loaded. Check browser console or agency availability.');console.error(err)});
