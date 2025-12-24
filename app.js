/* App: Simple + Pro | Fixes: Dilution, Validation (F-2), Delete (F-3), Sticky Cols (R3), Toasts (R4), Auto-Data (Notes & Cache) */

const $$ = s => document.querySelector(s), $$$ = s => document.querySelectorAll(s);

const S = {
  mode: 'simple',
  list: [],
  ifraFallback: {},
  ifra51: {},
  syn: {},
  reg: {},
  version: null,
  regSW: null,
  acList: []
};

// --- HELPER: Toast Feedback (Fixes R4) ---
function showToast(msg) {
  const c = $$('#toast-container');
  if(!c) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'fadeOut 0.5s forwards';
    setTimeout(() => t.remove(), 500);
  }, 3000);
}

// --- HELPER: Parse numbers safely (Fixes F-2) ---
function parseNum(val) {
  if (!val) return 0;
  // Replace comma with dot, remove non-numeric chars except . and -
  const clean = String(val).replace(/,/g, '.').replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return num < 0 ? 0 : num;
}

async function j(u){ 
  // Cache Buster: adds ?t=Date to force browser to always get new file
  const r = await fetch(u + '?t=' + new Date().getTime(), {cache: 'no-store'}); 
  if(!r.ok) throw new Error(u); 
  return r.json(); 
}

function setMode(m){ S.mode = m; localStorage.setItem('pc_mode', m); renderMode(); }
function renderMode(){
  $$('#simpleSection').hidden = S.mode !== 'simple';
  $$('#proSection').hidden = S.mode !== 'pro';
  $$$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
}

function showUpdate(){ const b = $$('#updateBanner'); if(b) b.hidden = false; }

function setupRefresh(){
  const btn = document.getElementById('refreshBtn');
  if(!btn) return;
  btn.onclick = async () => {
    let reloaded = false;
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }
    try{
      if (S.regSW?.waiting) S.regSW.waiting.postMessage({ type: 'SKIP_WAITING' });
      if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type:'SKIP_WAITING' });
      await S.regSW?.update?.();
    }catch(e){ console.warn('refresh/skip error', e); }
    try{
      await Promise.all([
        'version.json',
        'data/ingredients.json','data/ifra.json',
        'data/ifra-51.json','data/synonyms.json','data/regulatory.json'
      ].map(p => fetch(p,{cache:'reload'})));
    }catch(e){}
    location.reload();
  };
}

function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try{
      const reg = await navigator.serviceWorker.register('./sw.js');
      S.regSW = reg;
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if(nw) nw.addEventListener('statechange', () => {
          if(nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });
      if(reg.waiting) showUpdate();
    }catch(e){ console.warn('SW register failed', e); }
  });
}

function setupTheme(){
  const sv = localStorage.getItem('pc_theme');
  if(sv) document.documentElement.setAttribute('data-theme', sv);
  const btn = $$('#themeToggle');
  if(btn) btn.onclick = () => {
    const c = document.documentElement.getAttribute('data-theme') || 'light';
    const n = c === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', n);
    localStorage.setItem('pc_theme', n);
  };
}

function nameToCAS(name){
  if(!name) return null;
  const n = name.trim().toLowerCase();
  if(S.syn[n]) return String(S.syn[n]);
  const ing = S.list.find(i => (i.name||'').toLowerCase() === n);
  if(ing?.casNumber) return String(ing.casNumber);
  const n2 = n.replace(/\s*\(.*?\)\s*/g,' ').trim();
  if(S.syn[n2]) return String(S.syn[n2]);
  const ing2 = S.list.find(i => (i.name||'').toLowerCase() === n2);
  if(ing2?.casNumber) return String(ing2.casNumber);
  return null;
}

