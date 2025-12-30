/* App: Simple + Pro | Robust Version 1.2.0 | Fixes: Manual CAS, Decimals, IFRA Prohibited */

const $$ = s => document.querySelector(s), $$$ = s => document.querySelectorAll(s);

// --- ENTITLEMENT CONFIG ---
const UPGRADE_URL = ''; // Pending checkout URL
const ENT = {
  tier: localStorage.getItem('pc_tier') || 'free',
  limits: {
    free: { rows: 8, recipes: 5, simpleIFRACategories: ['4'] },
    pro: { rows: Infinity, recipes: Infinity, simpleIFRACategories: ['4', '5A', '5B', '9'] }
  }
};
// DEV TOGGLES:
// localStorage.setItem('pc_tier', 'pro'); location.reload();
// localStorage.setItem('pc_tier', 'free'); location.reload();

function isPro() { return ENT.tier === 'pro'; }
function ent() { return ENT.limits[ENT.tier]; }

function activateLicense(key) {
  if (key && key.trim().toUpperCase() === 'PRO-TEST') {
    localStorage.setItem('pc_tier', 'pro');
    alert("License Activation Successful! Reloading...");
    location.reload();
  } else {
    showToast('Invalid License Key');
  }
}

function openUpgrade() {
  if (!UPGRADE_URL) { showToast('Pro checkout is not live yet.'); return; }
  window.open(UPGRADE_URL, '_blank');
}

function showUpgradeModal() {
  if (isPro()) return;
  const m = $$('#upgradeModal');
  if (m) m.hidden = false;
}

function setupUpgradeModal() {
  const m = $$('#upgradeModal');
  if (!m) return;

  // Offer View
  const btn = $$('#upgradeBtn'); if (btn) btn.onclick = () => openUpgrade();
  const later = $$('#upgradeNotNow'); if (later) later.onclick = () => {
    m.hidden = true;
    sessionStorage.setItem('pc_upgrade_dismissed', '1');
  };

  // License View Interactions
  const offerView = $$('#modalOfferContent');
  const licenseView = $$('#modalLicenseContent');
  const trigger = $$('#triggerLicense');
  const activateBtn = $$('#activateKeyBtn');
  const cancelBtn = $$('#cancelActivateBtn');
  const input = $$('#licenseInput');

  if (trigger) trigger.onclick = (e) => {
    e.preventDefault();
    offerView.hidden = true;
    licenseView.hidden = false;
    input.focus();
  };

  if (cancelBtn) cancelBtn.onclick = () => {
    licenseView.hidden = true;
    offerView.hidden = false;
  };

  if (activateBtn) activateBtn.onclick = () => {
    activateLicense(input.value);
  };

  // Allow closing by clicking background
  m.onclick = (e) => {
    if (e.target === m) {
      m.hidden = true;
      // Reset view for next time
      offerView.hidden = false;
      licenseView.hidden = true;
    }
  };
}

function applyEntitlements() {
  setupUpgradeModal();
  if (isPro()) return;

  // Visual Gating
  document.body.classList.add('tier-free');

  // Lock Actions
  const lockIds = ['#exportCsv', '#batchExportBtn', '#importIngredientsBtn', '#proExport'];
  lockIds.forEach(id => {
    const el = $$(id);
    if (el) {
      el.classList.add('locked-feature');
      // Intercept clicks handled via simple onclick replacement or event capture
      // Since s_bind assigns onclick, we can wrap it or just overwrite it here if run AFTER s_bind.
      // But s_bind is called in init(). We'll call applyEntitlements() in init().
      // If we call it AFTER s_bind, we can capture.
      const old = el.onclick;
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showUpgradeModal();
      };
    }
  });
}

const S = {
  mode: 'simple',
  list: [],      // Combined list
  dbList: [],    // Official JSON list
  customList: [], // User-imported list
  ingMap: new Map(),
  ifraFallback: {},
  ifra51: {},
  syn: {},
  reg: {},
  version: null,
  regSW: null,
  acList: []
};

// --- HELPER: Toast Feedback ---
function showToast(msg) {
  const c = $$('#toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'fadeOut 0.5s forwards';
    setTimeout(() => t.remove(), 500);
  }, 3000);
}

// --- HELPER: Parse numbers safely (European/US Support) ---
function parseNum(val) {
  if (!val) return 0;
  // 1. Convert comma to dot (European support)
  let clean = String(val).replace(/,/g, '.');
  // 2. Remove anything that isn't a digit, dot, or minus
  clean = clean.replace(/[^\d.-]/g, '');
  // 3. Parse
  let num = parseFloat(clean);
  // 4. Sanity checks
  if (isNaN(num)) return 0;

  // FIX: Prevent Negative Values (Issue F-B2)
  if (num < 0) return 0;

  return num;
}

// --- HELPER: Fetch JSON ---
async function fetchJSON(u) {
  try {
    const r = await fetch(u + '?t=' + new Date().getTime(), { cache: 'no-store' });
    if (!r.ok) throw new Error(u);
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch (err) {
      alert("JSON Syntax Error in " + u + ":\n" + err.message);
      console.error("Bad JSON:", txt);
      throw err;
    }
  } catch (e) {
    console.warn("Failed to load:", u, e);
    return {};
  }
}

// --- HELPER: Enforce Positive Inputs ---
function setupInputConstraints() {
  document.body.addEventListener('input', function (e) {
    if (e.target.classList.contains('num-input')) {
      let val = e.target.value;
      if (val.includes('-')) {
        // Remove any minus signs immediately
        const clean = val.replace(/-/g, '');
        if (val !== clean) {
          e.target.value = clean;
        }
      }
    }
  });
}

