// Pet Food view override. Keeps the main human-food wall intact while adding
// pet-specific categories and species filters.

let recallView='human';
let selectedSpecies='All';

const HUMAN_CATEGORIES=['All','Meat & Poultry','Dairy','Seafood','Produce','Packaged Foods','Allergens','Beverages','Other'];
const PET_CATEGORIES=['All','Dry / Kibble','Wet / Canned','Treats & Chews','Raw / Frozen','Supplements','Other Pet Food'];
const PET_SPECIES=['All','Dog','Cat','Dog & Cat','Bird','Small Animal','Fish / Reptile','Other Pet'];

function petText(r){return `${r.product||''} ${r.reason||''} ${r.company||''}`.toLowerCase()}
function isPetFoodRecall(r){
  const t=petText(r);
  return /\bpet\s*(food|treat|snack|chew|diet|nutrition)|\bdog\s*(food|treat|snack|chew|diet)|\bcat\s*(food|treat|snack|diet)|\bpuppy\s*(food|treat)|\bkitten\s*(food|treat)|\bkibble\b|\bcanine\s*(food|diet|treat)|\bfeline\s*(food|diet|treat)|\braw\s+(dog|cat|pet)\s*food|\bpet\s*supplement/i.test(t);
}
function petSpecies(r){
  const t=petText(r);
  const dog=/\bdog\b|\bcanine\b|\bpuppy\b/.test(t);
  const cat=/\bcat\b|\bfeline\b|\bkitten\b/.test(t);
  if(dog&&cat)return'Dog & Cat';
  if(dog)return'Dog';
  if(cat)return'Cat';
  if(/\bbird\b|\bparrot\b|\bparakeet\b|\bavian\b/.test(t))return'Bird';
  if(/\brabbit\b|\bhamster\b|\bguinea pig\b|\bferret\b|\bgerbil\b|\bchinchilla\b/.test(t))return'Small Animal';
  if(/\breptile\b|\bturtle\b|\blizard\b|\bgecko\b|\bfish food\b|\baquarium\b/.test(t))return'Fish / Reptile';
  return'Other Pet';
}
function petCategory(r){
  const t=petText(r);
  if(/\bkibble\b|\bdry\s+(dog|cat|pet)\s*food|\bdry food\b/.test(t))return'Dry / Kibble';
  if(/\bcanned\b|\bwet\s+(dog|cat|pet)\s*food|\bwet food\b|\bpouch\b/.test(t))return'Wet / Canned';
  if(/\btreat\b|\bchew\b|\bbiscuit\b|\bjerky\b|\bsnack\b/.test(t))return'Treats & Chews';
  if(/\braw\b|\bfrozen\b|\bfresh frozen\b|\bfreeze[- ]dried\b/.test(t))return'Raw / Frozen';
  if(/\bsupplement\b|\bvitamin\b|\bprobiotic\b|\bnutritional supplement\b/.test(t))return'Supplements';
  return'Other Pet Food';
}

function decoratePetRecall(r){
  r.isPetFood=isPetFoodRecall(r);
  r.petSpecies=r.isPetFood?petSpecies(r):'';
  r.petCategory=r.isPetFood?petCategory(r):'';
  return r;
}

// Decorate records produced after this script loads.
const originalNormalizeFDA=normalizeFDA;
normalizeFDA=function(x){return decoratePetRecall(originalNormalizeFDA(x))};
const originalNormalizeFSIS=normalizeFSIS;
normalizeFSIS=function(x){return decoratePetRecall(originalNormalizeFSIS(x))};

// Also decorate anything that may already have loaded from cache.
recalls.forEach(decoratePetRecall);

function viewRows(){
  return recalls.filter(r=>recallView==='pet'?r.isPetFood:!r.isPetFood);
}

baseFiltered=function(){
  const agency=agencyFilter.value;
  return viewRows().filter(r=>{
    const category=recallView==='pet'?r.petCategory:r.category;
    const categoryOK=selectedCategory==='All'||category===selectedCategory;
    const agencyOK=agency==='all'||r.agency===agency;
    const speciesOK=recallView!=='pet'||selectedSpecies==='All'||r.petSpecies===selectedSpecies;
    return categoryOK&&agencyOK&&speciesOK;
  });
};

renderFilters=function(){
  const categories=recallView==='pet'?PET_CATEGORIES:HUMAN_CATEGORIES;
  categoryFilters.innerHTML=categories.map(c=>`<button class="filter-btn ${c===selectedCategory?'active':''}" data-cat="${escapeHTML(c)}">${escapeHTML(c.toUpperCase())}</button>`).join('');
  categoryFilters.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>{selectedCategory=b.dataset.cat;render()}));

  const speciesWrap=document.getElementById('speciesFilters');
  if(speciesWrap){
    speciesWrap.hidden=recallView!=='pet';
    speciesWrap.innerHTML=recallView==='pet'?`<span class="filter-label">SPECIES</span>${PET_SPECIES.map(s=>`<button class="filter-btn species-btn ${s===selectedSpecies?'active':''}" data-species="${escapeHTML(s)}">${escapeHTML(s.toUpperCase())}</button>`).join('')}`:'';
    speciesWrap.querySelectorAll('[data-species]').forEach(b=>b.addEventListener('click',()=>{selectedSpecies=b.dataset.species;render()}));
  }
};

const originalRenderSummary=renderSummary;
renderSummary=function(){
  originalRenderSummary();
  const rows=filtered();
  const counts={};
  rows.forEach(r=>{const c=recallView==='pet'?r.petCategory:r.category;counts[c]=(counts[c]||0)+1});
  topCategory.textContent=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
  const st=stateFilter.value;
  const scope=recallView==='pet'?'PET FOOD':'HUMAN FOOD';
  mapScopeLabel.textContent=st==='all'?`US / ${scope} RECALLS`:`${st} / ${STATE_NAMES[st].toUpperCase()} / ${scope}`;
};

function setRecallView(view){
  recallView=view;
  selectedCategory='All';
  selectedSpecies='All';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const title=document.querySelector('.wall-head h2');
  if(title)title.textContent=view==='pet'?'Pet Food Recall Wall':'Impact Wall';
  render();
}

const viewTabs=document.getElementById('viewTabs');
if(viewTabs){
  viewTabs.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setRecallView(b.dataset.view)));
}

// If cache finished before this override loaded, make sure every record has pet metadata.
const originalRender=render;
render=function(){recalls.forEach(r=>{if(r.isPetFood===undefined)decoratePetRecall(r)});originalRender()};

if(recalls.length)setRecallView(recallView);
