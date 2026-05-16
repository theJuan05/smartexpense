// templates.js — Quick expense templates (fully offline, IndexedDB-backed)

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadTemplates() {
  const section = document.getElementById('templates-section');
  const row     = document.getElementById('templates-row');
  if (!section || !row) return;

  const templates = await getTemplatesLocal();

  if (templates.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  row.innerHTML = templates.map(t => `
    <div class="tpl-chip">
      <button class="tpl-chip-apply" onclick="applyTemplate(${t.id})" aria-label="Apply ${_esc(t.title)} template">
        <span class="tpl-chip-name">${_esc(t.title)}</span>
        <span class="tpl-chip-amt">₱${Number(t.amount).toLocaleString('en-PH')}</span>
      </button>
      <button class="tpl-chip-del" onclick="deleteTemplateUI(${t.id}, event)" aria-label="Remove ${_esc(t.title)} template">×</button>
    </div>
  `).join('');
}

async function applyTemplate(id) {
  const templates = await getTemplatesLocal();
  const t = templates.find(t => t.id === id);
  if (!t) return;

  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
  set('exp-title',    t.title);
  set('exp-amount',   t.amount);
  set('exp-category', t.category);
  set('exp-payment',  t.payment_method);
  set('exp-notes',    t.notes || '');

  showToast(`Template applied: ${t.title}`);
}

async function saveCurrentAsTemplate() {
  const title    = document.getElementById('exp-title')?.value.trim();
  const amount   = parseFloat(document.getElementById('exp-amount')?.value);
  const category = document.getElementById('exp-category')?.value;
  const payment  = document.getElementById('exp-payment')?.value;
  const notes    = document.getElementById('exp-notes')?.value.trim();

  if (!title)              { showToast('Enter a title first', 'warning');  return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount first', 'warning'); return; }

  await addTemplateLocal({ title, amount, category, payment_method: payment, notes });
  await loadTemplates();
  showToast('Template saved!');
}

async function deleteTemplateUI(id, event) {
  event.stopPropagation();
  await deleteTemplateLocal(id);
  await loadTemplates();
}

window.addEventListener('load', () => {
  loadTemplates();

  document.getElementById('btn-save-template')
    ?.addEventListener('click', saveCurrentAsTemplate);
});