function resolveIFRA({name, category, finishedPct}){
  const EU = new Set(Object.keys((S.reg?.EU_COSMETICS)||{}));
  const cas = nameToCAS(name);
  let status = 'n/a', limit = null, spec = null, source = 'NONE';

  if(cas && S.ifra51[cas]){
    const rec = S.ifra51[cas];
    source = 'IFRA51';
    if(rec.type === 'spec'){ status = 'spec'; spec = rec.spec||{}; }
    else if(rec.type === 'restricted'){
      const lim = rec.limits?.[category];
      if(lim != null){ limit = Number(lim); status = (finishedPct != null) ? (finishedPct <= lim ? 'ok' : 'fail') : 'ok'; }
    }
  } else {
    const ing = S.list.find(i => (i.name||'').toLowerCase() === (name||'').toLowerCase());
    const lim = (ing?.ifraLimits?.[category] ?? S.ifraFallback[name]?.[category]);
    if(lim != null){ limit = Number(lim); source = ing ? 'ING' : 'FALLBACK'; status = (finishedPct != null) ? (finishedPct <= lim ? 'ok' : 'fail') : 'ok'; }
  }
  if(cas && EU.has(cas)){ status = 'eu-ban'; limit = 0.0; source = 'EU'; }
  return {cas, status, limit, spec, source};
}

// --- START: Simple Mode Functions ---
function s_row(d={name:'',pct:0}){
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  nameTd.innerHTML = `<div class="ac-wrap">
      <input type="text" list="ingredientList" placeholder="Ingredient" value="${d.name||''}">
      <div class="ac-list" hidden></div>
    </div>`;
  const pctTd = document.createElement('td');
  pctTd.innerHTML = `<input type="text" inputmode="decimal" placeholder="0" value="${d.pct??0}">`;
  const finTd = document.createElement('td'); finTd.className='finished'; finTd.textContent='0';
  const mkIfraCell = (c)=>{ const td=document.createElement('td'); td.className='ifra ifra-'+c; td.innerHTML='<span class="status">n/a</span>'; return td; };
  const idx = document.createElement('td'); idx.className='idx';

  const rmTd = document.createElement('td');
  const rm = document.createElement('button'); rm.className='danger rm'; rm.textContent='Remove';
  rmTd.appendChild(rm);

  tr.appendChild(idx);
  tr.appendChild(nameTd);
  tr.appendChild(pctTd);
  tr.appendChild(finTd);
  ['4','5A','5B','9'].forEach(cat => tr.appendChild(mkIfraCell(cat)));
  tr.appendChild(rmTd);
  $$('#tableBody').appendChild(tr);

  const input = nameTd.querySelector('input[list]');
  const list = nameTd.querySelector('.ac-list');
  bindAutocomplete(input, list);
}

function s_rows(){ 
  return Array.from($$$('#tableBody tr')).map(tr => ({
    tr, 
    name: tr.querySelector('input[list]').value.trim(), 
    pct: parseNum(tr.querySelector('input[inputmode="decimal"]').value)
  })); 
}
function s_renum(){ $$$('#tableBody .idx').forEach((td,i)=> td.textContent = i+1); }
function s_fin(pct, dos){ return (pct*dos)/100; }

function badge(val, limit, cls, src){
  const srcHtml = src && src !== 'NONE' ? `<em class="src-note">${src}</em>` : '';
  return `<span class="status ${cls}">${val.toFixed(3)} ≤ ${limit}% ${srcHtml}</span>`;
}
function s_update(){
  const dosage = parseNum($$('#dosage').value);
  let tConc=0, tFin=0;
  s_rows().forEach(({tr,name,pct})=>{
    tConc += pct;
    const fin = s_fin(pct, dosage); tFin += fin;
    tr.querySelector('.finished').textContent = fin.toFixed(3);
    ['4','5A','5B','9'].forEach(cat => {
      const r = resolveIFRA({name, category:cat, finishedPct:fin});
      const cell = tr.querySelector('.ifra-'+cat);
      let html='';
      if(r.status==='eu-ban'){
        html = `<span class="status eu">EU PROHIBITED</span>`;
      } else if(r.status==='spec'){
        html = `<span class="status spec">SPEC <span class="spec-help" data-tip="This ingredient has a specification, e.g., maximum peroxide value. Refer to IFRA standards for details.">?</span></span>`;
      } else if(r.limit != null){
        const cls = fin <= r.limit ? ( (r.limit>0 && fin/r.limit>0.8) ? 'warn' : 'ok') : 'fail';
        html = badge(fin, r.limit, cls, r.source);
      } else {
        html = `<span class="status">n/a</span>`;
      }
      const casTxt = r.cas ? ` <span class="cas-chip">CAS ${r.cas}</span>` : '';
      cell.innerHTML = html + casTxt;
    });
  });
  $$('#totalConcentrate').textContent = tConc.toFixed(3);
  $$('#totalFinished').textContent = tFin.toFixed(3);
  s_batch_calc(); 
}

