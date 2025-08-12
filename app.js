(function(){
  function val(id){ return parseFloat(document.getElementById(id)?.value || '0'); }
  function text(id, v){ const el=document.getElementById(id); if(el) el.textContent=v; }
  function fmt(n, d=3){ return (isFinite(n)? n : 0).toFixed(d); }

  function computeBatch(){
    const targetMl = val('batchVolume');
    const density = val('batchDensity') || 0.85;
    const dosage  = parseFloat(document.getElementById('dosage')?.value || '0');
    const oilMl   = targetMl * (dosage/100);
    const rowsEl  = document.getElementById('batchBody');
    if(!rowsEl) return;

    const tableRows = Array.from(document.querySelectorAll('#tableBody tr')).map(tr => {
      const name = tr.querySelector('input[list]')?.value?.trim() || '';
      const pct  = parseFloat(tr.querySelector('input[type=number]')?.value || '0');
      return { name, pct: isNaN(pct) ? 0 : pct };
    }).filter(r => r.name && r.pct > 0);

    rowsEl.innerHTML='';
    let pctTotal=0, volTotal=0, wtTotal=0;
    tableRows.forEach(r => {
      const ml = oilMl * (r.pct/100);
      const g  = ml * density;
      pctTotal += r.pct; volTotal += ml; wtTotal += g;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.name}</td><td>${fmt(r.pct,2)}</td><td>${fmt(ml,3)}</td><td>${fmt(g,3)}</td>`;
      rowsEl.appendChild(tr);
    });

    text('batchPctTotal', fmt(pctTotal,2));
    text('batchVolTotal', fmt(volTotal,3));
    text('batchWtTotal',  fmt(wtTotal,3));

    const solventMl = Math.max(0, targetMl - oilMl);
    const summary = `Finished volume: ${fmt(targetMl,1)} ml — Oil: ${fmt(oilMl,1)} ml — Solvent: ${fmt(solventMl,1)} ml (at ${fmt(dosage,1)}% dosage)`;
    const sumEl = document.getElementById('batchSummary'); if(sumEl) sumEl.textContent = summary;
  }

  function exportBatchCSV(){
    const rows = Array.from(document.querySelectorAll('#batchBody tr')).map(tr => {
      const tds = tr.querySelectorAll('td');
      return { name: tds[0].textContent, pct: tds[1].textContent, ml: tds[2].textContent, g: tds[3].textContent };
    });
    if(!rows.length){ alert('No batch rows. Click Calculate first.'); return; }

    const heads = ['Ingredient','% in concentrate','Oil volume (ml)','Weight (g)'];
    const lines = [heads.join(',')];
    rows.forEach(r => lines.push([`"${r.name.replace(/"/g,'""')}"`, r.pct, r.ml, r.g].join(',')));

    const totals = ['Totals',
      document.getElementById('batchPctTotal')?.textContent || '0',
      document.getElementById('batchVolTotal')?.textContent || '0',
      document.getElementById('batchWtTotal')?.textContent || '0'
    ];
    lines.push(totals.join(','));

    const blob = new Blob([lines.join('\\n')], {type:'text/csv'});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'batch-scaled-simple.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function bind(){
    const calc = document.getElementById('batchCalcBtn');
    const exp  = document.getElementById('batchExportBtn');
    if(calc) calc.addEventListener('click', computeBatch);
    if(exp)  exp.addEventListener('click', exportBatchCSV);
    const dosage = document.getElementById('dosage');
    if(dosage) dosage.addEventListener('input', () => { clearTimeout(bind._t); bind._t = setTimeout(computeBatch, 150); });
  }
  document.addEventListener('DOMContentLoaded', bind);
})();