// --- HELPER: Download CSV ---
function downloadCSV(filename, content) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setMode(m) {
  try {
    if (m === 'pro' && !isPro()) {
      if (!sessionStorage.getItem('pc_upgrade_dismissed')) showUpgradeModal();
      else showToast('Pro mode is locked.');
      return;
    }
    S.mode = m;
    localStorage.setItem('pc_mode', m);
    renderMode();
  } catch (e) { console.error("setMode error", e); }
}

function renderMode() {
  if (!$$('#simpleSection') || !$$('#proSection')) return;
  $$('#simpleSection').hidden = S.mode !== 'simple';
  $$('#proSection').hidden = S.mode !== 'pro';
  $$$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
}

function showUpdate() { const b = $$('#updateBanner'); if (b) b.hidden = false; }

function setupRefresh() {
  const btn = document.getElementById('refreshBtn');
  if (!btn) return;
  btn.onclick = async () => {
    let reloaded = false;
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }
    try {
      if (S.regSW?.waiting) S.regSW.waiting.postMessage({ type: 'SKIP_WAITING' });
      if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      await S.regSW?.update?.();
    } catch (e) { console.warn('refresh/skip error', e); }
    window.location.reload();
  };
}

function setupTheme() {
  const sv = localStorage.getItem('pc_theme');
  if (sv) document.documentElement.setAttribute('data-theme', sv);
  const btn = $$('#themeToggle');
  if (btn) btn.onclick = () => {
    const c = document.documentElement.getAttribute('data-theme') || 'light';
    const n = c === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', n);
    localStorage.setItem('pc_theme', n);
  };
}

// --- LOGIC: Name to CAS Lookup ---
function nameToCAS(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();

  if (S.syn[n]) return String(S.syn[n]);

  const ing = S.ingMap.get(n);
  if (ing?.casNumber) return String(ing.casNumber);

  const n2 = n.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  if (S.syn[n2]) return String(S.syn[n2]);

  const ing2 = S.ingMap.get(n2);
  if (ing2?.casNumber) return String(ing2.casNumber);

  return null;
}

// --- LOGIC: Resolve Safety ---
// UPDATED: Now accepts an optional 'manualCas' which overrides the name lookup
function resolveIFRA({ name, manualCas, category, finishedPct }) {
  const EU = new Set(Object.keys((S.reg?.EU_COSMETICS) || {}));

  // 1. Determine CAS: Use manual input if provided, otherwise lookup by name
  let cas = manualCas ? manualCas.trim() : null;
  if (!cas) cas = nameToCAS(name);

  let status = 'n/a', limit = null, spec = null, source = 'NONE';

  // 2. IFRA Check
  if (cas && S.ifra51[cas]) {
    const rec = S.ifra51[cas];
    source = 'IFRA51';
    if (rec.type === 'spec') { status = 'spec'; spec = rec.spec || {}; }
    // Handles BOTH Restricted and Prohibited items
    else if (rec.type === 'restricted' || rec.type === 'prohibited') {
      const lim = rec.limits?.[category];
      if (lim != null) {
        limit = Number(lim);
        status = (finishedPct != null) ? (finishedPct <= lim ? 'ok' : 'fail') : 'ok';
      }
    }
  } else {
    // Fallback
    const ing = S.ingMap.get((name || '').toLowerCase());
    const lim = (ing?.ifraLimits?.[category] ?? S.ifraFallback[name]?.[category]);
    if (lim != null) { limit = Number(lim); source = ing ? 'ING' : 'FALLBACK'; status = (finishedPct != null) ? (finishedPct <= lim ? 'ok' : 'fail') : 'ok'; }
  }

  // 3. EU Check (Overrides IFRA if Banned)
  if (cas && EU.has(cas)) { status = 'eu-ban'; limit = 0.0; source = 'EU'; }

  return { cas, status, limit, spec, source };
}

// --- CSV IMPORTER LOGIC ---
function setupImporter() {
  const btn = $$('#importIngredientsBtn');
  const input = $$('#importCsvInput');
  const clearBtn = $$('#clearCustomData');

  if (btn && input) {
    btn.onclick = () => input.click();
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => processCSV(evt.target.result);
      reader.readAsText(file);
      input.value = '';
    };
  }

  if (clearBtn) {
    const hasCustom = localStorage.getItem('pc_custom_ingredients');
    if (hasCustom) clearBtn.hidden = false;
    clearBtn.onclick = () => {
      if (confirm('Remove all imported custom ingredients?')) {
        localStorage.removeItem('pc_custom_ingredients');
        location.reload();
      }
    };
  }
}

