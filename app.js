/* Perfume Calculator App */
const $$ = sel => document.querySelector(sel);
const $$$ = sel => document.querySelectorAll(sel);

const state = {
  ingredientsList: [],
  ifraLimits: {},      // { Ingredient: { '4': number, '5A': number, '5B': number, '9': number } }
  dosage: 20,
  recipes: {},         // name -> { dosage, rows: [ {name, pct} ] }
  versionData: null,
  registration: null,
};

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

async function loadData() {
  try {
    const [ingredients, ifra, version] = await Promise.all([
      fetchJSON('data/ingredients.json'),
      fetchJSON('data/ifra.json'),
      fetchJSON('version.json'),
    ]);
    state.ingredientsList = ingredients;
    state.ifraLimits = ifra;
    state.versionData = version?.data || null;
    $$('#dataStatus').textContent = `Data loaded (version: ${state.versionData || 'n/a'})`;
    populateIngredientList();
    maybeShowUpdateBannerOnVersion();
  } catch (e) {
    console.error(e);
    $$('#dataStatus').textContent = 'Failed to load data. Check your JSON files.';
  }
}

function populateIngredientList() {
  const dl = $$('#ingredientList');
  dl.innerHTML = '';
  state.ingredientsList.forEach(obj => {
    const opt = document.createElement('option');
    opt.value = obj.name;
    dl.appendChild(opt);
  });
}

function addRow(rowData = { name: '', pct: 0 }) {
  const tbody = $$('#tableBody');
  const tr = document.createElement('tr');

  const idxTd = document.createElement('td');
  idxTd.className = 'row-index';
  tr.appendChild(idxTd);

  const nameTd = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.setAttribute('list', 'ingredientList');
  nameInput.value = rowData.name || '';
  nameInput.placeholder = 'Ingredient name';
  nameInput.addEventListener('input', updateAll);
  nameTd.appendChild(nameInput);
  tr.appendChild(nameTd);

  const pctTd = document.createElement('td');
  const pctInput = document.createElement('input');
  pctInput.type = 'number';
  pctInput.min = '0'; pctInput.max = '100'; pctInput.step = '0.01';
  pctInput.value = rowData.pct ?? 0;
  pctInput.addEventListener('input', updateAll);
  pctTd.appendChild(pctInput);
  tr.appendChild(pctTd);

  const finishedTd = document.createElement('td');
  finishedTd.className = 'finished';
  finishedTd.textContent = '0';
  tr.appendChild(finishedTd);

  const cats = ['4','5A','5B','9'];
  cats.forEach(cat => {
    const td = document.createElement('td');
    td.className = `ifra ifra-${cat}`;
    td.innerHTML = '<span class="status">—</span>';
    tr.appendChild(td);
  });

  const actionsTd = document.createElement('td');
  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';
  removeBtn.className = 'danger';
  removeBtn.addEventListener('click', () => { tr.remove(); updateAll(); });
  actionsTd.appendChild(removeBtn);
  tr.appendChild(actionsTd);

  tbody.appendChild(tr);
  renumberRows();
  updateAll();
}

function renumberRows() {
  $$$('#tableBody .row-index').forEach((td, i) => { td.textContent = i + 1; });
}

function getRows() {
  return Array.from($$$('#tableBody tr')).map(tr => {
    const [name, pct] = [
      tr.querySelector('input[list]')?.value?.trim() || '',
      parseFloat(tr.querySelector('input[type=number]')?.value || '0')
    ];
    return { tr, name, pct: isNaN(pct) ? 0 : pct };
  });
}

function computeFinishedPct(pctInConc, dosagePct) {
  return (pctInConc * dosagePct) / 100.0;
}

function statusBadge(val, limit) {
  // limit null/undefined => no limit; ok
  if (limit == null || isNaN(limit)) return `<span class="status ok">n/a</span>`;
  if (val <= limit) {
    const ratio = limit > 0 ? (val / limit) : 0;
    if (ratio > 0.8) return `<span class="status warn">${val.toFixed(3)} ≤ ${limit}%</span>`;
    return `<span class="status ok">${val.toFixed(3)} ≤ ${limit}%</span>`;
  }
  return `<span class="status fail">${val.toFixed(3)} > ${limit}%</span>`;
}

function updateAll() {
  state.dosage = parseFloat($$('#dosage').value || '0');
  const rows = getRows();

  let totalConc = 0;
  let totalFin = 0;

  rows.forEach(({ tr, name, pct }) => {
    totalConc += pct;
    const finished = computeFinishedPct(pct, state.dosage);
    totalFin += finished;
    tr.querySelector('.finished').textContent = finished.toFixed(3);

    const limits = state.ifraLimits[name] || {};
    ['4','5A','5B','9'].forEach(cat => {
      const limit = parseFloat(limits[cat]);
      tr.querySelector(`.ifra-${cat}`).innerHTML = statusBadge(finished, limit);
    });
  });

  $$('#totalConcentrate').textContent = totalConc.toFixed(3);
  $$('#totalFinished').textContent = totalFin.toFixed(3);
}