function getBatchData() {
  const targetVol = parseNum($$('#batchVolume').value);
  const density = parseNum($$('#batchDensity').value);
  const dosage = parseNum($$('#dosage').value);
  const concentrateVol = targetVol * (dosage / 100);
  const concentrateWt = concentrateVol * density;
  const rows = s_rows();

  const results = rows.map(r => {
    const pct = r.pct || 0;
    const totalConcentratePct = rows.reduce((acc, row) => acc + (row.pct || 0), 0);
    const normalizedPct = totalConcentratePct > 0 ? (pct / totalConcentratePct) * 100 : 0;
    return {
      name: r.name,
      pct: r.pct, 
      oilVol: concentrateVol * (pct / 100),
      weight: concentrateWt * (pct / 100)
    };
  });
  return results;
}

function s_batch_calc() {
  const results = getBatchData();
  const body = $$('#batchBody');
  body.innerHTML = '';

  let totalPct = 0, totalVol = 0, totalWt = 0;
  results.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name || '<em>Unnamed</em>'}</td>
      <td>${r.pct.toFixed(3)}</td>
      <td>${r.oilVol.toFixed(3)}</td>
      <td>${r.weight.toFixed(3)}</td>
    `;
    body.appendChild(tr);
    totalPct += r.pct;
    totalVol += r.oilVol;
    totalWt += r.weight;
  });

  $$('#batchPctTotal').textContent = totalPct.toFixed(3);
  $$('#batchVolTotal').textContent = totalVol.toFixed(3);
  $$('#batchWtTotal').textContent = totalWt.toFixed(3);
}

function s_batch_export() {
  const results = getBatchData();
  const lines = [['Ingredient', '% in concentrate', 'Oil volume (ml)', 'Weight (g)'].join(',')];
  results.forEach(r => {
    lines.push([`"${r.name.replace(/"/g, '""')}"`, r.pct.toFixed(3), r.oilVol.toFixed(3), r.weight.toFixed(3)].join(','));
  });
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'batch-export.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Batch CSV Exported'); 
}

