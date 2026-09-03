// Map UI override: keep recall markers in the same SVG coordinate system as the states.
// The internal score is still used for sorting, but is intentionally not shown to users.

function markerPriority(r){
  const risk=r.classification==='Class I'?3:r.classification==='Class II'?2:r.classification==='Class III'?1:0;
  return risk*1000+(r.nationwide?100:r.states.length)+Math.max(0,90-daysAgo(r.date));
}

function markerOrigin(r){return originForRecall(r)}

function markerLabel(r){
  if(r.classification==='Class I')return 'CLASS I';
  if(r.classification==='Class II')return 'CLASS II';
  if(r.classification==='Class III')return 'CLASS III';
  return 'UNCLASS.';
}

function markerScope(r){return r.nationwide?'NATL':`${r.states.length} ST`}

function shortFirm(name,max=16){
  const s=String(name||'Unknown firm').trim();
  return s.length<=max?s:`${s.slice(0,max-1)}…`;
}

function markerBox(origin,rank,placed){
  const c=featureCentroid(origin);if(!c)return null;
  const w=112,h=42;
  const offsets=[
    [10,-50],[-122,-50],[10,8],[-122,8],[28,-21],[-140,-21],
    [10,-92],[-122,-92],[10,50],[-122,50],[62,-50],[-174,-50]
  ];
  for(const[dx,dy]of offsets){
    const box={x:Math.max(4,Math.min(960-w-4,c[0]+dx)),y:Math.max(4,Math.min(600-h-4,c[1]+dy)),w,h};
    if(!placed.some(p=>overlaps(box,p,4)))return{...box,c,origin};
  }
  const angle=rank*2.39996,radius=70+Math.floor(rank/10)*24;
  return {x:Math.max(4,Math.min(960-w-4,c[0]+Math.cos(angle)*radius-w/2)),y:Math.max(4,Math.min(600-h-4,c[1]+Math.sin(angle)*radius-h/2)),w,h,c,origin};
}