function processCSV(text) {
  try {
    const lines = text.split(/\r\n|\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error("Empty or invalid CSV");

    // FIX: Detect Delimiter (Issue F-B3)
    const headerLine = lines[0];
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semiCount = (headerLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    const splitCSV = (str) => {
      const arr = [];
      let quote = false;
      let col = "";
      for (let c of str) {
        if (c === '"') { quote = !quote; }
        else if (c === delimiter && !quote) { arr.push(col.trim()); col = ""; }
        else { col += c; }
      }
      arr.push(col.trim());
      return arr.map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
    };

    const headers = splitCSV(lines[0].toLowerCase());
    const map = { name: -1, cas: -1, den: -1, price: -1, note: -1, notes: -1 };

    headers.forEach((h, i) => {
      if (h.includes('name') || h.includes('ingredient')) map.name = i;
      else if (h.includes('cas')) map.cas = i;
      else if (h.includes('den') || h.includes('gravity')) map.den = i;
      else if (h.includes('price') || h.includes('cost')) map.price = i;
      else if (h === 'note' || h.includes('pyramid') || h === 'notes') map.note = i; // Adjusted to catch 'notes' if it means pyramid note
      else if (h.includes('desc') || h.includes('odor')) map.notes = i;
    });

    if (map.name === -1) throw new Error("Could not find a 'Name' column.");

    let newCount = 0;
    let updateCount = 0;

    // Load existing items
    const existing = JSON.parse(localStorage.getItem('pc_custom_ingredients') || '[]');
    // Create maps for quick lookup
    const existingByName = new Map(existing.map(i => [i.name.toLowerCase(), i]));
    const existingByCAS = new Map();
    existing.forEach(i => {
      if (i.casNumber) existingByCAS.set(i.casNumber.trim(), i);
    });

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = splitCSV(lines[i]);
      if (cols.length < 1) continue;

      const rowName = cols[map.name] || '';
      const rowCas = map.cas > -1 ? cols[map.cas] : '';

      const item = {
        name: rowName,
        casNumber: rowCas,
        density: map.den > -1 ? parseNum(cols[map.den]) : 0.85,
        pricePer10g: map.price > -1 ? parseNum(cols[map.price]) : 0,
        note: map.note > -1 ? cols[map.note] : 'Middle',
        notes: map.notes > -1 ? cols[map.notes] : ''
      };

      if (item.name) {
        // FIX: Deduplication (Issue F-B4)
        // Check by Name OR CAS
        let match = existingByName.get(item.name.toLowerCase());
        if (!match && item.casNumber) {
          match = existingByCAS.get(item.casNumber.trim());
        }

        if (match) {
          // Update existing entry
          Object.assign(match, item);
          updateCount++;
        } else {
          // Add new entry
          existing.push(item);
          existingByName.set(item.name.toLowerCase(), item);
          if (item.casNumber) existingByCAS.set(item.casNumber.trim(), item);
          newCount++;
        }
      }
    }

    if (newCount > 0 || updateCount > 0) {
      localStorage.setItem('pc_custom_ingredients', JSON.stringify(existing));
      alert(`Import Successful!\nAdded: ${newCount}\nUpdated: ${updateCount}\nPage will reload.`);
      location.reload();
    } else {
      alert("No valid ingredients found or no changes made.");
    }
  } catch (e) {
    console.error(e);
    alert("Import Failed: " + e.message);
  }
}

// --- START: Simple Mode Functions ---
function s_row(d = { name: '', pct: 0 }) {
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  nameTd.innerHTML = `<div class="ac-wrap">
      <input type="text" list="ingredientList" placeholder="Ingredient" value="${d.name || ''}" autocomplete="off">
      <div class="ac-list" hidden></div>
    </div>`;
  const pctTd = document.createElement('td');
  pctTd.innerHTML = `<input type="text" inputmode="decimal" min="0" class="num-input" placeholder="0" value="${d.pct ?? 0}">`;
  const finTd = document.createElement('td'); finTd.className = 'finished'; finTd.textContent = '0';
  const mkIfraCell = (c) => { const td = document.createElement('td'); td.className = 'ifra ifra-' + c; td.innerHTML = '<span class="status">n/a</span>'; return td; };
  const idx = document.createElement('td'); idx.className = 'idx';

  const rmTd = document.createElement('td');
  const rm = document.createElement('button'); rm.className = 'danger rm'; rm.textContent = 'Remove';
  rmTd.appendChild(rm);

  tr.appendChild(idx);
  tr.appendChild(nameTd);
  tr.appendChild(pctTd);
  tr.appendChild(finTd);
  ['4', '5A', '5B', '9'].forEach(cat => tr.appendChild(mkIfraCell(cat)));
  tr.appendChild(rmTd);

  if ($$('#tableBody')) $$('#tableBody').appendChild(tr);

  const input = nameTd.querySelector('input'); // generic selector safer with/without list
  const list = nameTd.querySelector('.ac-list');
  bindAutocomplete(input, list);
}

function s_rows() {
  return Array.from($$$('#tableBody tr')).map(tr => ({
    tr,
    name: tr.querySelector('input[list]') ? tr.querySelector('input[list]').value.trim() : '',
    pct: tr.querySelector('.num-input') ? parseNum(tr.querySelector('.num-input').value) : 0
  }));
}
function s_renum() { $$$('#tableBody .idx').forEach((td, i) => td.textContent = i + 1); }
function s_fin(pct, dos) { return (pct * dos) / 100; }

function badge(val, limit, cls, src) {
  if (!isPro()) {
    // Status-only display for Free
    const map = { ok: 'OK', warn: 'NEAR', fail: 'EXCEEDS', 'eu-ban': 'EU PROHIBITED', spec: 'SPEC' };
    let txt = map[cls] || cls.toUpperCase();
    if (cls === 'ok') txt = 'OK';
    return `<span class="status ${cls}">${txt}</span>`;
  }
  const srcHtml = src && src !== 'NONE' ? `<em class="src-note">${src}</em>` : '';
  return `<span class="status ${cls}">${val.toFixed(3)} ≤ ${limit}% ${srcHtml}</span>`;
}
function s_update() {
  const dosage = parseNum($$('#dosage').value);
  let tConc = 0, tFin = 0;
  const cats = ent().simpleIFRACategories; // Respect entitlement categories

  s_rows().forEach(({ tr, name, pct }) => {
    tConc += pct;
    const fin = s_fin(pct, dosage); tFin += fin;
    if (tr.querySelector('.finished')) tr.querySelector('.finished').textContent = fin.toFixed(3);

    // Only loop supported categories (Free: 4 only)
    cats.forEach(cat => {
      const r = resolveIFRA({ name, category: cat, finishedPct: fin });
      const cell = tr.querySelector('.ifra-' + cat);
      if (!cell) return;
      let html = '';
      if (r.status === 'eu-ban') {
        html = isPro() ? `<span class="status eu">EU PROHIBITED</span>` : badge(0, 0, 'eu-ban', '');
      } else if (r.status === 'spec') {
        html = isPro()
          ? `<span class="status spec">SPEC <span class="spec-help" data-tip="Refer to IFRA standards.">?</span></span>`
          : badge(0, 0, 'spec', '');
      } else if (r.limit != null) {
        const cls = fin <= r.limit ? ((r.limit > 0 && fin / r.limit > 0.8) ? 'warn' : 'ok') : 'fail';
        html = badge(fin, r.limit, cls, r.source);
      } else {
        html = `<span class="status">n/a</span>`;
      }
      const casTxt = (isPro() && r.cas) ? ` <span class="cas-chip">CAS ${r.cas}</span>` : '';
      cell.innerHTML = html + casTxt;
    });
  });
  if ($$('#totalConcentrate')) $$('#totalConcentrate').textContent = tConc.toFixed(3);
  if ($$('#totalFinished')) $$('#totalFinished').textContent = tFin.toFixed(3);
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
  if (!body) return;
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

  if ($$('#batchPctTotal')) $$('#batchPctTotal').textContent = totalPct.toFixed(3);
  if ($$('#batchVolTotal')) $$('#batchVolTotal').textContent = totalVol.toFixed(3);
  if ($$('#batchWtTotal')) $$('#batchWtTotal').textContent = totalWt.toFixed(3);
}

function s_batch_export() {
  const results = getBatchData();
  const lines = [['Ingredient', '% in concentrate', 'Oil volume (ml)', 'Weight (g)'].join(',')];
  results.forEach(r => {
    lines.push([`"${r.name.replace(/"/g, '""')}"`, r.pct.toFixed(3), r.oilVol.toFixed(3), r.weight.toFixed(3)].join(','));
  });
  downloadCSV('batch-export.csv', lines.join('\n'));
}

function s_bind() {
  if ($$('#addRow')) $$('#addRow').onclick = () => {
    if (!isPro() && s_rows().length >= ent().rows) { showUpgradeModal(); return; }
    s_row(); s_renum(); s_update();
  };
  if ($$('#tableBody')) $$('#tableBody').addEventListener('click', e => {
    if (e.target.classList.contains('rm')) { e.target.closest('tr').remove(); s_renum(); s_update(); }
  });
  if ($$('#tableBody')) $$('#tableBody').addEventListener('input', s_update);
  if ($$('#dosage')) $$('#dosage').addEventListener('input', s_update);
  if ($$('#batchCalcBtn')) $$('#batchCalcBtn').onclick = s_batch_calc;
  if ($$('#batchExportBtn')) $$('#batchExportBtn').onclick = s_batch_export;
  ['#batchVolume', '#batchDensity'].forEach(id => {
    if ($$(id)) $$(id).addEventListener('input', s_batch_calc);
  });
  if ($$('#saveRecipe')) $$('#saveRecipe').onclick = () => {
    const n = $$('#recipeName').value.trim(); if (!n) return alert('Name?');
    const all = JSON.parse(localStorage.getItem('pc_recipes_v1') || '{}');
    // Limit check for NEW recipes
    if (!isPro() && !all[n] && Object.keys(all).length >= ent().recipes) { showUpgradeModal(); return; }

    const rows = s_rows().map(r => ({ name: r.name, pct: r.pct }));
    const dosage = parseNum($$('#dosage').value);
    all[n] = { dosage, rows }; localStorage.setItem('pc_recipes_v1', JSON.stringify(all)); s_pop(n);
    showToast(`Recipe "${n}" Saved`);
  };
  if ($$('#loadRecipe')) $$('#loadRecipe').onclick = () => {
    const n = $$('#savedRecipes').value;
    const all = JSON.parse(localStorage.getItem('pc_recipes_v1') || '{}');
    if (!all[n]) return;
    $$('#tableBody').innerHTML = '';
    (all[n].rows || []).forEach(s_row); $$('#dosage').value = all[n].dosage || 0;
    s_renum(); s_update();
    showToast(`Recipe "${n}" Loaded`);
  };
  if ($$('#deleteRecipe')) $$('#deleteRecipe').onclick = () => {
    const n = $$('#savedRecipes').value;
    const all = JSON.parse(localStorage.getItem('pc_recipes_v1') || '{}');
    if (!n || !all[n]) return;
    if (!n || !all[n]) return;
    if (!confirm('Are you sure you want to delete the recipe "' + n + '"?')) return;
    delete all[n];
    localStorage.setItem('pc_recipes_v1', JSON.stringify(all));
    s_pop();
    $$('#recipeName').value = '';
    showToast('Recipe Deleted');
  };
  if ($$('#exportCsv')) $$('#exportCsv').onclick = () => {
    const dosage = parseNum($$('#dosage').value); const rows = s_rows();
    const lines = [['#', 'Ingredient', '% in concentrate', 'Dosage %', 'Finished %', 'IFRA 4', 'IFRA 5A', 'IFRA 5B', 'IFRA 9'].join(',')];
    rows.forEach((r, i) => {
      const fin = s_fin(r.pct, dosage);
      const vals = ['4', '5A', '5B', '9'].map(cat => {
        const z = resolveIFRA({ name: r.name, category: cat, finishedPct: fin });
        if (z.status === 'eu-ban') return 'EU PROHIBITED';
        return z.limit != null ? `≤ ${z.limit}%` : 'n/a';
      });
      lines.push([i + 1, `"${r.name.replace(/"/g, '""')}"`, r.pct, dosage, fin.toFixed(3), ...vals].join(','));
    });
    downloadCSV('simple.csv', lines.join('\n'));
    showToast('CSV Exported');
  };
  if ($$('#printBtn')) $$('#printBtn').onclick = () => window.print();
  if ($$('#clearAll')) $$('#clearAll').onclick = () => { if (!confirm('Clear all rows?')) return; $$('#tableBody').innerHTML = ''; s_row(); s_renum(); s_update(); };
  function s_pop(sel = '') {
    const s = $$('#savedRecipes'); if (!s) return;
    const all = JSON.parse(localStorage.getItem('pc_recipes_v1') || '{}');
    s.innerHTML = '';
    Object.keys(all).sort().forEach(k => {
      const o = document.createElement('option'); o.value = k; o.textContent = k;
      if (k === sel) o.selected = true;
      s.appendChild(o);
    });
    if (sel && !all[sel]) s.value = '';
  }
  s_pop();
}

function acGroup(s) {
  const c = (s || '').trim().charAt(0);
  if (!c) return 3;
  if (/[A-Za-z]/.test(c)) return 0;
  if (/[0-9]/.test(c)) return 1;
  return 2;
}
function acSort(a, b) {
  const ga = acGroup(a), gb = acGroup(b);
  if (ga !== gb) return ga - gb;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function buildACList() {
  const namesFromIFRA = Object.values(S.ifra51 || {}).map(v => v?.name).filter(Boolean);
  const synKeys = Object.keys(S.syn || {});
  const ingNames = S.list.map(i => i.name).filter(Boolean);
  const set = new Set([...synKeys, ...namesFromIFRA, ...ingNames]);
  S.acList = Array.from(set).filter(Boolean).sort(acSort);
}

function bindAutocomplete(input, listEl) {
  if (!input || !listEl) return;
  function render(items, q = '') {
    if (!items.length) { listEl.hidden = true; listEl.innerHTML = ''; return; }
    const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    listEl.innerHTML = items.slice(0, 40).map((txt, i) => {
      const shown = rx ? txt.replace(rx, m => `<mark>${m}</mark>`) : txt;
      return `<div class="ac-item${i === 0 ? ' active' : ''}" data-val="${txt.replace(/"/g, '&quot;')}">${shown}</div>`;
    }).join('');
    listEl.hidden = false;
  }
  function pick(val) { input.value = val; listEl.hidden = true; listEl.innerHTML = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); }
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { render(S.acList.slice(0, 40)); return; }
    const items = S.acList.filter(x => x.toLowerCase().includes(q));
    render(items, q);
  });
  input.addEventListener('focus', () => { if (!input.value) render(S.acList.slice(0, 40)); });
  listEl.addEventListener('mousedown', e => { const it = e.target.closest('.ac-item'); if (it) pick(it.dataset.val); });
  document.addEventListener('click', (e) => { if (!listEl.contains(e.target) && e.target !== input) { listEl.hidden = true; } });
}

