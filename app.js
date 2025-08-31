/* App (Simple + Pro) with: Autocomplete (synonyms + IFRA51 names), SPEC tooltip, source tags */
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

async function j(u){ const r = await fetch(u, {cache: 'no-store'}); if(!r.ok) throw new Error(u); return r.json(); }

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
    }catch(e){ console.error(e); }
  };
}


// --- Simple Mode Functions ---

function addSimpleRow() {
  const t = document.createElement('div');
  t.className = 'simple-row';
  t.innerHTML = `<input type="text" class="simple-name" placeholder="Ingredient Name" /> <input type="number" class="simple-drops" placeholder="Drops" /> <span class="simple-pct">— %</span> <button class="simple-del secondary">×</button>`;
  $$('#simpleRows').appendChild(t);
  t.querySelector('.simple-del').onclick = () => { t.remove(); calculateSimple(); };
  t.querySelector('.simple-drops').oninput = calculateSimple;
}

function calculateSimple() {
  const total = parseFloat($$('#simpleTotal').value) || 0;
  const rows = $$$('.simple-row');
  let currentTotalDrops = 0;
  rows.forEach(row => {
    currentTotalDrops += parseFloat(row.querySelector('.simple-drops').value) || 0;
  });

  rows.forEach(row => {
    const drops = parseFloat(row.querySelector('.simple-drops').value) || 0;
    const pct = total > 0 ? (drops / total) * 100 : 0;
    row.querySelector('.simple-pct').textContent = `${pct.toFixed(2)} %`;
  });
}

function bindSimple(){
  $$('#simpleTotal').oninput = calculateSimple;
  $$('#simpleAdd').onclick = addSimpleRow;
  $$$('.simple-del').forEach(b => b.onclick = () => { b.closest('.simple-row').remove(); calculateSimple(); });
  $$$('.simple-drops').forEach(i => i.oninput = calculateSimple);
}


// --- Pro Mode Functions ---

function addProRow(name = '', weight = '', cost = '') {
  const row = $$('#proBody').insertRow();
  const data = findIngredient(name);
  row.innerHTML = `
    <td><div class="ac-wrap"><input type="text" class="ing-name" list="ingredientList" value="${name}" placeholder="Material name..." /><div class="ac-list"></div></div></td>
    <td><input type="number" class="ing-vol" placeholder="drop" /></td>
    <td>${data?.d || '-'}</td>
    <td><input type="number" class="ing-wt" value="${weight}" placeholder="g" /></td>
    <td><input type="number" class="ing-cost" value="${cost}" placeholder="€/g" /></td>
    <td class="row-cost">—</td>
    <td class="row-pct">— %</td>
    <td>${data?.note || '-'}</td>
    <td>${formatSource(data)}</td>
    <td class="row-ifra">${data?.ifra || '-'}</td>
    <td class="row-status">—</td>
    <td><button class="pro-del secondary">×</button></td>
  `;
  row.querySelector('.pro-del').onclick = () => { row.remove(); calculatePro(); };
  row.querySelectorAll('input').forEach(i => i.oninput = () => calculatePro(row, i));
  setupAutocomplete(row.querySelector('.ing-name'));
}

function calculatePro(changedRow = null, changedInput = null) {
  const rows = $$$('#proBody tr');
  let totalWeight = 0, totalCost = 0;
  rows.forEach(row => {
    totalWeight += parseFloat(row.querySelector('.ing-wt').value) || 0;
  });
  $$('#proTotalWt').textContent = totalWeight.toFixed(2);
  $$('#proTotalCost').textContent = '€' + totalCost.toFixed(2);

  if (changedRow && changedInput) {
    const name = changedRow.querySelector('.ing-name').value;
    const data = findIngredient(name);
    if (changedInput.classList.contains('ing-name')) {
      changedRow.cells[2].textContent = data?.d || '-';
      changedRow.cells[7].textContent = data?.note || '-';
      changedRow.cells[8].innerHTML = formatSource(data);
      changedRow.cells[9].textContent = data?.ifra || '-';
    }

    if (changedInput.classList.contains('ing-vol')) {
      const vol = parseFloat(changedInput.value) || 0;
      const density = data?.d || 1;
      const weight = vol * 0.02 * density; // Assuming 1 drop = 0.02ml
      changedRow.querySelector('.ing-wt').value = weight.toFixed(3);
      totalWeight = 0;
      rows.forEach(r => { totalWeight += parseFloat(r.querySelector('.ing-wt').value) || 0; });
      $$('#proTotalWt').textContent = totalWeight.toFixed(2);
    }
  }

  let newTotalCost = 0;
  rows.forEach(row => {
    const weight = parseFloat(row.querySelector('.ing-wt').value) || 0;
    const costPerGram = parseFloat(row.querySelector('.ing-cost').value) || 0;
    const rowCost = weight * costPerGram;
    row.querySelector('.row-cost').textContent = '€' + rowCost.toFixed(2);
    newTotalCost += rowCost;

    const pct = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
    row.querySelector('.row-pct').textContent = `${pct.toFixed(2)} %`;
  });

  $$('#proTotalCost').textContent = '€' + newTotalCost.toFixed(2);
  updateStatus();
  updateNoteSummary();
  updatePriceHelper(newTotalCost, totalWeight);
}