function saveRecipe() {
  const name = $$('#recipeName').value.trim();
  if (!name) { alert('Enter a recipe name'); return; }
  const rows = getRows().map(r => ({ name: r.name, pct: r.pct }));
  const payload = { dosage: state.dosage, rows };
  const all = loadAllRecipes();
  all[name] = payload;
  localStorage.setItem('pc_recipes_v1', JSON.stringify(all));
  populateSavedRecipes(name);
}

function loadAllRecipes() {
  try { return JSON.parse(localStorage.getItem('pc_recipes_v1')) || {}; } catch { return {}; }
}

function populateSavedRecipes(selectName = '') {
  const sel = $$('#savedRecipes');
  const all = loadAllRecipes();
  state.recipes = all;
  sel.innerHTML = '';
  const keys = Object.keys(all).sort();
  keys.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    if (k === selectName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function loadSelectedRecipe() {
  const sel = $$('#savedRecipes');
  const name = sel.value;
  if (!name) { alert('No recipe selected.'); return; }
  const rec = state.recipes[name];
  if (!rec) { alert('Recipe not found.'); return; }
  // Clear table
  $$('#tableBody').innerHTML = '';
  $$('#dosage').value = rec.dosage;
  (rec.rows || []).forEach(r => addRow(r));
  updateAll();
}

function deleteSelectedRecipe() {
  const sel = $$('#savedRecipes');
  const name = sel.value;
  if (!name) { alert('No recipe selected.'); return; }
  const all = loadAllRecipes();
  if (!(name in all)) return;
  if (!confirm(`Delete recipe "${name}"?`)) return;
  delete all[name];
  localStorage.setItem('pc_recipes_v1', JSON.stringify(all));
  populateSavedRecipes();
}

function exportCSV() {
  const rows = getRows();
  const headers = ['#','Ingredient','% in concentrate','Dosage %','Finished %','IFRA 4','IFRA 5A','IFRA 5B','IFRA 9'];
  const lines = [headers.join(',')];
  rows.forEach((r, i) => {
    const finished = computeFinishedPct(r.pct, state.dosage);
    const limits = state.ifraLimits[r.name] || {};
    const cats = ['4','5A','5B','9'];
    const statuses = cats.map(cat => {
      const limit = parseFloat(limits[cat]);
      if (limit == null || isNaN(limit)) return 'n/a';
      return finished <= limit ? 'OK' : 'FAIL';
    });
    lines.push([i+1, `"${r.name.replace(/"/g,'""')}"`, r.pct, state.dosage, finished.toFixed(4), ...statuses].join(','));
  });
  const blob = new Blob([lines.join('\n')], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'perfume-recipe.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  if (!confirm('Clear all rows?')) return;
  $$('#tableBody').innerHTML = '';
  addRow();
  updateAll();
}

function setupTheme() {
  const saved = localStorage.getItem('pc_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  syncThemeMeta();
  $$('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pc_theme', next);
    syncThemeMeta();
  });
}
function syncThemeMeta() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const meta = document.getElementById('theme-color-meta');
  meta.setAttribute('content', theme === 'dark' ? '#0e0f13' : '#ffffff');
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        state.registration = reg;

        // If there's an updated SW waiting, show banner
        function showIfWaiting() {
          if (reg.waiting) { showUpdateBanner(); }
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          }
        });
        showIfWaiting();

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        });
      } catch (e) {
        console.warn('SW registration failed', e);
      }
    });
  }
}

function showUpdateBanner() {
  const banner = $$('#updateBanner');
  banner.hidden = false;
}

function maybeShowUpdateBannerOnVersion() {
  const current = state.versionData || null;
  const stored = localStorage.getItem('pc_data_version');
  if (stored && current && stored !== current) {
    showUpdateBanner();
  }
  if (current) {
    localStorage.setItem('pc_data_version', current);
  }
}

// Refresh button action
function setupUpdateRefresh() {
  $$('#refreshBtn').addEventListener('click', async () => {
    if (state.registration?.waiting) {
      state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Force network reload for data files
      await Promise.all([
        fetch('version.json', { cache: 'reload' }),
        fetch('data/ingredients.json', { cache: 'reload' }),
        fetch('data/ifra.json', { cache: 'reload' }),
      ]);
      window.location.reload();
    }
  });
}

// Install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $$('#installBtn');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    btn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
});

// Event bindings
function bindUI() {
  $$('#addRow').addEventListener('click', () => addRow());
  $$('#saveRecipe').addEventListener('click', saveRecipe);
  $$('#loadRecipe').addEventListener('click', loadSelectedRecipe);
  $$('#deleteRecipe').addEventListener('click', deleteSelectedRecipe);
  $$('#exportCsv').addEventListener('click', exportCSV);
  $$('#printBtn').addEventListener('click', () => window.print());
  $$('#clearAll').addEventListener('click', clearAll);
  $$('#dosage').addEventListener('input', updateAll);
}

function init() {
  setupTheme();
  bindUI();
  setupUpdateRefresh();
  populateSavedRecipes();
  addRow();
  loadData();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