// --- START: Pro Mode Functions ---
function p_row(d = {}) {
  const tr = document.createElement('tr');
  const dil = d.dilution ?? 100;
  const solv = d.solvent ?? 'Ethanol';

  // NOTE: 'p-cas' is the MANUAL entry field
  tr.innerHTML = `<td><input type="text" class="p-name" list="ingredientList" value="${(d.name || '')}" autocomplete="off"></td>
    <td><input type="text" inputmode="decimal" min="0" class="p-vol num-input" placeholder="0" value="${d.vol ?? 0}"></td>
    <td><input type="text" inputmode="decimal" min="0" class="p-den num-input" placeholder="0.85" value="${d.den ?? 0.85}"></td>
    <td><input type="text" inputmode="decimal" min="0" class="p-wt num-input" placeholder="0" value="${d.wt ?? 0}"></td>
    <td class="p-active-mass">0.000</td>
    <td class="p-solv-mass">0.000</td>
    <td><input type="text" inputmode="decimal" min="0" class="p-price num-input" placeholder="0" value="${d.price ?? 0}"></td>
    <td class="p-cost">0.00</td>
     
    <td><input type="text" inputmode="decimal" min="0" class="p-dil num-input" placeholder="100" value="${dil}"></td>
    <td>
      <select class="p-solv">
        <option ${solv === 'Ethanol' ? 'selected' : ''}>Ethanol</option>
        <option ${solv === 'DPG' ? 'selected' : ''}>DPG</option>
        <option ${solv === 'IPM' ? 'selected' : ''}>IPM</option>
        <option ${solv === 'TEC' ? 'selected' : ''}>TEC</option>
        <option ${solv === 'None' ? 'selected' : ''}>None</option>
      </select>
    </td>
    <td class="p-active-pct">0.00 %</td>

    <td><select class="p-note">
        <option ${d.note === 'N/A' ? 'selected' : ''}>N/A</option>
        <option ${d.note === 'Top' ? 'selected' : ''}>Top</option>
        <option ${d.note === 'Middle' ? 'selected' : ''}>Middle</option>
        <option ${d.note === 'Base' ? 'selected' : ''}>Base</option>
    </select></td>
    <td><input type="text" class="p-supplier" value="${d.supplier ?? ''}"></td>
    <td><input type="text" class="p-cas" value="${d.cas ?? ''}" placeholder="123-45-6"></td>
    <td><textarea class="p-notes">${d.notes ?? ''}</textarea></td>
    <td class="p-del">❌</td>`;

  if ($$('#proBody')) $$('#proBody').appendChild(tr);
}
function p_rows() { return Array.from($$$('#proBody tr')); }