function updateStatus(){
  const formula = {};
  $$$('#proBody tr').forEach(row => {
    const name = row.querySelector('.ing-name').value;
    const pct = parseFloat(row.querySelector('.row-pct').textContent) || 0;
    if(name && pct > 0) formula[name] = (formula[name] || 0) + pct;
  });

  let html = '', hasIssues = false, hasCompliance = false;
  const checked = new Set();
  
  for(const [name, pct] of Object.entries(formula)){
    const ing = findIngredient(name);
    const cas = ing?.cas;
    if(!cas || checked.has(cas)) continue;
    
    const reg = S.reg[cas];
    if(reg){
      if(reg.eu_allergen) html += `<div class="status-chip eu">EU Allergen</div>`;
      if(reg.eu_restricted){
        const limit = parseFloat(reg.eu_restricted.limit);
        const totalPct = getTotalForCas(cas, formula);
        if(totalPct > limit){
          html += `<div class="status-chip fail">EU Restricted (${totalPct.toFixed(2)}% > ${limit}%)</div>`; hasIssues=true;
        }else{
          html += `<div class="status-chip ok">EU Restricted (${totalPct.toFixed(2)}% ≤ ${limit}%)</div>`; hasCompliance=true;
        }
      }
    }
    checked.add(cas);
  }

  for (const [name, pct] of Object.entries(formula)) {
    const ing = findIngredient(name);
    if (ing && ing.ifra) {
      const limit = parseFloat(ing.ifra);
      if (pct > limit) {
        html += `<div class="status-chip fail">${ing.name}: ${pct.toFixed(2)}% > ${limit}%</div>`; hasIssues=true;
      } else {
        html += `<div class="status-chip ok">${ing.name}: ${pct.toFixed(2)}% ≤ ${limit}%</div>`; hasCompliance=true;
      }
    }
  }

  if(!html) $$('#ifraStatusText').innerHTML = 'Enter rows to evaluate.';
  else if(hasIssues) $$('#ifraStatusText').innerHTML = html;
  else if(hasCompliance) $$('#ifraStatusText').innerHTML = `<div class="status-chip ok">All materials are within IFRA limits.</div>${html}`;
  else $$('#ifraStatusText').innerHTML = 'No IFRA restrictions found for these materials.';
}

function updateNoteSummary(){
  const notes = { T: 0, M: 0, B: 0, O: 0 };
  let totalWeight = 0;
  $$$('#proBody tr').forEach(row => {
    const name = row.querySelector('.ing-name').value;
    const weight = parseFloat(row.querySelector('.ing-wt').value) || 0;
    const data = findIngredient(name);
    const note = data?.note;
    if(note && weight > 0){
      if(notes.hasOwnProperty(note)) notes[note] += weight;
      else notes.O += weight;
      totalWeight += weight;
    }
  });

  if(totalWeight === 0){ $$('#noteSummaryText').textContent = '—'; return; }
  const t = (notes.T/totalWeight*100).toFixed(0);
  const m = (notes.M/totalWeight*100).toFixed(0);
  const b = (notes.B/totalWeight*100).toFixed(0);
  $$('#noteSummaryText').textContent = `Top: ${t}%, Middle: ${m}%, Base: ${b}%`;
}

function updatePriceHelper(cost, weight){
  $$('#helperCost').value = cost.toFixed(2);
  $$('#helperWeight').value = weight.toFixed(2);
  const res = weight > 0 ? (cost / weight * 10).toFixed(2) : 0;
  $$('#helperResult').textContent = `€${res} per 10g`;
}

function bindPro(){
  $$('#proAdd').onclick = () => addProRow();
  ['helperCost', 'helperWeight'].forEach(id => {
    $$(`#${id}`).oninput = () => {
      const cost = parseFloat($$('#helperCost').value) || 0;
      const weight = parseFloat($$('#helperWeight').value) || 0;
      updatePriceHelper(cost, weight);
    };
  });
}

