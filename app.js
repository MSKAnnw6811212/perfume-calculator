/* Patch: IFRA51 + CAS engine + EU overlay + Synonyms */
(async function(){
  async function j(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error(url); return r.json(); }
  const ifra51 = await j('data/ifra-51.json').catch(()=>({}));
  const syn = await j('data/synonyms.json').catch(()=>({}));
  const reg = await j('data/regulatory.json').catch(()=>({}));
  const ingr = await j('data/ingredients.json').catch(()=>([]));
  const fallback = await j('data/ifra.json').catch(()=>({}));

  const ingrByName = new Map((ingr||[]).map(o=>[(o.name||'').toLowerCase(), o]));
  const ifra51ByCAS = new Map(Object.entries(ifra51).filter(([k,v])=>k!=='_meta'));

  function nameToCAS(name){
    if(!name) return null;
    const n = name.trim().toLowerCase();
    if(syn[n]) return syn[n];
    const ing = ingrByName.get(n);
    if(ing && ing.casNumber) return String(ing.casNumber);
    const n2 = n.replace(/\s*\(.*?\)\s*/g,' ').trim();
    if(syn[n2]) return syn[n2];
    const ing2 = ingrByName.get(n2);
    if(ing2 && ing2.casNumber) return String(ing2.casNumber);
    return null;
  }

  const EU = new Set(Object.keys((reg||{}).EU_COSMETICS||{}));
  const cats = ['4','5A','5B','9'];

  function resolveIFRA({name, category, finishedPct}){
    let cas = nameToCAS(name);
    let source = 'NONE';
    let spec = null;
    let limit = null;
    let status = 'n/a';

    if(cas && ifra51ByCAS.has(cas)){
      const rec = ifra51ByCAS.get(cas);
      source = 'IFRA51';
      if(rec.type === 'spec'){
        spec = rec.spec || {};
        status = 'spec';
      } else if(rec.type === 'restricted'){
        const lim = rec.limits?.[category];
        if(lim != null){ limit = Number(lim); status = (finishedPct != null) ? (finishedPct <= lim ? 'ok' : 'fail') : 'ok'; }
      }
    } else {
      const ing = (name && ingrByName.get((name||'').toLowerCase())) || null;
      const lim = (ing && ing.ifraLimits && (ing.ifraLimits[category] != null)) ? Number(ing.ifraLimits[category]) : (fallback[name]?.[category]);
      if(lim != null){ limit = Number(lim); source = ing ? 'ING' : 'FALLBACK'; status = (finishedPct != null) ? (finishedPct <= limit ? 'ok' : 'fail') : 'ok'; }
    }

    if(cas && EU.has(cas)){
      status = 'eu-ban';
      limit = 0.0;
    }
    return {cas, source, spec, limit, status};
  }

  // SIMPLE
  const dosageEl = document.querySelector('#dosage');
  const tb = document.querySelector('#tableBody');
  function updateSimple(){
    const dosage = parseFloat(dosageEl?.value||'0');
    const rows = Array.from(tb?.querySelectorAll('tr') || []);
    let totConc = 0, totFin = 0;
    rows.forEach(tr=>{
      const name = tr.querySelector('input[list]')?.value?.trim()||'';
      const pct = parseFloat(tr.querySelector('input[type=number]')?.value||'0')||0;
      const fin = pct * (dosage/100);
      totConc += pct; totFin += fin;
      const finCell = tr.querySelector('.finished'); if(finCell) finCell.textContent = fin.toFixed(3);
      cats.forEach(cat=>{
        const r = resolveIFRA({name, category: cat, finishedPct: fin});
        const cell = tr.querySelector('.ifra-'+cat); if(!cell) return;
        let html = '';
        if(r.status==='eu-ban'){
          html = `<span class="status eu">EU PROHIBITED</span>`;
        } else if(r.status==='spec'){
          html = `<span class="status spec">SPEC</span>`;
        } else if(r.limit != null){
          const ok = fin <= r.limit;
          const cls = ok ? ( (r.limit>0 && fin/r.limit>0.8) ? 'warn' : 'ok') : 'fail';
          html = `<span class="status ${cls}">${fin.toFixed(3)} ≤ ${r.limit}%</span>`;
        } else {
          html = `<span class="status">n/a</span>`;
        }
        const casTxt = r.cas ? ` <span class="cas-chip">CAS ${r.cas}</span>` : '';
        cell.innerHTML = html + casTxt;
      });
    });
    const tc = document.querySelector('#totalConcentrate'); if(tc) tc.textContent = totConc.toFixed(3);
    const tf = document.querySelector('#totalFinished'); if(tf) tf.textContent = totFin.toFixed(3);
  }
  if(dosageEl && tb){
    dosageEl.addEventListener('input', updateSimple);
    tb.addEventListener('input', updateSimple);
    updateSimple();
  }

  // PRO
  const proBody = document.querySelector('#proBody');
  const catSel = document.querySelector('#ifraCategory');
  function updatePro(){
    const cat = catSel?.value || '4';
    const rows = Array.from(proBody?.querySelectorAll('tr') || []);
    const bad = [];
    rows.forEach(tr => {
      const name = tr.querySelector('.p-name')?.value?.trim()||'';
      const pctText = tr.querySelector('.p-pct')?.textContent||'0';
      const pct = parseFloat(pctText.replace('%',''))||0;
      const r = resolveIFRA({name, category: cat, finishedPct: pct});
      if(r.status==='eu-ban'){ bad.push({name, msg:'EU PROHIBITED'}); }
      else if(r.limit != null && pct > r.limit){ bad.push({name, msg: `${pct.toFixed(2)}% > ${r.limit}%`}); }
    });
    const stWrap = document.querySelector('#ifraStatus'); const st = document.querySelector('#ifraStatusText');
    if(!st) return;
    if(bad.length){
      stWrap && (stWrap.style.borderColor = '#b00020');
      st.innerHTML = `<strong>⚠ Non-compliant for Cat ${cat}</strong><ul>` + bad.map(o=>`<li><b>${o.name}</b> — ${o.msg}</li>`).join('') + `</ul>`;
    } else {
      stWrap && (stWrap.style.borderColor = '#2e7d32');
      st.innerHTML = `<strong>✅ Compliant for Cat ${cat}</strong>`;
    }
  }
  if(proBody && catSel){
    proBody.addEventListener('input', updatePro);
    proBody.addEventListener('change', updatePro);
    catSel.addEventListener('change', updatePro);
    updatePro();
  }

  // Version bump
  try { const v = await j('version.json'); localStorage.setItem('pc_data_version', v.data || String(Date.now())); } catch(e) {}
})();