function p_calc() {
  const rows = p_rows();
  let totalWt = 0, totalVol = 0, totalCost = 0;
  let totalActiveWt = 0;

  rows.forEach(tr => {
    totalWt += parseNum(tr.querySelector('.p-wt').value);
  });

  rows.forEach(tr => {
    const vol = parseNum(tr.querySelector('.p-vol').value);
    const den = parseNum(tr.querySelector('.p-den').value);
    const wt = parseNum(tr.querySelector('.p-wt').value);
    const price = parseNum(tr.querySelector('.p-price').value);
    const dilution = parseNum(tr.querySelector('.p-dil').value);

    const cost = (wt / 10) * price;
    if (tr.querySelector('.p-cost')) tr.querySelector('.p-cost').textContent = cost.toFixed(2);

    const activeWt = wt * (dilution / 100);
    const solvWt = wt - activeWt;
    const activePct = totalWt > 0 ? (activeWt / totalWt * 100) : 0;

    if (tr.querySelector('.p-active-mass')) tr.querySelector('.p-active-mass').textContent = activeWt.toFixed(3);
    if (tr.querySelector('.p-solv-mass')) tr.querySelector('.p-solv-mass').textContent = solvWt.toFixed(3);

    if (tr.querySelector('.p-active-pct')) tr.querySelector('.p-active-pct').textContent = activePct.toFixed(3) + ' %';
    tr.dataset.activePct = activePct;

    totalVol += vol;
    totalCost += cost;
    totalActiveWt += activeWt;
  });

  if ($$('#proTotalVol')) $$('#proTotalVol').textContent = totalVol.toFixed(2);
  if ($$('#proTotalWt')) $$('#proTotalWt').textContent = totalWt.toFixed(2);
  if ($$('#proTotalCost')) $$('#proTotalCost').textContent = totalCost.toFixed(2);
  if ($$('#proTotalPct')) $$('#proTotalPct').textContent = totalWt > 0
    ? ((totalActiveWt / totalWt) * 100).toFixed(2) + '% (Active)'
    : '0.00 %';

  const hc = $$('#helperCost'), hw = $$('#helperWeight'), hr = $$('#helperResult');
  if (hc && hw && hr) {
    hc.value = totalCost.toFixed(2);
    hw.value = totalWt.toFixed(2);
    hr.textContent = totalWt > 0 ? `€${(totalCost / totalWt * 10).toFixed(2)} per 10g` : '€0.00 per 10g';
  }

  const noteW = { Top: 0, Middle: 0, Base: 0, 'N/A': 0 };
  rows.forEach(tr => {
    const w = parseNum(tr.querySelector('.p-wt').value);
    const noteEl = tr.querySelector('.p-note');
    if (noteEl) {
      const note = noteEl.value;
      if (noteW[note] != null) noteW[note] += w;
    }
  });
  let txt = []; for (const k in noteW) { const pct = totalWt > 0 ? (noteW[k] / totalWt * 100).toFixed(1) : '0.0'; txt.push(`${k}: ${pct}%`); }
  if ($$('#noteSummaryText')) $$('#noteSummaryText').textContent = txt.join(' | ');

  p_ifra();
}

