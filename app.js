const FDA_URL = 'https://api.fda.gov/food/enforcement.json?search=status:%22Ongoing%22&limit=1000';
const FSIS_URL = 'https://www.fsis.usda.gov/fsis/api/recall/v/1';
const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json';

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};
const FIPS_TO_ABBR = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'
};

let recalls = [];
let selectedCategory = 'All';
let mapFeatures = [];
let mapCentroids = {};
let mapReady = false;
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
  if(/nationwide|all 50 states|national distribution|throughout the united states/i.test(t)) return {nationwide:true, states:Object.keys(STATE_NAMES).filter(s=>s!=='DC')};
  const found=new Set();
  for(const [abbr,name] of Object.entries(STATE_NAMES)){
    const nameRe=new RegExp(`\\b${name.replace(/ /g,'\\s+')}\\b`,'i');
    const abbrRe=new RegExp(`(?:^|[\\s,;/])${abbr}(?=$|[\\s,;/])`,'i');
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
  return Math.round(risk+scope+recency+(r.active?12:0));
}
function normalizeFDA(x){
  const distribution=get(x,'distribution_pattern'); const geo=parseStates(distribution);
  const r={id:`FDA-${get(x,'event_id','recall_number')}`,agency:'FDA',company:get(x,'recalling_firm')||'Unknown firm',product:get(x,'product_description')||'Food product',reason:get(x,'reason_for_recall')||'See official recall notice.',classification:riskClass(get(x,'classification')),status:get(x,'status')||'Ongoing',active:/ongoing/i.test(get(x,'status')||'Ongoing'),date:dateOnly(get(x,'recall_initiation_date','report_date')),distribution,states:geo.states,nationwide:geo.nationwide,recallNumber:get(x,'recall_number','event_id'),url:'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts',source:x};
  r.category=classifyCategory(`${r.product} ${r.reason}`); r.score=computeScore(r); return r;
}
function normalizeFSIS(x){
  const title=stripHtml(get(x,'field_recall_title','recall_title','title','RecallTitle'));
  const description=stripHtml(get(x,'field_recall_summary','recall_description','description','RecallDescription'));
  const distribution=stripHtml(get(x,'field_states','states','impacted_states','distribution','field_recall_distribution'));
  const geo=parseStates(distribution || description);
  const r={id:`FSIS-${get(x,'field_recall_number','recall_number','id','nid','RecallNumber') || title.slice(0,50)}`,agency:'USDA FSIS',company:stripHtml(get(x,'field_recall_company','company_name','company','establishment'))||'USDA-regulated firm',product:title||stripHtml(get(x,'field_product_items','product_description'))||'Meat, poultry, or egg product',reason:stripHtml(get(x,'field_recall_reason','recall_reason','reason'))||description||'See official recall notice.',classification:riskClass(get(x,'field_recall_classification','risk_level','classification','field_risk_level')),status:String(get(x,'field_recall_status','recall_type','status')||'Active'),active:!/closed|complete|inactive/i.test(String(get(x,'field_recall_status','recall_type','status')||'Active')),date:dateOnly(get(x,'field_recall_date','recall_date','date','created','RecallDate')),distribution,states:geo.states,nationwide:geo.nationwide,recallNumber:get(x,'field_recall_number','recall_number','notice_id_number','RecallNumber'),url:get(x,'field_recall_url','recall_url','url','RecallURL')||'https://www.fsis.usda.gov/recalls',source:x};
  r.category=classifyCategory(`${r.product} ${r.reason}`); r.score=computeScore(r); return r;
}
async function fetchJSON(url){ const res=await fetch(url,{headers:{Accept:'application/json'}}); if(!res.ok) throw new Error(`${res.status}`); return res.json(); }
async function loadMap(){
  if(typeof d3==='undefined' || typeof topojson==='undefined') throw new Error('Map libraries unavailable');
  const us=await fetchJSON(US_ATLAS_URL);
  mapFeatures=topojson.feature(us,us.objects.states).features;
  mapReady=true;
}
async function loadData(){
  document.getElementById('statusText').textContent='LOADING MARKET';
  const [fda,fsis,map]=await Promise.allSettled([fetchJSON(FDA_URL),fetchJSON(FSIS_URL),loadMap()]);
  const errors=[];
  if(fda.status==='fulfilled') recalls.push(...(fda.value.results||[]).map(normalizeFDA)); else errors.push('FDA');
  if(fsis.status==='fulfilled'){
    const raw=Array.isArray(fsis.value)?fsis.value:(fsis.value.results||fsis.value.data||[]);
    recalls.push(...raw.map(normalizeFSIS).filter(r=>r.active));
  } else errors.push('USDA FSIS');
  if(map.status!=='fulfilled') errors.push('MAP');
  recalls=dedupe(recalls).filter(r=>r.active).sort((a,b)=>b.score-a.score);
  saveSnapshots(); setupStateFilter(); render();
  document.getElementById('statusText').textContent=errors.length?'PARTIAL FEED':'LIVE DATA';
  document.getElementById('updatedAt').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  if(errors.length) showError(`${errors.join(' + ')} unavailable. Other data remains live.`);
}
function dedupe(arr){ const seen=new Set(); return arr.filter(r=>{ const k=`${r.agency}|${r.recallNumber||r.product}`; if(seen.has(k)) return false; seen.add(k); return true; }); }
function saveSnapshots(){ recalls.forEach(r=>{ const old=snapshots[r.id]; r.deltaStates=old?Math.max(0,r.states.length-old.states):0; snapshots[r.id]={states:r.states.length,score:r.score,ts:Date.now()}; }); localStorage.setItem('foodRecallWallSnapshots',JSON.stringify(snapshots)); }
function setupStateFilter(){
  const select=document.getElementById('stateFilter');
  const options=Object.entries(STATE_NAMES).filter(([a])=>a!=='DC').sort((a,b)=>a[1].localeCompare(b[1]));
  select.innerHTML='<option value="all">ALL STATES</option>'+options.map(([abbr,name])=>`<option value="${abbr}">${name.toUpperCase()}</option>`).join('');
}
function baseFiltered(){
  const agency=document.getElementById('agencyFilter').value;
  return recalls.filter(r=>(selectedCategory==='All'||r.category===selectedCategory)&&(agency==='all'||r.agency===agency));
}
function filtered(){
  const sort=document.getElementById('sortFilter').value; const state=document.getElementById('stateFilter').value;
  let rows=baseFiltered().filter(r=>state==='all'||r.nationwide||r.states.includes(state));
  rows.sort((a,b)=>sort==='newest'?(b.date||0)-(a.date||0):sort==='scope'?b.states.length-a.states.length:b.score-a.score);
  return rows;
}
function render(){ renderFilters(); renderSummary(); renderMap(); renderLeaderboard(); }
function renderFilters(){
  const cats=['All',...new Set(recalls.map(r=>r.category))];
  document.getElementById('categoryFilters').innerHTML=cats.map(c=>`<button class="filter-btn ${c===selectedCategory?'active':''}" data-cat="${escapeHTML(c)}">${escapeHTML(c.toUpperCase())}</button>`).join('');
  document.querySelectorAll('.filter-btn').forEach(b=>b.onclick=()=>{ selectedCategory=b.dataset.cat; render(); });
}
function renderSummary(){
  const rows=filtered();
  document.getElementById('activeCount').textContent=rows.length.toLocaleString(); document.getElementById('highCount').textContent=rows.filter(r=>r.classification==='Class I').length; document.getElementById('nationwideCount').textContent=rows.filter(r=>r.nationwide).length; document.getElementById('newCount').textContent=rows.filter(r=>daysAgo(r.date)<=7).length;
  const counts={}; rows.forEach(r=>counts[r.category]=(counts[r.category]||0)+1); document.getElementById('topCategory').textContent=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
  const state=document.getElementById('stateFilter').value; document.getElementById('mapScopeLabel').textContent=state==='all'?'US / ACTIVE RECALLS':`${state} / ${STATE_NAMES[state].toUpperCase()} / ACTIVE RECALLS`;
}
function stateActivity(rows,abbr){ return rows.filter(r=>r.nationwide||r.states.includes(abbr)); }
function activityClass(count){ if(count>=10)return 'activity-4'; if(count>=6)return 'activity-3'; if(count>=3)return 'activity-2'; if(count>=1)return 'activity-1'; return ''; }
function drawGeographicMap(){
  if(!mapReady) return;
  const svg=d3.select('#usMap'); svg.selectAll('*').remove();
  const projection=d3.geoAlbersUsa().fitExtent([[28,24],[932,554]],{type:'FeatureCollection',features:mapFeatures});
  const path=d3.geoPath(projection); const rows=baseFiltered(); const selected=document.getElementById('stateFilter').value;
  mapCentroids={};
  for(const f of mapFeatures){ const abbr=FIPS_TO_ABBR[String(f.id).padStart(2,'0')]; if(abbr) mapCentroids[abbr]=path.centroid(f); }
  svg.append('g').selectAll('path').data(mapFeatures).join('path').attr('d',path).attr('class',f=>{
    const abbr=FIPS_TO_ABBR[String(f.id).padStart(2,'0')]; const count=abbr?stateActivity(rows,abbr).length:0; return `state-path ${activityClass(count)} ${selected!=='all'&&abbr===selected?'selected':''} ${selected!=='all'&&abbr!==selected?'dimmed':''}`;
  }).attr('data-state',f=>FIPS_TO_ABBR[String(f.id).padStart(2,'0')]||'').attr('aria-label',f=>{ const a=FIPS_TO_ABBR[String(f.id).padStart(2,'0')]; return a?`${STATE_NAMES[a]}: ${stateActivity(rows,a).length} recalls`:''; }).on('click',(event,f)=>{ const abbr=FIPS_TO_ABBR[String(f.id).padStart(2,'0')]; if(!abbr)return; document.getElementById('stateFilter').value=(selected===abbr?'all':abbr); render(); });
  const labelData=mapFeatures.map(f=>{ const abbr=FIPS_TO_ABBR[String(f.id).padStart(2,'0')]; return {abbr,centroid:path.centroid(f)}; }).filter(x=>x.abbr&&Number.isFinite(x.centroid[0]));
  const labels=svg.append('g');
  labels.selectAll('text.state-label').data(labelData).join('text').attr('class',d=>`state-label ${selected===d.abbr?'selected':''}`).attr('x',d=>d.centroid[0]).attr('y',d=>d.centroid[1]-1).text(d=>d.abbr);
  labels.selectAll('text.state-count').data(labelData.filter(d=>stateActivity(rows,d.abbr).length>0)).join('text').attr('class','state-count').attr('x',d=>d.centroid[0]).attr('y',d=>d.centroid[1]+10).text(d=>stateActivity(rows,d.abbr).length);
}
function cardSize(score){ if(score>=170)return [190,118]; if(score>=135)return [160,100]; if(score>=100)return [135,86]; return [112,72]; }
function recallAnchor(r){
  const selected=document.getElementById('stateFilter').value;
  if(selected!=='all' && mapCentroids[selected]) return mapCentroids[selected];
  const pts=r.states.map(s=>mapCentroids[s]).filter(p=>p&&Number.isFinite(p[0])); if(!pts.length)return [480,300];
  return [pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length];
}
function placeCards(rows){
  const stage=document.getElementById('recallLayer'); const W=stage.clientWidth||1000,H=stage.clientHeight||580; const placed=[]; const sx=W/960, sy=H/600;
  return rows.filter(r=>!r.nationwide&&r.states.length).slice(0,24).map(r=>{
    const [ax,ay]=recallAnchor(r); const [w,h]=cardSize(r.score); let x=ax*sx-w/2,y=ay*sy-h/2;
    for(let n=0;n<28;n++){
      const overlap=placed.some(p=>!(x+w+6<p.x||x>p.x+p.w+6||y+h+6<p.y||y>p.y+p.h+6));
      if(!overlap)break; const angle=n*2.39996; const radius=12+8*n; x=ax*sx-w/2+Math.cos(angle)*radius; y=ay*sy-h/2+Math.sin(angle)*radius;
    }
    x=Math.max(0,Math.min(W-w,x)); y=Math.max(0,Math.min(H-h,y)); placed.push({x,y,w,h}); return cardHTML(r,x,y,w,h);
  }).join('');
}
function cardHTML(r,x,y,w,h){
  const cls=r.classification==='Class I'?'class-i':r.classification==='Class II'?'class-ii':'class-iii'; const vector=r.deltaStates>0?`▲ +${r.deltaStates} ST`:'→ FLAT';
  return `<article class="recall-card ${cls}" data-id="${encodeURIComponent(r.id)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="score">${r.score}<small> IMPACT</small></div><div class="company">${escapeHTML(r.company)}</div><div class="product">${escapeHTML(r.product)}</div><div class="meta"><span>${r.states.length||'?'} ST</span><span class="vector ${r.deltaStates>0?'up':'flat'}">${vector}</span></div></article>`;
}
function renderMap(){
  const rows=filtered(); drawGeographicMap();
  requestAnimationFrame(()=>{ document.getElementById('recallLayer').innerHTML=placeCards(rows); bindRecallClicks(); });
  document.getElementById('nationwideRail').innerHTML=rows.filter(r=>r.nationwide).slice(0,8).map(r=>`<div class="national-chip" data-id="${encodeURIComponent(r.id)}"><strong>${r.score}</strong> NATIONWIDE // ${escapeHTML(r.company)}</div>`).join(''); bindRecallClicks();
}
function renderLeaderboard(){
  const rows=filtered().slice(0,40);
  document.getElementById('leaderboard').innerHTML=rows.map((r,i)=>`<div class="leader-row" data-id="${encodeURIComponent(r.id)}"><span class="rank">${String(i+1).padStart(2,'0')}</span><strong>${r.score} IDX</strong><span class="${r.classification==='Class I'?'risk-high':r.classification==='Class II'?'risk-medium':'risk-low'}">${r.classification}</span><span>${escapeHTML(r.company)}</span><span class="leader-product">${escapeHTML(r.product)}</span><span>${r.nationwide?'NATL':`${r.states.length} ST`}</span><span class="agency">${r.agency}</span></div>`).join(''); bindRecallClicks();
}
function bindRecallClicks(){ document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openRecall(decodeURIComponent(el.dataset.id))); }
function openRecall(id){
  const r=recalls.find(x=>x.id===id); if(!r)return;
  document.getElementById('dialogContent').innerHTML=`<div class="section-code">${r.agency} // ${escapeHTML(r.recallNumber||'RECALL')}</div><div class="dialog-score">${r.score}</div><h2>${escapeHTML(r.product)}</h2><div class="dialog-grid"><div><div class="detail-label">FIRM</div><div class="detail-value">${escapeHTML(r.company)}</div></div><div><div class="detail-label">CLASSIFICATION</div><div class="detail-value">${r.classification}</div></div><div><div class="detail-label">INITIATED</div><div class="detail-value">${r.date?r.date.toLocaleDateString():'Not reported'}</div></div><div><div class="detail-label">SCOPE</div><div class="detail-value">${r.nationwide?'Nationwide':r.states.length?`${r.states.length} states`:'Distribution not parsed'}</div></div></div><div class="detail-label">REASON</div><div class="dialog-reason">${escapeHTML(r.reason)}</div><div class="detail-label" style="margin-top:16px">DISTRIBUTION</div><div class="detail-value">${escapeHTML(r.distribution||r.states.join(', ')||'See official notice')}</div><a class="official-link" href="${escapeHTML(r.url)}" target="_blank" rel="noopener">OPEN OFFICIAL SOURCE ↗</a>`;
  document.getElementById('recallDialog').showModal();
}
function showError(msg){ const e=document.createElement('div');e.className='error-banner';e.textContent=msg;document.getElementById('mapStage').appendChild(e); }
function escapeHTML(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

document.getElementById('agencyFilter').onchange=render;
document.getElementById('sortFilter').onchange=render;
document.getElementById('stateFilter').onchange=render;
document.getElementById('dialogClose').onclick=()=>document.getElementById('recallDialog').close();
window.addEventListener('resize',()=>renderMap());
loadData().catch(err=>{ document.getElementById('statusText').textContent='FEED ERROR'; showError('Recall feeds could not be loaded. Check browser console or agency availability.'); console.error(err); });