function addRecallMarker(svg,r,rank,placed){
  const origin=markerOrigin(r),p=markerBox(origin,rank,placed);if(!p)return;
  placed.push(p);
  const severity=r.classification==='Class I'?'class-i':r.classification==='Class II'?'class-ii':'class-iii';
  const attachX=Math.max(p.x,Math.min(p.x+p.w,p.c[0]));
  const attachY=Math.max(p.y,Math.min(p.y+p.h,p.c[1]));
  const g=svg.append('g').attr('class',`map-recall-marker ${severity}`).attr('tabindex',0).attr('role','button').attr('aria-label',`${r.company}, ${r.classification}, ${markerScope(r)}, origin ${STATE_NAMES[origin]||origin}`).attr('data-id',encodeURIComponent(r.id));
  g.append('line').attr('class','marker-leader').attr('x1',p.c[0]).attr('y1',p.c[1]).attr('x2',attachX).attr('y2',attachY);
  g.append('circle').attr('class','marker-anchor').attr('cx',p.c[0]).attr('cy',p.c[1]).attr('r',4.5);
  g.append('rect').attr('class','marker-box').attr('x',p.x).attr('y',p.y).attr('width',p.w).attr('height',p.h).attr('rx',2);
  g.append('text').attr('class','marker-risk').attr('x',p.x+7).attr('y',p.y+13).text(markerLabel(r));
  g.append('text').attr('class','marker-scope').attr('x',p.x+p.w-7).attr('y',p.y+13).attr('text-anchor','end').text(markerScope(r));
  g.append('text').attr('class','marker-firm').attr('x',p.x+7).attr('y',p.y+28).text(shortFirm(r.company));
  g.append('text').attr('class','marker-origin').attr('x',p.x+7).attr('y',p.y+38).text(`${origin} ORIGIN`);
  const activate=()=>focusRecall(r),clear=()=>clearRecallFocus();
  g.on('mouseenter',activate).on('mouseleave',clear).on('focus',activate).on('blur',clear).on('click',()=>openRecall(r.id)).on('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openRecall(r.id)}});
}

renderMap=function(){
  if(!mapReady||typeof d3==='undefined')return;
  const svg=d3.select(usMap);svg.selectAll('*').remove();
  recallLayer.innerHTML='';
  const projection=d3.geoAlbersUsa().fitExtent([[34,34],[926,550]],{type:'FeatureCollection',features:mapFeatures});
  mapPath=d3.geoPath(projection);
  const rows=baseFiltered(),selected=stateFilter.value;
  svg.append('g').attr('class','states-layer').selectAll('path').data(mapFeatures).join('path')
    .attr('d',mapPath)
    .attr('class',f=>{const a=abbrForFeature(f),n=a?stateActivity(rows,a).length:0;return`state-path ${activityClass(n)} ${selected!=='all'&&a===selected?'selected':''} ${selected!=='all'&&a!==selected?'dimmed':''}`})
    .attr('data-state',abbrForFeature)
    .on('click',(event,f)=>{const a=abbrForFeature(f);if(!a)return;stateFilter.value=selected===a?'all':a;render()});

  const labels=mapFeatures.map(f=>({abbr:abbrForFeature(f),c:mapPath.centroid(f)})).filter(d=>d.abbr&&Number.isFinite(d.c[0]));
  svg.append('g').attr('class','labels-layer').selectAll('text').data(labels).join('text')
    .attr('class','state-label').attr('data-state-label',d=>d.abbr).attr('x',d=>d.c[0]).attr('y',d=>d.c[1]).text(d=>d.abbr);

  const market=filtered().filter(r=>!r.nationwide&&markerOrigin(r)).sort((a,b)=>markerPriority(b)-markerPriority(a));
  const limit=window.matchMedia('(max-width: 700px)').matches?8:14;
  const placed=[];
  market.slice(0,limit).forEach((r,i)=>addRecallMarker(svg,r,i,placed));

  nationwideRail.innerHTML=filtered().filter(r=>r.nationwide).slice(0,8).map(r=>`<div class="national-chip" data-id="${encodeURIComponent(r.id)}"><strong>${escapeHTML(markerLabel(r))}</strong> NATIONWIDE // ${escapeHTML(r.company)}</div>`).join('');
  nationwideRail.querySelectorAll('[data-id]').forEach(node=>node.addEventListener('click',()=>openRecall(decodeURIComponent(node.dataset.id))));
};

renderLeaderboard=function(){
  const rows=filtered().slice(0,40);
  leaderboard.innerHTML=rows.map((r,i)=>`<div class="leader-row" data-id="${encodeURIComponent(r.id)}"><span class="rank">${String(i+1).padStart(2,'0')}</span><strong class="${r.classification==='Class I'?'risk-high':r.classification==='Class II'?'risk-medium':'risk-low'}">${escapeHTML(markerLabel(r))}</strong><span>${r.nationwide?'NATIONWIDE':`${r.states.length} STATES`}</span><span>${escapeHTML(r.company)}</span><span class="leader-product">${escapeHTML(r.product)}</span><span>${r.date?r.date.toLocaleDateString():''}</span><span class="agency">${r.agency}</span></div>`).join('');
  leaderboard.querySelectorAll('[data-id]').forEach(node=>node.addEventListener('click',()=>openRecall(decodeURIComponent(node.dataset.id))));
};

openRecall=function(id){
  const r=recalls.find(x=>x.id===id);if(!r)return;const origin=markerOrigin(r);
  dialogContent.innerHTML=`<div class="section-code">${r.agency} // ${escapeHTML(r.recallNumber||'RECALL')}</div><h2>${escapeHTML(r.product)}</h2><div class="dialog-grid"><div><div class="detail-label">FIRM</div><div class="detail-value">${escapeHTML(r.company)}</div></div><div><div class="detail-label">CLASSIFICATION</div><div class="detail-value">${escapeHTML(markerLabel(r))}</div></div><div><div class="detail-label">ORIGIN</div><div class="detail-value">${origin?`${origin} — ${STATE_NAMES[origin]}`:'Not reported'}</div></div><div><div class="detail-label">INITIATED</div><div class="detail-value">${r.date?r.date.toLocaleDateString():'Not reported'}</div></div><div><div class="detail-label">SCOPE</div><div class="detail-value">${r.nationwide?'Nationwide':r.states.length?`${r.states.length} states`:'Distribution not parsed'}</div></div></div><div class="detail-label">REASON</div><div class="dialog-reason">${escapeHTML(r.reason)}</div><div class="detail-label" style="margin-top:16px">DISTRIBUTION</div><div class="detail-value">${escapeHTML(r.distribution||r.states.join(', ')||'See official notice')}</div><a class="official-link" href="${escapeHTML(r.url)}" target="_blank" rel="noopener">OPEN OFFICIAL SOURCE ↗</a>`;
  recallDialog.showModal();
};

// Re-render once overrides are installed, including when the cache loaded very quickly.
if(mapReady||recalls.length)render();