function p_ifra() {
  if (!$$('#ifraCategory')) return;
  const cat = $$('#ifraCategory').value; const rows = p_rows(); const bad = [];
  const warn = [];

  rows.forEach(tr => {
    const nameEl = tr.querySelector('.p-name');
    const name = nameEl ? nameEl.value.trim() : '';
    // FIXED: Now we grab the manual CAS input
    const casInput = tr.querySelector('.p-cas');
    const manualCas = casInput ? casInput.value.trim() : null;

    const activePct = parseFloat(tr.dataset.activePct) || 0;

    // PASS manualCas to resolve function
    const r = resolveIFRA({ name, manualCas, category: cat, finishedPct: activePct });

    if (r.status === 'eu-ban') {
      bad.push({ name: name || manualCas, msg: 'EU PROHIBITED' });
    } else if (r.limit != null) {
      if (activePct > r.limit) {
        bad.push({ name: name || manualCas, msg: `${activePct.toFixed(3)}% > ${r.limit}%` });
      } else if (r.limit > 0 && (activePct / r.limit) > 0.8) {
        warn.push({ name: name || manualCas, msg: `${activePct.toFixed(3)}% (~${Math.round(activePct / r.limit * 100)}% of limit)` });
      }
    }
  });

  const st = $$('#ifraStatusText'), wrap = $$('#ifraStatus');
  if (!st || !wrap) return;

  wrap.classList.remove('non-compliant-card');
  wrap.style.borderColor = '';
  wrap.style.backgroundColor = '';
  wrap.style.color = '';

  if (bad.length) {
    wrap.style.borderColor = '#ebccd1';
    wrap.style.backgroundColor = '#f8d7da';
    wrap.style.color = '#721c24';
    st.innerHTML = `<strong>❌ Not compliant for Cat ${cat}</strong><ul>` + bad.map(o => `<li><b>${o.name}</b> — ${o.msg}</li>`).join('') + `</ul>`;
  } else if (warn.length) {
    wrap.style.borderColor = '#faebcc';
    wrap.style.backgroundColor = '#fff3cd';
    wrap.style.color = '#856404';
    st.innerHTML = `<strong>⚠️ Caution: Near IFRA Limits (Cat ${cat})</strong><ul>` + warn.map(o => `<li><b>${o.name}</b> — ${o.msg}</li>`).join('') + `</ul>`;
  } else {
    wrap.style.borderColor = '#c3e6cb';
    wrap.style.backgroundColor = '#d4edda';
    wrap.style.color = '#155724';
    st.innerHTML = `<strong>✅ Compliant for Cat ${cat}</strong>`;
  }
}