function s_bind(){
  $$('#addRow').onclick = () => { s_row(); s_renum(); s_update(); };
  $$('#tableBody').addEventListener('click', e => {
    if(e.target.classList.contains('rm')){ e.target.closest('tr').remove(); s_renum(); s_update(); }
  });
  $$('#tableBody').addEventListener('input', s_update);
  $$('#dosage').addEventListener('input', s_update);

  $$('#batchCalcBtn').onclick = s_batch_calc;
  $$('#batchExportBtn').onclick = s_batch_export;
  ['#batchVolume', '#batchDensity'].forEach(id => $$(id).addEventListener('input', s_batch_calc));

  $$('#saveRecipe').onclick = () => {
    const n = $$('#recipeName').value.trim(); if(!n) return alert('Name?');
    const rows = s_rows().map(r=>({name:r.name,pct:r.pct}));
    const dosage = parseNum($$('#dosage').value);
    const all = JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}');
    all[n] = {dosage, rows}; localStorage.setItem('pc_recipes_v1', JSON.stringify(all)); s_pop(n);
    showToast(`Recipe "${n}" Saved`);
  };
  $$('#loadRecipe').onclick = () => {
    const n = $$('#savedRecipes').value;
    const all = JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}');
    if(!all[n]) return;
    $$('#tableBody').innerHTML='';
    (all[n].rows||[]).forEach(s_row); $$('#dosage').value = all[n].dosage||0;
    s_renum(); s_update();
    showToast(`Recipe "${n}" Loaded`);
  };
  
  $$('#deleteRecipe').onclick = () => {
    const n = $$('#savedRecipes').value;
    const all = JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}');
    if(!n || !all[n]) return;
    if(!confirm('Delete recipe?')) return;
    delete all[n]; 
    localStorage.setItem('pc_recipes_v1', JSON.stringify(all)); 
    s_pop(); 
    $$('#recipeName').value = ''; 
    showToast('Recipe Deleted');
  };

  $$('#exportCsv').onclick = () => {
    const dosage = parseNum($$('#dosage').value); const rows = s_rows();
    const lines = [['#','Ingredient','% in concentrate','Dosage %','Finished %','IFRA 4','IFRA 5A','IFRA 5B','IFRA 9'].join(',')];
    rows.forEach((r,i)=>{
      const fin = s_fin(r.pct,dosage);
      const vals = ['4','5A','5B','9'].map(cat => {
        const z = resolveIFRA({name:r.name,category:cat,finishedPct:fin});
        if(z.status==='eu-ban') return 'EU PROHIBITED';
        if(z.status==='spec') return 'SPEC';
        return z.limit!=null ? `≤ ${z.limit}% (${z.source})` : 'n/a';
      });
      lines.push([i+1, `"${r.name.replace(/"/g,'""')}"`, r.pct, dosage, fin.toFixed(3), ...vals].join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='simple.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('CSV Exported');
  };
  $$('#printBtn').onclick = () => window.print();
  $$('#clearAll').onclick = () => { if(!confirm('Clear all rows?')) return; $$('#tableBody').innerHTML=''; s_row(); s_renum(); s_update(); };

  function s_pop(sel=''){ 
    const s=$$('#savedRecipes'); 
    const all=JSON.parse(localStorage.getItem('pc_recipes_v1')||'{}'); 
    s.innerHTML=''; 
    Object.keys(all).sort().forEach(k=>{ 
      const o=document.createElement('option'); o.value=k; o.textContent=k; 
      if(k===sel) o.selected=true; 
      s.appendChild(o); 
    }); 
    if (sel && !all[sel]) s.value = '';
  } 
  s_pop();
}
// --- END: Simple Mode Functions ---


function buildACList(){
  const namesFromIFRA = Object.values(S.ifra51||{}).map(v => v?.name).filter(Boolean);
  const synKeys = Object.keys(S.syn||{});
  const set = new Set([...synKeys, ...namesFromIFRA]);
  const arr = Array.from(set).filter(Boolean).sort((a,b)=> a.localeCompare(b));
  S.acList = arr;
}
function bindAutocomplete(input, listEl){
  function render(items, q=''){
    if(!items.length){ listEl.hidden = true; listEl.innerHTML=''; return; }
    const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'i') : null;
    listEl.innerHTML = items.slice(0, 12).map((txt,i) => {
      const shown = rx ? txt.replace(rx, m=>`<mark>${m}</mark>`) : txt;
      return `<div class="ac-item${i===0?' active':''}" data-val="${txt.replace(/"/g,'&quot;')}">${shown}</div>`;
    }).join('');
    listEl.hidden = false;
  }
  function pick(val){ input.value = val; listEl.hidden = true; listEl.innerHTML=''; input.dispatchEvent(new Event('input', {bubbles:true})); input.blur(); }
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if(!q){ render(S.acList.slice(0,12)); return; }
    const items = S.acList.filter(x => x.toLowerCase().includes(q));
    render(items, q);
  });
  input.addEventListener('focus', () => { if(!input.value) render(S.acList.slice(0,12)); });
  listEl.addEventListener('mousedown', e => { const it=e.target.closest('.ac-item'); if(it) pick(it.dataset.val); });
  input.addEventListener('keydown', e => {
    const items = Array.from(listEl.querySelectorAll('.ac-item'));
    const idx = items.findIndex(it => it.classList.contains('active'));
    if(e.key==='ArrowDown'){ e.preventDefault(); const ni=Math.min(items.length-1, idx+1); items.forEach(it=>it.classList.remove('active')); if(items[ni]) items[ni].classList.add('active'); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); const ni=Math.max(0, idx-1); items.forEach(it=>it.classList.remove('active')); if(items[ni]) items[ni].classList.add('active'); }
    else if(e.key==='Enter'){ const cur = items.find(it=>it.classList.contains('active')); if(cur){ e.preventDefault(); pick(cur.dataset.val); } }
    else if(e.key==='Escape'){ listEl.hidden=true; }
  });
  document.addEventListener('click', (e)=>{ if(!listEl.contains(e.target) && e.target!==input){ listEl.hidden=true; } });
}

