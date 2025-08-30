/* Compact app with IFRA51 CAS engine + fallback + EU overlay */
const $$=s=>document.querySelector(s), $$$=s=>document.querySelectorAll(s);

const S={mode:'simple', list:[], ifraFallback:{}, ifra51:{}, syn:{}, reg:{}, version:null, regSW:null};

async function j(u){ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error(u); return r.json(); }

function setMode(m){ S.mode=m; localStorage.setItem('pc_mode',m); renderMode(); }
function renderMode(){ $$('#simpleSection').hidden=S.mode!=='simple'; $$('#proSection').hidden=S.mode!=='pro'; $$$('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===S.mode)); }

function setupTheme(){
  const sv=localStorage.getItem('pc_theme'); if(sv) document.documentElement.setAttribute('data-theme',sv);
  $$('#themeToggle').onclick=()=>{ const c=document.documentElement.getAttribute('data-theme')||'light'; const n=c==='light'?'dark':'light'; document.documentElement.setAttribute('data-theme',n); localStorage.setItem('pc_theme',n); };
}

function showUpdate(){ $$('#updateBanner').hidden=false; }
function setupRefresh(){
  $$('#refreshBtn').onclick=async()=>{
    if(S.regSW?.waiting) S.regSW.waiting.postMessage({type:'SKIP_WAITING'});
    await Promise.all(['version.json','data/ingredients.json','data/ifra.json','data/ifra-51.json','data/synonyms.json','data/regulatory.json'].map(p=>fetch(p,{cache:'reload'})));
    location.reload();
  };
}

function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async ()=>{
    try{
      const reg=await navigator.serviceWorker.register('./sw.js');
      S.regSW=reg;
      reg.addEventListener('updatefound', ()=>{
        const nw=reg.installing; if(nw) nw.addEventListener('statechange', ()=>{ if(nw.state==='installed' && navigator.serviceWorker.controller) showUpdate(); });
      });
      if(reg.waiting) showUpdate();
    }catch(e){ console.warn('SW fail', e); }
  });
}

function nameToCAS(name){
  if(!name) return null;
  const n=name.trim().toLowerCase();
  if(S.syn[n]) return String(S.syn[n]);
  const ing=S.list.find(i=>(i.name||'').toLowerCase()===n);
  if(ing?.casNumber) return String(ing.casNumber);
  const n2=n.replace(/\s*\(.*?\)\s*/g,' ').trim();
  if(S.syn[n2]) return String(S.syn[n2]);
  const ing2=S.list.find(i=>(i.name||'').toLowerCase()===n2);
  if(ing2?.casNumber) return String(ing2.casNumber);
  return null;
}

function resolveIFRA({name, category, finishedPct}){
  const EU=new Set(Object.keys((S.reg?.EU_COSMETICS)||{}));
  const cas=nameToCAS(name);
  let status='n/a', limit=null, spec=null;

  if(cas && S.ifra51[cas]){
    const rec=S.ifra51[cas];
    if(rec.type==='spec'){ status='spec'; spec=rec.spec||{}; }
    else if(rec.type==='restricted'){
      const lim = rec.limits?.[category];
      if(lim!=null){ limit=Number(lim); status=(finishedPct!=null)?(finishedPct<=lim?'ok':'fail'):'ok'; }
    }
  }else{
    const ing=S.list.find(i=>(i.name||'').toLowerCase()===(name||'').toLowerCase());
    const lim=(ing?.ifraLimits?.[category] ?? S.ifraFallback[name]?.[category]);
    if(lim!=null){ limit=Number(lim); status=(finishedPct!=null)?(finishedPct<=limit?'ok':'fail'):'ok'; }
  }
  if(cas && EU.has(cas)){ status='eu-ban'; limit=0.0; }
  return {cas, status, limit, spec};
}