function p_bind() {
  if ($$('#proAdd')) $$('#proAdd').onclick = () => { p_row(); p_calc(); };
  if ($$('#proBody')) $$('#proBody').addEventListener('input', e => {
    const tr = e.target.closest('tr'); if (!tr) return;

    if (e.target.classList.contains('p-name')) {
      const val = e.target.value.trim().toLowerCase();
      const sel = S.ingMap.get(val);
      if (sel) {
        if (tr.querySelector('.p-cas')) tr.querySelector('.p-cas').value = sel.casNumber || '';
        if (tr.querySelector('.p-price')) tr.querySelector('.p-price').value = sel.pricePer10g || 0;
        if (tr.querySelector('.p-notes')) tr.querySelector('.p-notes').value = sel.notes || '';
        if (tr.querySelector('.p-den')) tr.querySelector('.p-den').value = sel.density || 0.85;
        if (tr.querySelector('.p-note')) tr.querySelector('.p-note').value = sel.note || 'N/A';
      }
    }

    if (e.target.classList.contains('p-vol') || e.target.classList.contains('p-den')) {
      const v = parseNum(tr.querySelector('.p-vol').value);
      const d = parseNum(tr.querySelector('.p-den').value);
      tr.querySelector('.p-wt').value = (v * d).toFixed(3);
    }
    else if (e.target.classList.contains('p-wt')) {
      const d = parseNum(tr.querySelector('.p-den').value);
      if (d > 0) { tr.querySelector('.p-vol').value = (parseNum(tr.querySelector('.p-wt').value) / d).toFixed(3); }
    }
    p_calc();
  });
  if ($$('#proBody')) $$('#proBody').addEventListener('change', p_calc);
  if ($$('#proBody')) $$('#proBody').addEventListener('click', e => { if (e.target.classList.contains('p-del')) { e.target.closest('tr').remove(); p_calc(); } });
  if ($$('#ifraCategory')) $$('#ifraCategory').onchange = p_ifra;

  if ($$('#proSave')) $$('#proSave').onclick = () => {
    const n = prompt('Recipe name?'); if (!n) return;
    const rows = p_rows().map(tr => ({
      name: tr.querySelector('.p-name').value || '',
      vol: parseNum(tr.querySelector('.p-vol').value),
      den: parseNum(tr.querySelector('.p-den').value),
      wt: parseNum(tr.querySelector('.p-wt').value),
      price: parseNum(tr.querySelector('.p-price').value),
      dilution: parseNum(tr.querySelector('.p-dil').value),
      solvent: tr.querySelector('.p-solv').value || 'Ethanol',

      note: tr.querySelector('.p-note').value || 'N/A',
      supplier: tr.querySelector('.p-supplier').value || '',
      cas: tr.querySelector('.p-cas').value || '',
      notes: tr.querySelector('.p-notes').value || ''
    }));
    const all = JSON.parse(localStorage.getItem('pc_pro_recipes_v1') || '{}'); all[n] = { cat: $$('#ifraCategory').value, rows }; localStorage.setItem('pc_pro_recipes_v1', JSON.stringify(all)); p_pop(n);
    showToast(`Recipe "${n}" Saved`);
  };

  if ($$('#proLoad')) $$('#proLoad').onclick = () => {
    const n = $$('#proSaved').value; const all = JSON.parse(localStorage.getItem('pc_pro_recipes_v1') || '{}'); const rec = all[n]; if (!rec) return alert('Not found'); $$('#proBody').innerHTML = ''; (rec.rows || []).forEach(r => p_row(r)); p_calc();
    showToast(`Recipe "${n}" Loaded`);
  };

  if ($$('#proDelete')) $$('#proDelete').onclick = () => {
    const n = $$('#proSaved').value;
    const all = JSON.parse(localStorage.getItem('pc_pro_recipes_v1') || '{}');
    if (!n || !all[n]) return;
    if (!n || !all[n]) return;
    if (!confirm('Are you sure you want to delete the recipe "' + n + '"?')) return;
    delete all[n];
    localStorage.setItem('pc_pro_recipes_v1', JSON.stringify(all));
    p_pop();
    $$('#proBody').innerHTML = ''; p_row(); p_calc();
    showToast('Recipe Deleted');
  };

  if ($$('#proNew')) $$('#proNew').onclick = () => { $$('#proBody').innerHTML = ''; p_row(); p_calc(); };
  if ($$('#proPrint')) $$('#proPrint').onclick = () => window.print();
  if ($$('#proExport')) $$('#proExport').onclick = () => {
    const rows = p_rows().map(tr => ({
      name: tr.querySelector('.p-name').value || '',
      vol: parseNum(tr.querySelector('.p-vol').value),
      den: parseNum(tr.querySelector('.p-den').value),
      wt: parseNum(tr.querySelector('.p-wt').value),
      price: parseNum(tr.querySelector('.p-price').value),
      dilution: parseNum(tr.querySelector('.p-dil').value),
      solvent: tr.querySelector('.p-solv').value || 'Ethanol',
      activePct: parseFloat(tr.dataset.activePct) || 0,
      note: tr.querySelector('.p-note').value || 'N/A',
      supplier: tr.querySelector('.p-supplier').value || '',
      cas: tr.querySelector('.p-cas').value || '',
      notes: (tr.querySelector('.p-notes').value || '').replace(/\n/g, ' ')
    }));
    const lines = [['Ingredient', 'Volume (ml)', 'Density (g/ml)', 'Weight (g)', 'Price/10g (€)', 'Cost (€)', 'Dilution %', 'Solvent', 'Active %', 'IFRA 4', 'IFRA 5A', 'IFRA 5B', 'IFRA 9', 'Note', 'Supplier', 'CAS', 'Notes'].join(',')];
    rows.forEach(r => {
      const cost = (r.wt / 10) * (r.price || 0);
      const cats = ['4', '5A', '5B', '9'].map(cat => {
        const z = resolveIFRA({ name: r.name, manualCas: r.cas, category: cat, finishedPct: r.activePct });
        if (z.status === 'eu-ban') return 'EU PROHIBITED';
        return z.limit != null ? `≤ ${z.limit}%` : 'n/a';
      });
      lines.push([
        `"${r.name.replace(/"/g, '""')}"`,
        r.vol, r.den, r.wt,
        (r.price || 0).toFixed(2), cost.toFixed(2),
        r.dilution, r.solvent, r.activePct.toFixed(3),
        ...cats,
        r.note, r.supplier, r.cas, `"${r.notes.replace(/"/g, '""')}"`
      ].join(','));
    });
    downloadCSV('pro.csv', lines.join('\n'));
    showToast('Pro CSV Exported');
  };

  function p_pop(sel = '') {
    const s = $$('#proSaved'); if (!s) return;
    const all = JSON.parse(localStorage.getItem('pc_pro_recipes_v1') || '{}');
    s.innerHTML = '';
    Object.keys(all).sort().forEach(k => {
      const o = document.createElement('option'); o.value = k; o.textContent = k;
      if (k === sel) o.selected = true;
      s.appendChild(o);
    });
    if (sel && !all[sel]) s.value = '';
  }
  p_pop();
}

