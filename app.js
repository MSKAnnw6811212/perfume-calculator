/* Full JS: Simple + Pro + Batch helper + IFRA fallback */
const $$=s=>document.querySelector(s), $$$=s=>document.querySelectorAll(s);

const state={
  mode:'simple',
  ingredientsList:[], // array of {name, ifraLimits?, casNumber?, notes?}
  ifraFallback:{},   // name -> {4,5A,5B,9}
  versionData:null,
  registration:null,
};

/* Utilities */
async function fetchJSON(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(u+': '+r.status);return r.json();}
function setMode(m){state.mode=m;localStorage.setItem('pc_mode',m);renderMode();}
function renderMode(){$$('#simpleSection').hidden=state.mode!=='simple';$$('#proSection').hidden=state.mode!=='pro';$$$('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));}

/* Data loading + Update banner */
async function loadData(){
  try{
    const [ings, ifra, ver] = await Promise.all([
      fetchJSON('data/ingredients.json'),
      fetchJSON('data/ifra.json').catch(()=>({})),
      fetchJSON('version.json').catch(()=>({})),
    ]);
    state.ingredientsList = ings||[];
    state.ifraFallback = ifra||{};
    state.versionData = ver?.data || null;
    const dl=$$('#ingredientList'); dl.innerHTML='';
    state.ingredientsList.forEach(o=>{const op=document.createElement('option');op.value=o.name;dl.appendChild(op);});
    if($$('#dataStatus')) $$('#dataStatus').textContent = `Data loaded (version: ${state.versionData||'n/a'})`;
    maybeShowUpdateBannerOnVersion();
  }catch(e){console.error(e); if($$('#dataStatus')) $$('#dataStatus').textContent='Failed to load data.';}
}
function maybeShowUpdateBannerOnVersion(){
  const cur=state.versionData||null, prev=localStorage.getItem('pc_data_version');
  if(prev && cur && prev!==cur) showUpdateBanner();
  if(cur) localStorage.setItem('pc_data_version',cur);
}
function showUpdateBanner(){ $$('#updateBanner').hidden=false; }
function setupUpdateRefresh(){
  $$('#refreshBtn').addEventListener('click', async () => {
    if (state.registration?.waiting) {
      state.registration.waiting.postMessage({ type:'SKIP_WAITING' });
    } else {
      await Promise.all([
        fetch('version.json',{cache:'reload'}),
        fetch('data/ingredients.json',{cache:'reload'}),
        fetch('data/ifra.json',{cache:'reload'}),
      ]);
      window.location.reload();
    }
  });
}

/* Theme + PWA */
function setupTheme(){const sv=localStorage.getItem('pc_theme');if(sv)document.documentElement.setAttribute('data-theme',sv);syncThemeMeta();$$('#themeToggle').addEventListener('click',()=>{const c=document.documentElement.getAttribute('data-theme')||'light';const n=c==='light'?'dark':'light';document.documentElement.setAttribute('data-theme',n);localStorage.setItem('pc_theme',n);syncThemeMeta();});}
function syncThemeMeta(){const t=document.documentElement.getAttribute('data-theme')||'light';document.getElementById('theme-color-meta').setAttribute('content',t==='dark'?'#0e0f13':'#ffffff');}
function registerSW(){if('serviceWorker'in navigator){window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./sw.js');state.registration=reg;function showIfWaiting(){if(reg.waiting)showUpdateBanner();}reg.addEventListener('updatefound',()=>{const nw=reg.installing;if(nw)nw.addEventListener('statechange',()=>{if(nw.state==='installed'&&navigator.serviceWorker.controller)showUpdateBanner();});});showIfWaiting();navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload());}catch(e){console.warn('SW reg failed',e);}});}}
let deferredPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=$$('#installBtn');b.hidden=false;b.onclick=async()=>{b.hidden=true;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;};});

/* ---------- SIMPLE MODE ---------- */
function s_addRow(d={name:'',pct:0}){
  const tb=$$('#tableBody'); const tr=document.createElement('tr');
  const idx=document.createElement('td'); idx.className='row-index'; tr.appendChild(idx);
  const ntd=document.createElement('td'); const ni=document.createElement('input'); ni.type='text'; ni.setAttribute('list','ingredientList'); ni.value=d.name||''; ni.placeholder='Ingredient name'; ni.addEventListener('input', s_update); ntd.appendChild(ni); tr.appendChild(ntd);
  const ptd=document.createElement('td'); const pi=document.createElement('input'); pi.type='number'; pi.min='0'; pi.max='100'; pi.step='0.01'; pi.value=d.pct??0; pi.addEventListener('input', s_update); ptd.appendChild(pi); tr.appendChild(ptd);
  const finTd=document.createElement('td'); finTd.className='finished'; finTd.textContent='0'; tr.appendChild(finTd);
  ['4','5A','5B','9'].forEach(cat=>{ const td=document.createElement('td'); td.className='ifra ifra-'+cat; td.innerHTML='<span class=\"status\">n/a</span>'; tr.appendChild(td); });
  const act=document.createElement('td'); const rm=document.createElement('button'); rm.textContent='Remove'; rm.className='danger'; rm.onclick=()=>{ tr.remove(); s_update(); }; act.appendChild(rm); tr.appendChild(act);
  tb.appendChild(tr); s_renumber(); s_update();
}
function s_renumber(){ $$$('#tableBody .row-index').forEach((td,i)=>td.textContent=i+1); }
function s_rows(){ return Array.from($$$('#tableBody tr')).map(tr=>{ const name=tr.querySelector('input[list]')?.value?.trim()||''; const pct=parseFloat(tr.querySelector('input[type=number]')?.value||'0'); return {tr,name,pct:isNaN(pct)?0:pct}; }); }
function s_fin(pct, dosage){ return (pct*dosage)/100; }
function s_badge(val, limit){
  if(limit==null||isNaN(limit)) return `<span class="status">n/a</span>`;
  if(val<=limit){ const ratio=limit>0?(val/limit):0; if(ratio>0.8) return `<span class="status warn">${val.toFixed(3)} ≤ ${limit}%</span>`; return `<span class="status ok">${val.toFixed(3)} ≤ ${limit}%</span>`; }
  return `<span class="status fail">${val.toFixed(3)} > ${limit}%</span>`;
}
function s_update(){
  const dosage=parseFloat($$('#dosage').value||'0'); const rows=s_rows();
  let totalConc=0,totalFin=0;
  rows.forEach(({tr,name,pct})=>{
    totalConc+=pct; const fin=s_fin(pct,dosage); totalFin+=fin; tr.querySelector('.finished').textContent=fin.toFixed(3);
    // Look up limits: 1) ingredient.ifraLimits 2) fallback file
    const entry = state.ingredientsList.find(i => (i.name||'').toLowerCase()===name.toLowerCase());
    const limits = (entry && entry.ifraLimits) ? entry.ifraLimits : (state.ifraFallback[name] || {});
    ['4','5A','5B','9'].forEach(cat=>{ const lim=parseFloat(limits?.[cat]); tr.querySelector('.ifra-'+cat).innerHTML=s_badge(fin, lim); });
  });
  $$('#totalConcentrate').textContent=totalConc.toFixed(3);
  $$('#totalFinished').textContent=totalFin.toFixed(3);
}
function s_save(){ const name=$$('#recipeName').value.trim(); if(!name){alert('Enter a recipe name'); return;} const dosage=parseFloat($$('#dosage').value||'0'); const rows=s_rows().map(r=>({name:r.name,pct:r.pct})); const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); all[name]={dosage,rows}; localStorage.setItem('pc_recipes_v1',JSON.stringify(all)); s_pop(name); }
function s_pop(sel=''){ const s=$$('#savedRecipes'); const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); s.innerHTML=''; Object.keys(all).sort().forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; if(k===sel) o.selected=true; s.appendChild(o); }); }
function s_loadSel(){ const name=$$('#savedRecipes').value; const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); const rec=all[name]; if(!rec){ alert('Not found'); return; } $$('#tableBody').innerHTML=''; $$('#dosage').value=rec.dosage; (rec.rows||[]).forEach(r=>s_addRow(r)); s_update(); }
function s_delSel(){ const name=$$('#savedRecipes').value; const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); if(!name||!all[name]) return; if(!confirm(`Delete recipe "${name}"?`)) return; delete all[name]; localStorage.setItem('pc_recipes_v1',JSON.stringify(all)); s_pop(); }
function s_csv(){ const rows=s_rows(); const dosage=parseFloat($$('#dosage').value||'0'); const heads=['#','Ingredient','% in concentrate','Dosage %','Finished %','IFRA 4','IFRA 5A','IFRA 5B','IFRA 9']; const lines=[heads.join(',')]; rows.forEach((r,i)=>{ const fin=s_fin(r.pct,dosage); const entry=state.ingredientsList.find(x=>(x.name||'').toLowerCase()===(r.name||'').toLowerCase()); const limits = (entry && entry.ifraLimits) ? entry.ifraLimits : (state.ifraFallback[r.name] || {}); const cats=['4','5A','5B','9']; const sts=cats.map(c=>{ const L=parseFloat(limits?.[c]); if(L==null||isNaN(L)) return 'n/a'; return fin<=L?'OK':'FAIL'; }); lines.push([i+1,`"${(r.name||'').replace(/"/g,'""')}"`,r.pct,dosage,fin.toFixed(4),...sts].join(',')); }); const blob=new Blob([lines.join('\\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='perfume-recipe-simple.csv'; a.click(); URL.revokeObjectURL(url); }

/* Batch helper (Simple) */
function batch_compute(){
  const targetMl=parseFloat($$('#batchVolume').value||'0'); const density=parseFloat($$('#batchDensity').value||'0.85'); const dosage=parseFloat($$('#dosage').value||'0'); const oilMl=targetMl*(dosage/100);
  const rowsEl=$$('#batchBody'); if(!rowsEl) return;
  const rows=s_rows().filter(r=>r.name && r.pct>0); rowsEl.innerHTML='';
  let pctSum=0,volSum=0,wtSum=0;
  rows.forEach(r=>{ const ml=oilMl*(r.pct/100); const g=ml*density; pctSum+=r.pct; volSum+=ml; wtSum+=g; const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.name}</td><td>${r.pct.toFixed(2)}</td><td>${ml.toFixed(3)}</td><td>${g.toFixed(3)}</td>`; rowsEl.appendChild(tr); });
  $$('#batchPctTotal').textContent=pctSum.toFixed(2); $$('#batchVolTotal').textContent=volSum.toFixed(3); $$('#batchWtTotal').textContent=wtSum.toFixed(3);
  const solventMl = Math.max(0, targetMl - oilMl); $$('#batchSummary').textContent = `Finished volume: ${targetMl.toFixed(1)} ml — Oil: ${oilMl.toFixed(1)} ml — Solvent: ${solventMl.toFixed(1)} ml (at ${dosage.toFixed(1)}% dosage)`;
}
function batch_exportCSV(){
  const rows=Array.from($$$('#batchBody tr')).map(tr=>{const t=tr.querySelectorAll('td');return{n:t[0].textContent,p:t[1].textContent,ml:t[2].textContent,g:t[3].textContent};}); if(!rows.length){alert('No batch rows. Click Calculate first.'); return;}
  const heads=['Ingredient','% in concentrate','Oil volume (ml)','Weight (g)']; const lines=[heads.join(',')]; rows.forEach(r=>lines.push([`"${r.n.replace(/"/g,'""')}"`,r.p,r.ml,r.g].join(','))); lines.push(['Totals',$$('#batchPctTotal').textContent,$$('#batchVolTotal').textContent,$$('#batchWtTotal').textContent].join(',')); const blob=new Blob([lines.join('\\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='batch-scaled-simple.csv'; a.click(); URL.revokeObjectURL(url);
}

/* ---------- PRO MODE ---------- */
function p_newRow(d={}){
  const tr=document.createElement('tr'); tr.innerHTML=`
    <td><input type="text" class="p-name" list="ingredientList" placeholder="Type or select..." autocomplete="off"></td>
    <td><input type="number" class="p-vol" step="0.01" value="${d.vol??0}"></td>
    <td><input type="number" class="p-den" step="0.01" value="${d.den??0.85}"></td>
    <td><input type="number" class="p-wt" step="0.01" value="${d.wt??0}"></td>
    <td><input type="number" class="p-price" step="0.01" value="${d.price??0}"></td>
    <td class="p-cost">0.00</td>
    <td class="p-pct">0.00 %</td>
    <td>
      <select class="p-note">
        <option value="N/A">N/A</option><option>Top</option><option>Middle</option><option>Base</option>
      </select>
    </td>
    <td><input type="text" class="p-supplier"></td>
    <td><input type="text" class="p-cas"></td>
    <td><textarea class="p-notes"></textarea></td>
    <td class="p-del">❌</td>`;
  $$('#proBody').appendChild(tr);
  return tr;
}
function p_rows(){ return Array.from($$$('#proBody tr')); }
function p_calc(){
  const rows=p_rows(); let tw=0,tv=0,tc=0; const noteW={Top:0,Middle:0,Base:0,'N/A':0};
  rows.forEach(tr=>{ tw+=parseFloat(tr.querySelector('.p-wt').value)||0; });
  rows.forEach(tr=>{
    const v=parseFloat(tr.querySelector('.p-vol').value)||0;
    const d=parseFloat(tr.querySelector('.p-den').value)||0;
    const w=parseFloat(tr.querySelector('.p-wt').value)||0;
    const pr=parseFloat(tr.querySelector('.p-price').value)||0;
    const cost=(w/10)*pr;
    tr.querySelector('.p-cost').textContent=cost.toFixed(2);
    const pct=tw>0?(w/tw*100):0;
    tr.querySelector('.p-pct').textContent=pct.toFixed(2)+' %';
    tv+=v; tc+=cost;
    const note=tr.querySelector('.p-note').value; if(noteW[note]!=null) noteW[note]+=w;
  });
  $$('#proTotalVol').textContent=tv.toFixed(2);
  $$('#proTotalWt').textContent=tw.toFixed(2);
  $$('#proTotalCost').textContent=tc.toFixed(2);
  $$('#proTotalPct').textContent='100.00 %';
  // Note balance
  let txt=[]; for(const k in noteW){ const pct=tw>0?(noteW[k]/tw*100).toFixed(1):'0.0'; txt.push(`${k}: ${pct}%`); }
  $$('#noteSummaryText').textContent = txt.join(' | ');
  p_ifra();
}
function p_ifra(){
  const cat=$$('#ifraCategory').value; const rows=p_rows(); const bad=[];
  rows.forEach(tr=>{
    const name=(tr.querySelector('.p-name').value||'').trim();
    const pct=parseFloat(tr.querySelector('.p-pct').textContent)||0;
    const entry = state.ingredientsList.find(i => (i.name||'').toLowerCase()===name.toLowerCase());
    const lim = (entry && entry.ifraLimits && entry.ifraLimits[cat]!=null) ? entry.ifraLimits[cat] : (state.ifraFallback[name]?.[cat]);
    if(lim!=null && !isNaN(lim) && pct>parseFloat(lim)) bad.push({name,pct:pct.toFixed(2),limit:lim});
  });
  const st=$$('#ifraStatusText'), wrap=$$('#ifraStatus');
  if(bad.length){ wrap.style.borderColor='var(--danger)'; st.innerHTML=`<strong>⚠ Non-compliant for Cat ${cat}</strong><ul>`+bad.map(o=>`<li><b>${o.name}</b> ${o.pct}% > limit ${o.limit}%</li>`).join('')+`</ul>`; }
  else{ wrap.style.borderColor='var(--ok)'; st.innerHTML=`<strong>✅ Compliant for Cat ${cat}</strong>`; }
}
function p_onInput(e){
  const tr=e.target.closest('tr'); if(!tr) return;
  if(e.target.classList.contains('p-name')){
    const sel=state.ingredientsList.find(i=>i.name===e.target.value);
    if(sel){ tr.querySelector('.p-cas').value=sel.casNumber||''; tr.querySelector('.p-price').value=sel.pricePer10g||0; tr.querySelector('.p-notes').value=sel.notes||''; tr.querySelector('.p-den').value=sel.density||tr.querySelector('.p-den').value; }
  }
  if(e.target.classList.contains('p-vol')||e.target.classList.contains('p-den')){
    const v=parseFloat(tr.querySelector('.p-vol').value)||0; const d=parseFloat(tr.querySelector('.p-den').value)||0; tr.querySelector('.p-wt').value=(v*d).toFixed(3);
  } else if(e.target.classList.contains('p-wt')){
    const d=parseFloat(tr.querySelector('.p-den').value)||0; if(d>0){ tr.querySelector('.p-vol').value=(parseFloat(tr.querySelector('.p-wt').value)/d).toFixed(3); }
  }
  p_calc();
}
function p_bind(){
  $$('#proAdd').onclick=()=>{ p_newRow(); p_calc(); };
  $$('#proBody').addEventListener('input', p_onInput);
  $$('#proBody').addEventListener('change', p_calc);
  $$('#proBody').addEventListener('click', e=>{ if(e.target.classList.contains('p-del')){ e.target.closest('tr').remove(); p_calc(); } });
  $$('#ifraCategory').onchange=p_ifra;
  $$('#proPrint').onclick=()=>window.print();
  $$('#proSave').onclick=p_save;
  $$('#proLoad').onclick=p_loadSel;
  $$('#proDelete').onclick=p_delSel;
  $$('#proNew').onclick=()=>{ $$('#proBody').innerHTML=''; p_newRow(); p_calc(); };
  // Helper
  const hc=$$('#helperCost'), hw=$$('#helperWeight'); const out=$$('#helperResult');
  function upd(){ const c=parseFloat(hc.value)||0; const w=parseFloat(hw.value)||0; out.textContent = w>0 ? `€${(c/w*10).toFixed(2)} per 10g` : '€0.00 per 10g'; }
  if(hc){ hc.oninput=upd; hw.oninput=upd; }
  // CSV
  $$('#proExport').onclick=p_csv;
}
function p_collect(){ return Array.from($$$('#proBody tr')).map(tr=>({
  name:(tr.querySelector('.p-name').value||'').trim(), vol:parseFloat(tr.querySelector('.p-vol').value)||0, den:parseFloat(tr.querySelector('.p-den').value)||0, wt:parseFloat(tr.querySelector('.p-wt').value)||0,
  price:parseFloat(tr.querySelector('.p-price').value)||0, note:tr.querySelector('.p-note').value||'N/A', supplier:tr.querySelector('.p-supplier').value||'', cas:tr.querySelector('.p-cas').value||'', notes:tr.querySelector('.p-notes').value||'',
})); }
function p_save(){ const n=prompt('Recipe name?'); if(!n) return; const payload={cat:$$('#ifraCategory').value, targetVol:parseFloat($$('#targetVolume').value)||0, rows:p_collect()}; const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); all[n]=payload; localStorage.setItem('pc_pro_recipes_v1', JSON.stringify(all)); p_pop(n); }
function p_pop(sel=''){ const s=$$('#proSaved'); const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); s.innerHTML=''; Object.keys(all).sort().forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; if(k===sel) o.selected=true; s.appendChild(o); }); }
function p_loadSel(){ const n=$$('#proSaved').value; const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); const rec=all[n]; if(!rec){ alert('Not found'); return; } $$('#ifraCategory').value=rec.cat||'4'; $$('#targetVolume').value=rec.targetVol||0; $$('#proBody').innerHTML=''; (rec.rows||[]).forEach(r=>p_newRow(r)); p_calc(); }
function p_delSel(){ const n=$$('#proSaved').value; const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); if(!n||!all[n]) return; if(!confirm(`Delete recipe "${n}"?`)) return; delete all[n]; localStorage.setItem('pc_pro_recipes_v1', JSON.stringify(all)); p_pop(); }
function p_csv(){ const rows=p_collect(); const heads=['Ingredient','Volume (ml)','Density (g/ml)','Weight (g)','Price/10g (€)','Cost (€)','Formula % (by wt)','Note','Supplier','CAS','Notes']; const lines=[heads.join(',')]; const tw=rows.reduce((a,b)=>a+(b.wt||0),0); rows.forEach(r=>{ const cost=(r.wt/10)*(r.price||0); const pct=tw>0?(r.wt/tw*100):0; lines.push([`"${(r.name||'').replace(/"/g,'""')}"`,r.vol,r.den,r.wt,(r.price||0).toFixed(2),cost.toFixed(2),pct.toFixed(2),r.note,r.supplier,r.cas,`"${(r.notes||'').replace(/"/g,'""')}"`].join(',')); }); const blob=new Blob([lines.join('\\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='perfume-recipe-pro.csv'; a.click(); URL.revokeObjectURL(url); }

/* Init */
function bindGlobal(){ $$('#modeSimple').onclick=()=>setMode('simple'); $$('#modePro').onclick=()=>setMode('pro'); }
function init(){
  const m=localStorage.getItem('pc_mode'); setMode(m||'simple');
  setupTheme(); bindGlobal(); setupUpdateRefresh();
  // Simple
  s_addRow(); $$('#addRow').onclick=()=>s_addRow(); $$('#saveRecipe').onclick=s_save; $$('#loadRecipe').onclick=s_loadSel; $$('#deleteRecipe').onclick=s_delSel; $$('#exportCsv').onclick=s_csv; $$('#printBtn').onclick=()=>window.print(); $$('#clearAll').onclick=()=>{ if(!confirm('Clear all rows?')) return; $$('#tableBody').innerHTML=''; s_addRow(); s_update(); }; $$('#dosage').addEventListener('input', s_update);
  // Batch helper
  const calc=$$('#batchCalcBtn'); const exp=$$('#batchExportBtn'); if(calc) calc.addEventListener('click', batch_compute); if(exp) exp.addEventListener('click', batch_exportCSV);
  // Pro
  p_bind(); p_newRow();
  // Data + SW
  loadData(); registerSW();
}
document.addEventListener('DOMContentLoaded', init);