/* -------- Simple Mode -------- */
function s_row(d={name:'',pct:0}){
  const tr=document.createElement('tr');
  tr.innerHTML=`<td class="idx"></td>
    <td><input type="text" list="ingredientList" value="${d.name||''}" placeholder="Ingredient"></td>
    <td><input type="number" step="0.01" value="${d.pct??0}"></td>
    <td class="finished">0</td>
    <td class="ifra ifra-4"><span class="status">n/a</span></td>
    <td class="ifra ifra-5A"><span class="status">n/a</span></td>
    <td class="ifra ifra-5B"><span class="status">n/a</span></td>
    <td class="ifra ifra-9"><span class="status">n/a</span></td>
    <td><button class="danger rm">Remove</button></td>`;
  $$('#tableBody').appendChild(tr);
}
function s_rows(){ return Array.from($$$('#tableBody tr')).map(tr=>({tr,name:tr.querySelector('input[list]').value.trim(),pct:parseFloat(tr.querySelector('input[type=number]').value)||0})); }
function s_renum(){ $$$('#tableBody .idx').forEach((td,i)=>td.textContent=i+1); }
function s_fin(pct,dos){ return (pct*dos)/100; }
function chip(val,lim){ if(lim==null) return '<span class="status">n/a</span>'; if(val<=lim){const r=lim?val/lim:0; return `<span class="status ${r>0.8?'warn':'ok'}">${val.toFixed(3)} ≤ ${lim}%</span>`;} return `<span class="status fail">${val.toFixed(3)} > ${lim}%</span>`; }
function s_update(){
  const dosage=parseFloat($$('#dosage').value)||0;
  let tConc=0, tFin=0;
  s_rows().forEach(({tr,name,pct})=>{
    tConc+=pct; const fin=s_fin(pct,dosage); tFin+=fin; tr.querySelector('.finished').textContent=fin.toFixed(3);
    ['4','5A','5B','9'].forEach(cat=>{
      const r=resolveIFRA({name,category:cat,finishedPct:fin}); const cell=tr.querySelector('.ifra-'+cat);
      let html=''; if(r.status==='eu-ban') html='<span class="status eu">EU PROHIBITED</span>';
      else if(r.status==='spec') html='<span class="status spec">SPEC</span>';
      else if(r.limit!=null) html=chip(fin,r.limit);
      else html='<span class="status">n/a</span>';
      const cas = r.cas ? ` <span class="cas-chip">CAS ${r.cas}</span>` : '';
      cell.innerHTML = html + cas;
    });
  });
  $$('#totalConcentrate').textContent=tConc.toFixed(3);
  $$('#totalFinished').textContent=tFin.toFixed(3);
}
function s_bind(){
  $$('#addRow').onclick=()=>{ s_row(); s_renum(); s_update(); };
  $$('#tableBody').addEventListener('click', e=>{ if(e.target.classList.contains('rm')){ e.target.closest('tr').remove(); s_renum(); s_update(); } });
  $$('#tableBody').addEventListener('input', s_update);
  $$('#dosage').addEventListener('input', s_update);
  $$('#saveRecipe').onclick=()=>{ const n=$$('#recipeName').value.trim(); if(!n) return alert('Name?'); const rows=s_rows().map(r=>({name:r.name,pct:r.pct})); const dosage=parseFloat($$('#dosage').value)||0; const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); all[n]={dosage,rows}; localStorage.setItem('pc_recipes_v1',JSON.stringify(all)); s_pop(n); };
  $$('#loadRecipe').onclick=()=>{ const n=$$('#savedRecipes').value; const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); if(!all[n]) return; $$('#tableBody').innerHTML=''; (all[n].rows||[]).forEach(s_row); $$('#dosage').value=all[n].dosage||0; s_renum(); s_update(); };
  $$('#deleteRecipe').onclick=()=>{ const n=$$('#savedRecipes').value; const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); if(!n||!all[n]) return; if(!confirm('Delete recipe?')) return; delete all[n]; localStorage.setItem('pc_recipes_v1',JSON.stringify(all)); s_pop(); };
  $$('#exportCsv').onclick=()=>{
    const dosage=parseFloat($$('#dosage').value)||0; const rows=s_rows();
    const lines=[['#','Ingredient','% in concentrate','Dosage %','Finished %','IFRA 4','IFRA 5A','IFRA 5B','IFRA 9'].join(',')];
    rows.forEach((r,i)=>{
      const fin=s_fin(r.pct,dosage);
      const vals=['4','5A','5B','9'].map(cat=>{ const z=resolveIFRA({name:r.name,category:cat,finishedPct:fin}); if(z.status==='eu-ban')return 'EU PROHIBITED'; if(z.status==='spec')return 'SPEC'; return z.limit!=null?`≤ ${z.limit}%`:'n/a'; });
      lines.push([i+1, `"${r.name.replace(/"/g,'""')}"`, r.pct, dosage, fin.toFixed(3), ...vals].join(','));
    });
    const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='simple.csv'; a.click(); URL.revokeObjectURL(url);
  };
  $$('#printBtn').onclick=()=>window.print();
  $$('#clearAll').onclick=()=>{ if(!confirm('Clear all rows?')) return; $$('#tableBody').innerHTML=''; s_row(); s_renum(); s_update(); };
  function s_pop(sel=''){ const s=$$('#savedRecipes'); const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); s.innerHTML=''; Object.keys(all).sort().forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; if(k===sel) o.selected=true; s.appendChild(o); }); } s_pop();
  // Batch helper
  const calc=$$('#batchCalcBtn'), exp=$$('#batchExportBtn'); if(calc) calc.onclick=()=>{
    const targetMl=parseFloat($$('#batchVolume').value)||0; const density=parseFloat($$('#batchDensity').value)||0.85; const dosage=parseFloat($$('#dosage').value)||0; const oilMl=targetMl*(dosage/100);
    const rows=s_rows().filter(r=>r.name && r.pct>0); const tbody=$$('#batchBody'); tbody.innerHTML='';
    let pct=0, vol=0, wt=0;
    rows.forEach(r=>{ const ml=oilMl*(r.pct/100); const g=ml*density; pct+=r.pct; vol+=ml; wt+=g; const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.name}</td><td>${r.pct.toFixed(2)}</td><td>${ml.toFixed(3)}</td><td>${g.toFixed(3)}</td>`; tbody.appendChild(tr); });
    $$('#batchPctTotal').textContent=pct.toFixed(2); $$('#batchVolTotal').textContent=vol.toFixed(3); $$('#batchWtTotal').textContent=wt.toFixed(3);
  };
  if(exp) exp.onclick=()=>{
    const rows=Array.from($$$('#batchBody tr')).map(tr=>{const t=tr.querySelectorAll('td');return{n:t[0]?.textContent||'',p:t[1]?.textContent||'',ml:t[2]?.textContent||'',g:t[3]?.textContent||''}});
    if(!rows.length) return alert('Click Calculate first');
    const lines=[['Ingredient','% in concentrate','Oil volume (ml)','Weight (g)'].join(',')];
    rows.forEach(r=>lines.push([`"${r.n.replace(/"/g,'""')}"`,r.p,r.ml,r.g].join(',')));
    const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='batch.csv'; a.click(); URL.revokeObjectURL(url);
  };
}