// --- Autocomplete ---

function buildACList(){
  S.acList = S.list.map(o => o.name.toLowerCase());
  const syns = Object.entries(S.syn);
  syns.forEach(([k,v])=>{ if(k&&v) S.acList.push(k.toLowerCase()); });
  const ifra51 = Object.keys(S.ifra51);
  ifra51.forEach(k=>{ if(k) S.acList.push(k.toLowerCase()); });
}

function setupAutocomplete(input) {
  const acWrap = input.parentElement;
  const acList = acWrap.querySelector('.ac-list');
  
  input.onkeyup = () => {
    const val = input.value.toLowerCase();
    acList.innerHTML = '';
    if (val.length < 2) return;

    const matches = S.acList.filter(item => item.includes(val)).slice(0, 10);
    matches.forEach(match => {
      const div = document.createElement('div');
      div.textContent = findIngredient(.name || match;
      div.onclick = () => {
        input.value = div.textContent;
        acList.innerHTML = '';
        calculatePro(input.closest('tr'), input);
      };
      acList.appendChild(div);
    });
  };
  document.addEventListener('click', (e) => {
    if (e.target !== input) acList.innerHTML = '';
  });
}

// --- Utility Functions ---

function findIngredient(name) {
  if (!name) return null;
  const lname = name.toLowerCase();
  
  let ing = S.list.find(o => o.name.toLowerCase() === lname);
  if(ing) return { ...ing, source: 'main' };

  const syn = Object.entries(S.syn).find(([k,v])=>k.toLowerCase() === lname);
  if(syn) ing = S.list.find(o => o.name === syn[1]);
  if(ing) return { ...ing, source: 'synonym' };
  
  const cas = S.ifra51[name];
  if(cas) ing = S.list.find(o => o.cas === cas);
  if(ing) return { ...ing, source: 'ifra51' };
  
  return S.list.find(o => o.name.toLowerCase() === lname) || S.ifraFallback[name] || null;
}

function getTotalForCas(cas, formula){
  return S.list.filter(o=>o.cas === cas).reduce((acc,cur) => acc + (formula[cur.name] || 0), 0);
}

function formatSource(data) {
  if (!data?.source) return `— ${data?.cas ? `<span class="cas-chip">${data.cas}</span>` : ''}`;
  let html = '';
  if (data.source === 'main') html = 'TGSC';
  else if (data.source === 'synonym') html = '<span class="src-note">Synonym</span>';
  else if (data.source === 'ifra51') html = '<span class="src-note">IFRA51</span>';
  if(data.spec_url){
    html += `<span class="spec-help" data-tip="${data.spec_text || 'No details'}">?</span>`;
  }
  if (data.cas) html += `<span class="cas-chip">${data.cas}</span>`;
  return html;
}

// --- Initialization ---

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
    const dl=$$('#ingredientList'); if(dl){ dl.innerHTML=''; (S.list||[]).forEach(o=>{ const opt=document.createElement('option'); opt.value=o.name; dl.appendChild(opt); }); }
    buildACList();
    if($$('#dataStatus')) $$('#dataStatus').textContent=`Data loaded (version: ${S.version||'n/a'})`;
    const prev=localStorage.getItem('pc_data_version'); if(S.version && prev && prev!==S.version) showUpdate(); if(S.version) localStorage.setItem('pc_data_version',S.version);
  }catch(e){ console.error(e); if($$('#dataStatus')) $$('#dataStatus').textContent='Failed to load data.'; }
}

function bindGlobal(){ $$('#modeSimple').onclick=()=>setMode('simple'); $$('#modePro').onclick=()=>setMode('pro'); $$('#themeToggle').onclick=toggleTheme; }
function toggleTheme(){ const root=document.documentElement; const cur = root.getAttribute('data-theme')==='dark' ? 'light' : 'dark'; root.setAttribute('data-theme', cur); localStorage.setItem('pc_theme',cur); }
function initTheme(){ const saved = localStorage.getItem('pc_theme'); if(saved) document.documentElement.setAttribute('data-theme', saved); }

function init() {
  initTheme();
  bindGlobal();
  bindSimple();
  bindPro();
  const savedMode = localStorage.getItem('pc_mode') || 'simple';
  setMode(savedMode);
  loadData();
  navigator.serviceWorker.register('./sw.js').then(r => S.regSW = r);
  setupRefresh();
}

document.addEventListener('DOMContentLoaded', init);