async function loadData() {
  try {
    const [ings, ifra, ver, ifra51, syn, reg] = await Promise.all([
      fetchJSON('data/ingredients.json'),
      fetchJSON('data/ifra.json'),
      fetchJSON('version.json'),
      fetchJSON('data/ifra-51.json'),
      fetchJSON('data/synonyms.json'),
      fetchJSON('data/regulatory.json'),
    ]);
    S.dbList = Array.isArray(ings) ? ings : [];
    if (!Array.isArray(ings)) {
      console.error("Ingredients data is not an array:", ings);
      alert("Error: Ingredients data failed to load properly. Check console.");
    }
    S.customList = JSON.parse(localStorage.getItem('pc_custom_ingredients') || '[]');
    S.list = [...S.dbList, ...S.customList];
    S.ifraFallback = ifra || {}; S.version = ver?.data || null; S.ifra51 = ifra51 || {}; S.syn = syn || {}; S.reg = reg || {};
    S.ingMap = new Map();
    (S.list || []).forEach(o => { if (o.name) S.ingMap.set(o.name.toLowerCase(), o); });
    const dl = $$('#ingredientList'); if (dl) { dl.innerHTML = ''; (S.list || []).forEach(o => { const opt = document.createElement('option'); opt.value = o.name; dl.appendChild(opt); }); }
    buildACList();
    const countInfo = S.customList.length > 0 ? ` (+${S.customList.length} custom)` : '';
    if ($$('#dataStatus')) $$('#dataStatus').textContent = `Data loaded: ${S.dbList.length}${countInfo} items`;
    if ($$('#clearCustomData') && S.customList.length > 0) $$('#clearCustomData').hidden = false;
    const prev = localStorage.getItem('pc_data_version'); if (S.version && prev && prev !== S.version) showUpdate(); if (S.version) localStorage.setItem('pc_data_version', S.version);
  } catch (e) { console.error("LoadData Error", e); if ($$('#dataStatus')) $$('#dataStatus').textContent = 'Failed to load data. Check console.'; }
}

function bindGlobal() {
  if ($$('#modeSimple')) $$('#modeSimple').onclick = () => setMode('simple');
  if ($$('#modePro')) $$('#modePro').onclick = () => setMode('pro');
  setupImporter();
}

function init() {
  try {
    setMode(localStorage.getItem('pc_mode') || 'simple');
    setupTheme();
    setupInputConstraints(); // FIX: Prevent negative inputs
    setupRefresh();
    bindGlobal();
    s_row(); s_bind();
    p_row(); p_bind();
    loadData();
    applyEntitlements(); // Apply locks and gates last
  } catch (e) {
    console.error("CRITICAL INIT ERROR:", e);
    alert("App failed to initialize. Please clear cache and refresh.");
  }
}
document.addEventListener('DOMContentLoaded', init);