/* -------- Pro Mode -------- */
function p_row(d={}){
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input type="text" class="p-name" list="ingredientList"></td>
    <td><input type="number" class="p-vol" step="0.01" value="${d.vol??0}"></td>
    <td><input type="number" class="p-den" step="0.01" value="${d.den??0.85}"></td>
    <td><input type="number" class="p-wt" step="0.01" value="${d.wt??0}"></td>
    <td><input type="number" class="p-price" step="0.01" value="${d.price??0}"></td>
    <td class="p-cost">0.00</td><td class="p-pct">0.00 %</td>
    <td><select class="p-note"><option>N/A</option><option>Top</option><option>Middle</option><option>Base</option></select></td>
    <td><input type="text" class="p-supplier"></td>
    <td><input type="text" class="p-cas"></td>
    <td><textarea class="p-notes"></textarea></td>
    <td class="p-del">❌</td>`;
  $$('#proBody').appendChild(tr);
}
function p_rows(){ return Array.from($$$('#proBody tr')); }
function p_calc(){
  const rows=p_rows(); let tw=0,tv=0,tc=0; const noteW={Top:0,Middle:0,Base:0,'N/A':0};
  rows.forEach(tr=>{ tw+=parseFloat(tr.querySelector('.p-wt').value)||0; });
  rows.forEach(tr=>{
    const v=parseFloat(tr.querySelector('.p-vol').value)||0, d=parseFloat(tr.querySelector('.p-den').value)||0, w=parseFloat(tr.querySelector('.p-wt').value)||0, pr=parseFloat(tr.querySelector('.p-price').value)||0;
    const cost=(w/10)*pr; tr.querySelector('.p-cost').textContent=cost.toFixed(2);
    const pct=tw>0?(w/tw*100):0; tr.querySelector('.p-pct').textContent=pct.toFixed(2)+' %';
    tv+=v; tc+=cost; const note=tr.querySelector('.p-note').value; if(noteW[note]!=null) noteW[note]+=w;
  });
  $$('#proTotalVol').textContent=tv.toFixed(2); $$('#proTotalWt').textContent=tw.toFixed(2); $$('#proTotalCost').textContent=tc.toFixed(2);
  let txt=[]; for(const k in noteW){ const pct=tw>0?(noteW[k]/tw*100).toFixed(1):'0.0'; txt.push(`${k}: ${pct}%`); } $$('#noteSummaryText').textContent=txt.join(' | ');
  p_ifra();
}
function p_ifra(){
  const cat=$$('#ifraCategory').value; const rows=p_rows(); const bad=[];
  rows.forEach(tr=>{
    const name=(tr.querySelector('.p-name').value||'').trim();
    const pct=parseFloat(tr.querySelector('.p-pct').textContent)||0;
    const r=resolveIFRA({name,category:cat,finishedPct:pct});
    if(r.status==='eu-ban') bad.push({name,msg:'EU PROHIBITED'});
    else if(r.limit!=null && pct>r.limit) bad.push({name,msg:`${pct.toFixed(2)}% > ${r.limit}%`});
  });
  const st=$$('#ifraStatusText'), wrap=$$('#ifraStatus');
  if(bad.length){ wrap.style.borderColor='var(--danger)'; st.innerHTML=`<strong>⚠ Non-compliant for Cat ${cat}</strong><ul>`+bad.map(o=>`<li><b>${o.name}</b> — ${o.msg}</li>`).join('')+`</ul>`; }
  else { wrap.style.borderColor='var(--ok)'; st.innerHTML=`<strong>✅ Compliant for Cat ${cat}</strong>`; }
}
function p_bind(){
  $$('#proAdd').onclick=()=>{ p_row(); p_calc(); };
  $$('#proBody').addEventListener('input', e=>{
    const tr=e.target.closest('tr'); if(!tr) return;
    if(e.target.classList.contains('p-name')){
      const sel=S.list.find(i=>i.name===e.target.value);
      if(sel){ tr.querySelector('.p-cas').value=sel.casNumber||''; tr.querySelector('.p-price').value=sel.pricePer10g||0; tr.querySelector('.p-notes').value=sel.notes||''; tr.querySelector('.p-den').value=sel.density||tr.querySelector('.p-den').value; }
    }
    if(e.target.classList.contains('p-vol')||e.target.classList.contains('p-den')){
      const v=parseFloat(tr.querySelector('.p-vol').value)||0; const d=parseFloat(tr.querySelector('.p-den').value)||0; tr.querySelector('.p-wt').value=(v*d).toFixed(3);
    } else if(e.target.classList.contains('p-wt')){
      const d=parseFloat(tr.querySelector('.p-den').value)||0; if(d>0){ tr.querySelector('.p-vol').value=(parseFloat(tr.querySelector('.p-wt').value)/d).toFixed(3); }
    }
    p_calc();
  });
  $$('#proBody').addEventListener('change', p_calc);
  $$('#proBody').addEventListener('click', e=>{ if(e.target.classList.contains('p-del')){ e.target.closest('tr').remove(); p_calc(); } });
  $$('#ifraCategory').onchange=p_ifra;
  $$('#proSave').onclick=()=>{ const n=prompt('Recipe name?'); if(!n) return; const rows=p_rows().map(tr=>({ name:tr.querySelector('.p-name').value||'', vol:+tr.querySelector('.p-vol').value||0, den:+tr.querySelector('.p-den').value||0, wt:+tr.querySelector('.p-wt').value||0, price:+tr.querySelector('.p-price').value||0, note:tr.querySelector('.p-note').value||'N/A', supplier:tr.querySelector('.p-supplier').value||'', cas:tr.querySelector('.p-cas').value||'', notes:tr.querySelector('.p-notes').value||'' })); const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); all[n]={cat:$$('#ifraCategory').value, rows}; localStorage.setItem('pc_pro_recipes_v1',JSON.stringify(all)); p_pop(n); };
  $$('#proLoad').onclick=()=>{ const n=$$('#proSaved').value; const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); const rec=all[n]; if(!rec) return alert('Not found'); $$('#proBody').innerHTML=''; (rec.rows||[]).forEach(r=>p_row(r)); p_calc(); };
  $$('#proDelete').onclick=()=>{ const n=$$('#proSaved').value; const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); if(!n||!all[n]) return; if(!confirm('Delete recipe?')) return; delete all[n]; localStorage.setItem('pc_pro_recipes_v1',JSON.stringify(all)); p_pop(); };
  $$('#proNew').onclick=()=>{ $$('#proBody').innerHTML=''; p_row(); p_calc(); };
  $$('#proPrint').onclick=()=>window.print();
  $$('#proExport').onclick=()=>{
    const rows=p_rows().map(tr=>({ name:tr.querySelector('.p-name').value||'', vol:+tr.querySelector('.p-vol').value||0, den:+tr.querySelector('.p-den').value||0, wt:+tr.querySelector('.p-wt').value||0, price:+tr.querySelector('.p-price').value||0, note:tr.querySelector('.p-note').value||'N/A', supplier:tr.querySelector('.p-supplier').value||'', cas:tr.querySelector('.p-cas').value||'', notes:(tr.querySelector('.p-notes').value||'').replace(/\n/g,' ') }));
    const tw=rows.reduce((a,b)=>a+(b.wt||0),0);
    const lines=[['Ingredient','Volume (ml)','Density (g/ml)','Weight (g)','Price/10g (€)','Cost (€)','Formula %','Note','Supplier','CAS','Notes'].join(',')];
    rows.forEach(r=>{ const cost=(r.wt/10)*(r.price||0); const pct=tw>0?(r.wt/tw*100):0; lines.push([`"${r.name.replace(/"/g,'""')}"`,r.vol,r.den,r.wt,(r.price||0).toFixed(2),cost.toFixed(2),pct.toFixed(2),r.note,r.supplier,r.cas,`"${r.notes.replace(/"/g,'""')}"`].join(',')); });
    const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='pro.csv'; a.click(); URL.revokeObjectURL(url);
  };
  function p_pop(sel=''){ const s=$$('#proSaved'); const all=JSON.parse(localStorage.getItem('pc_pro_recipes_v1')||'{}'); s.innerHTML=''; Object.keys(all).sort().forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; if(k===sel) o.selected=true; s.appendChild(o); }); } p_pop();
}

/* -------- Data + PWA + Init -------- */
async function loadData(){
  try{
    const [ings, ifra, ver, ifra51, syn, reg] = await Promise.all([
      j('data/ingredients.json'),
      j('data/ifra.json').catch(()=>({})),
      j('version.json').catch(()=>({})),
      j('data/ifra-51.json').catch(()=>({})),
      j('data/synonyms.json').catch(()=>({})),
      j('data/regulatory.json').catch(()=>({})),
    ]);
    S.list=ings||[]; S.ifraFallback=ifra||{}; S.version=ver?.data||null; S.ifra51=ifra51||{}; S.syn=syn||{}; S.reg=reg||{};
    const dl=$$('#ingredientList'); dl.innerHTML=''; (S.list||[]).forEach(o=>{ const opt=document.createElement('option'); opt.value=o.name; dl.appendChild(opt); });
    if($$('#dataStatus')) $$('#dataStatus').textContent=`Data loaded (version: ${S.version||'n/a'})`;
    const prev=localStorage.getItem('pc_data_version'); if(S.version && prev && prev!==S.version) showUpdate(); if(S.version) localStorage.setItem('pc_data_version',S.version);
  }catch(e){ console.error(e); if($$('#dataStatus')) $$('#dataStatus').textContent='Failed to load data.'; }
}

function bindGlobal(){
  $$('#modeSimple').onclick=()=>setMode('simple'); $$('#modePro').onclick=()=>setMode('pro');
}

function init(){
  setMode(localStorage.getItem('pc_mode')||'simple'); setupTheme(); setupRefresh(); bindGlobal();
  s_row(); s_bind(); p_bind(); p_row();
  loadData(); registerSW();
  $$('#printBtn').onclick=()=>window.print();
}
document.addEventListener('DOMContentLoaded', init);