// --- START: Pro Mode Functions ---
function p_row(d={}){
  const tr=document.createElement('tr');
  const dil = d.dilution ?? 100;
  const solv = d.solvent ?? 'Ethanol';

  tr.innerHTML=`<td><input type="text" class="p-name" list="ingredientList" value="${(d.name||'')}"></td>
    <td><input type="text" inputmode="decimal" class="p-vol" placeholder="0" value="${d.vol??0}"></td>
    <td><input type="text" inputmode="decimal" class="p-den" placeholder="0.85" value="${d.den??0.85}"></td>
    <td><input type="text" inputmode="decimal" class="p-wt" placeholder="0" value="${d.wt??0}"></td>
    <td><input type="text" inputmode="decimal" class="p-price" placeholder="0" value="${d.price??0}"></td>
    <td class="p-cost">0.00</td>
    
    <td><input type="text" inputmode="decimal" class="p-dil" placeholder="100" value="${dil}"></td>
    <td>
      <select class="p-solv">
        <option ${solv==='Ethanol'?'selected':''}>Ethanol</option>
        <option ${solv==='DPG'?'selected':''}>DPG</option>
        <option ${solv==='IPM'?'selected':''}>IPM</option>
        <option ${solv==='TEC'?'selected':''}>TEC</option>
        <option ${solv==='None'?'selected':''}>None</option>
      </select>
    </td>
    <td class="p-active-pct">0.00 %</td>

    <td><select class="p-note">
        <option ${d.note==='N/A'?'selected':''}>N/A</option>
        <option ${d.note==='Top'?'selected':''}>Top</option>
        <option ${d.note==='Middle'?'selected':''}>Middle</option>
        <option ${d.note==='Base'?'selected':''}>Base</option>
    </select></td>
    <td><input type="text" class="p-supplier" value="${d.supplier??''}"></td>
    <td><input type="text" class="p-cas" value="${d.cas??''}"></td>
    <td><textarea class="p-notes">${d.notes??''}</textarea></td>
    <td class="p-del">❌</td>`;
  $$('#proBody').appendChild(tr);
}
function p_rows(){ return Array.from($$$('#proBody tr')); }

function p_calc(){
  const rows = p_rows(); 
  let totalWt = 0, totalVol = 0, totalCost = 0;
  let totalActiveWt = 0;

  rows.forEach(tr => {
    totalWt += parseNum(tr.querySelector('.p-wt').value);
  });

  rows.forEach(tr => {
    const vol = parseNum(tr.querySelector('.p-vol').value);
    const den = parseNum(tr.querySelector('.p-den').value);
    const wt  = parseNum(tr.querySelector('.p-wt').value);
    const price = parseNum(tr.querySelector('.p-price').value);
    const dilution = parseNum(tr.querySelector('.p-dil').value);

    const cost = (wt / 10) * price;
    tr.querySelector('.p-cost').textContent = cost.toFixed(2);

    const activeWt = wt * (dilution / 100);
    const activePct = totalWt > 0 ? (activeWt / totalWt * 100) : 0;
    
    tr.querySelector('.p-active-pct').textContent = activePct.toFixed(3) + ' %';
    tr.dataset.activePct = activePct; 

    totalVol += vol;
    totalCost += cost;
    totalActiveWt += activeWt;
  });

  $$('#proTotalVol').textContent = totalVol.toFixed(2);
  $$('#proTotalWt').textContent = totalWt.toFixed(2);
  $$('#proTotalCost').textContent = totalCost.toFixed(2);
  
  $$('#proTotalPct').textContent = totalWt > 0 
    ? ((totalActiveWt / totalWt) * 100).toFixed(2) + '% (Active)' 
    : '0.00 %';

  const hc=$$('#helperCost'), hw=$$('#helperWeight'), hr=$$('#helperResult');
  if(hc && hw && hr){ 
    hc.value=totalCost.toFixed(2); 
    hw.value=totalWt.toFixed(2); 
    hr.textContent = totalWt>0 ? `€${(totalCost/totalWt*10).toFixed(2)} per 10g` : '€0.00 per 10g'; 
  }
  
  const noteW={Top:0,Middle:0,Base:0,'N/A':0};
  rows.forEach(tr => {
    const w = parseNum(tr.querySelector('.p-wt').value);
    const note = tr.querySelector('.p-note').value;
    if(noteW[note]!=null) noteW[note]+=w;
  });
  let txt=[]; for(const k in noteW){ const pct=totalWt>0?(noteW[k]/totalWt*100).toFixed(1):'0.0'; txt.push(`${k}: ${pct}%`); } 
  $$('#noteSummaryText').textContent=txt.join(' | ');

  p_ifra();
}

function p_ifra(){
  const cat=$$('#ifraCategory').value; const rows=p_rows(); const bad=[];
  const warn=[]; 
  
  rows.forEach(tr=>{
    const name=(tr.querySelector('.p-name').value||'').trim();
    const activePct = parseFloat(tr.dataset.activePct) || 0;
    const r=resolveIFRA({name,category:cat,finishedPct:activePct});
    
    if(r.status==='eu-ban') {
        bad.push({name,msg:'EU PROHIBITED'});
    } else if(r.limit!=null){
      if(activePct > r.limit) {
          bad.push({name,msg:`${activePct.toFixed(3)}% > ${r.limit}%`});
      } else if(r.limit > 0 && (activePct/r.limit) > 0.8) {
          warn.push({name,msg:`${activePct.toFixed(3)}% (~${Math.round(activePct/r.limit*100)}% of limit)`});
      }
    }
  });

  const st=$$('#ifraStatusText'), wrap=$$('#ifraStatus');
  wrap.classList.remove('non-compliant-card');
  wrap.style.borderColor = '';
  wrap.style.backgroundColor = '';
  wrap.style.color = '';

  if(bad.length){
    wrap.style.borderColor='#ebccd1';
    wrap.style.backgroundColor='#f8d7da'; 
    wrap.style.color='#721c24'; 
    st.innerHTML=`<strong>❌ Not compliant for Cat ${cat}</strong><ul>`+bad.map(o=>`<li><b>${o.name}</b> — ${o.msg}</li>`).join('')+`</ul>`;
  } else if(warn.length){
    wrap.style.borderColor='#faebcc';
    wrap.style.backgroundColor='#fff3cd'; 
    wrap.style.color='#856404'; 
    st.innerHTML=`<strong>⚠️ Caution: Near IFRA Limits (Cat ${cat})</strong><ul>`+warn.map(o=>`<li><b>${o.name}</b> — ${o.msg}</li>`).join('')+`</ul>`;
  } else {
    wrap.style.borderColor='#c3e6cb';
