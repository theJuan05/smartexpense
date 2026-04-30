// app.js — Main app with tabs + charts

document.addEventListener('DOMContentLoaded', async () => {
  // Safety net: always dismiss skeleton after 6s even if something errors
  const _skel = document.getElementById('page-skeleton');
  if (_skel) setTimeout(() => _skel.classList.add('sk-hidden'), 6000);

  // 1. Show online status IMMEDIATELY (no waiting)
  updateOnlineStatus();

  try {
    // 2. Initialize DB
    await initDB();

    // 3. Set today's date in form
    const dateEl = document.getElementById('exp-date');
    if (dateEl) dateEl.value = today();

    // 4. Setup tabs
    setupTabs();

    // 5. Load UI data in parallel (faster)
    await Promise.all([
      loadExpenseList(),
      refreshStats()
    ]);
    await renderBalance();
    setupIncomeModal();
  } finally {
    // 6. Always dismiss skeleton — even if something above threw
    const skel = document.getElementById('page-skeleton');
    if (skel) skel.classList.add('sk-hidden');
  }

  // 7. Charts in background (non-blocking)
  renderAllCharts();
  setupChartPillToggle();

  // 7. Online/offline listeners
  window.addEventListener('online', async () => {
    updateOnlineStatus();
    showToast('Back online! Syncing...');
    await runSync();
  });
  window.addEventListener('offline', () => {
    updateOnlineStatus();
    showToast('You are offline - data saved locally', 'warning');
  });

  // 8. Backend check runs in background — doesn't block UI
  checkBackendConnection();

  // 9. Button events
  document.getElementById('btn-add-expense')
    .addEventListener('click', handleAddExpense);

  document.getElementById('btn-sync')
    .addEventListener('click', async () => {
      showToast('Syncing...');
      await runSync();
    });

  const addBudgetBtn = document.getElementById('btn-add-budget');
  if (addBudgetBtn) {
    addBudgetBtn.addEventListener('click', handleAddBudget);
  }

  const searchEl = document.getElementById('search-expenses');
  if (searchEl) {
    searchEl.addEventListener('input', handleSearch);
  }

  const titleInput = document.getElementById('exp-title');
  if (titleInput) {
    titleInput.addEventListener('input', handleTitleInput);
  }

  // Register service worker and init PWA
  registerServiceWorker();
  initPWA();
});

// ── Tab System ─────────────────────────────────────────────
function setupTabs() {
  const buttons  = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.tab;

      buttons.forEach(b  => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      // Wait for DOM to update before loading data
      await new Promise(resolve => setTimeout(resolve, 50));

      if (target === 'dashboard') await renderAllCharts();
      if (target === 'budget')    await loadBudgetSummary();
      if (target === 'advice')    await loadAdvice();
      if (target === 'insights') {
        await loadPrediction();
        await loadAnomalies();
      }
    });
  });
}

// ── Add Expense ────────────────────────────────────────────
async function handleAddExpense() {
  const title    = document.getElementById('exp-title').value.trim();
  const amount   = parseFloat(document.getElementById('exp-amount').value);
  const category = document.getElementById('exp-category').value;
  const date     = document.getElementById('exp-date').value;
  const payment  = document.getElementById('exp-payment').value;
  const notes    = document.getElementById('exp-notes').value.trim();

  if (!title)                 { showToast('Please enter a title',    'warning'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount',    'warning'); return; }
  if (!date)                  { showToast('Please select a date',    'warning'); return; }

  const expense = { title, amount, category,
                    expense_date: date, payment_method: payment, notes };

  // Check for anomaly before saving
  await checkExpenseAnomaly(title, amount, category);
  await addExpenseLocal(expense);
  showToast('Expense saved!');
  clearForm();

  await loadExpenseList();
  await refreshStats();
  await renderAllCharts();

  if (navigator.onLine) await runSync();

  // Check if any budget is exceeded
  await checkBudgetAlerts();

  // Switch to expenses tab to show new entry
  document.querySelector('[data-tab="expenses"]').click();
}

// ── Expense List ───────────────────────────────────────────
async function loadExpenseList(filter = '') {
  const listEl  = document.getElementById('expense-list');
  const countEl = document.getElementById('expense-count-badge');
  if (!listEl) return;

  let expenses = await getAllExpensesLocal();

  // Apply search filter
  if (filter) {
    const q = filter.toLowerCase();
    expenses = expenses.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q)
    );
  }

  if (countEl) countEl.textContent = `(${expenses.length})`;

  const emptyStateEl = document.getElementById('dashboard-empty');

  if (expenses.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>${filter ? 'No results found.' : 'No expenses yet.'}</p>
      </div>`;
    if (emptyStateEl && !filter) emptyStateEl.style.display = 'block';
    return;
  }

  if (emptyStateEl) emptyStateEl.style.display = 'none';
  listEl.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'expense-list';
  expenses.forEach(exp => container.appendChild(createExpenseItem(exp)));
  listEl.appendChild(container);
}

// ── Expose renderExpenses so edit-expense.js can call it ───
async function renderExpenses() {
  await loadExpenseList();
  await refreshStats();
  await renderAllCharts();
}

// ── Search ─────────────────────────────────────────────────
async function handleSearch(e) {
  await loadExpenseList(e.target.value);
}

// ── Expense Item ───────────────────────────────────────────
function createExpenseItem(exp) {
  const div = document.createElement('div');
  div.className = 'expense-item';

  const icon    = getCategoryIcon(exp.category);
  const synced  = exp.synced == 1;
  const dateStr = exp.expense_date
    ? new Date(exp.expense_date + 'T00:00:00')
        .toLocaleDateString('en-PH',
          { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  div.innerHTML = `
    <div class="expense-icon">${icon}</div>
    <div class="expense-info">
      <div class="expense-title">${escapeHtml(exp.title)}</div>
      <div class="expense-meta">
        ${exp.category || 'Uncategorized'} &bull; ${dateStr}
      </div>
    </div>
    <div class="expense-right">
      <div class="expense-amount">-₱${Number(exp.amount).toLocaleString()}</div>
      ${!synced ? '<span class="expense-sync-badge">Pending</span>' : ''}
      <div class="expense-actions">
        <button class="expense-edit-btn" data-id="${exp.local_id}"
                title="Edit">✏️</button>
        <button class="expense-delete-btn" data-id="${exp.local_id}"
                title="Delete">🗑️</button>
      </div>
    </div>
  `;

  // Edit button — uses edit-expense.js
  div.querySelector('.expense-edit-btn')
    .addEventListener('click', (e) => {
      e.stopPropagation();
      openEditExpenseModal(exp.local_id);
    });

  // Delete button — uses edit-expense.js confirm modal
  div.querySelector('.expense-delete-btn')
    .addEventListener('click', (e) => {
      e.stopPropagation();
      deleteExpense(exp.local_id);
    });

  return div;
}

// ── Sync ───────────────────────────────────────────────────
async function runSync() {
  const result = await syncToServer();
  if (result.synced > 0) {
    showToast(`Synced ${result.synced} expense(s)`);
    await loadExpenseList();
  }
}

// ── Stats ──────────────────────────────────────────────────
async function refreshStats() {
  const stats = await getLocalStats();
  const el = id => document.getElementById(id);
  if (el('stat-month'))
    el('stat-month').textContent =
      `₱${Number(stats.thisMonth).toLocaleString()}`;
  if (el('stat-count'))
    el('stat-count').textContent = stats.count;
  await renderBalance();
}

// ── Balance Card ───────────────────────────────────────────
async function renderBalance() {
  const income = parseFloat(localStorage.getItem('se_income') || '0');
  const stats  = await getLocalStats();
  const totalExpenses = parseFloat(stats.total || 0);
  const balance = income - totalExpenses;

  const fmt = val => '₱' + Math.abs(val).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  const amountEl   = document.getElementById('balance-amount');
  const incomeEl   = document.getElementById('balance-income');
  const expensesEl = document.getElementById('balance-expenses');

  if (amountEl) {
    amountEl.textContent = (balance < 0 ? '-' : '') + fmt(balance);
    amountEl.classList.toggle('negative', balance < 0);
  }
  if (incomeEl)   incomeEl.textContent   = fmt(income);
  if (expensesEl) expensesEl.textContent = fmt(totalExpenses);

  const encourageEl = document.getElementById('balance-encourage');
  if (encourageEl) {
    if (balance < 0) {
      const over = fmt(Math.abs(balance));
      encourageEl.innerHTML = `You're ${over} over right now. <a onclick="document.querySelector('[data-tab=budget]').click()">Check your budgets</a> to see where to adjust.`;
      encourageEl.style.display = 'block';
    } else {
      encourageEl.style.display = 'none';
    }
  }
}

function setupIncomeModal() {
  const btnSet    = document.getElementById('btn-set-income');
  const modal     = document.getElementById('modal-set-income');
  const btnClose  = document.getElementById('btn-close-income-modal');
  const btnCancel = document.getElementById('btn-cancel-income');
  const btnSave   = document.getElementById('btn-save-income');
  const input     = document.getElementById('income-input');

  if (!btnSet || !modal) return;

  const open  = () => { input.value = localStorage.getItem('se_income') || ''; modal.classList.add('active'); input.focus(); };
  const close = () => modal.classList.remove('active');

  btnSet.addEventListener('click', open);
  if (btnClose)  btnClose.addEventListener('click',  close);
  if (btnCancel) btnCancel.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  btnSave.addEventListener('click', () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }
    localStorage.setItem('se_income', val.toString());
    close();
    renderBalance();
    showToast('Income updated!');
  });

  input.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });
}

// ── Backend ────────────────────────────────────────────────
async function checkBackendConnection() {
  const result = await API.ping();
  const el = document.getElementById('backend-status');
  if (result && result.status === 'ok') {
    if (el) el.textContent = 'connected';
    await runSync();
  }
}

// ── Online/Offline ─────────────────────────────────────────
function updateOnlineStatus() {
  const badge = document.getElementById('status-badge');
  if (!badge) return;
  badge.textContent = navigator.onLine ? 'Online' : 'Offline';
  badge.className   = 'status-badge ' +
    (navigator.onLine ? 'online' : 'offline');
}

// ── Service Worker ─────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg  => console.log('[SW] Registered, scope:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  }
}

// ── Helpers ────────────────────────────────────────────────
function clearForm() {
  ['exp-title','exp-amount','exp-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  clearAnomalyWarning();
  document.getElementById('exp-category').value = '';
  document.getElementById('exp-date').value     = today();
  document.getElementById('exp-payment').value  = 'cash';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getCategoryIcon(category) {
  const icons = {
    'Food & Dining'    : '🍔',
    'Transportation'   : '🚗',
    'Utilities & Bills': '💡',
    'Shopping'         : '🛍️',
    'Healthcare'       : '🏥',
    'Entertainment'    : '🎬',
    'Education'        : '📚',
    'Savings'          : '💰',
    'Housing & Rent'   : '🏠',
    'Others'           : '📦',
  };
  return icons[category] || '📦';
}

function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent   = message;
  toast.style.background =
    type === 'warning' ? 'var(--warning)' : '#2d3436';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── AI Auto-Categorization ─────────────────────────────────
let categorizeTimer = null;

async function handleTitleInput(e) {
  const title = e.target.value.trim();

  if (title.length < 3) {
    clearAISuggestion();
    return;
  }

  clearTimeout(categorizeTimer);
  categorizeTimer = setTimeout(async () => {
    const result = await API.categorize(title);

    if (result && result.status === 'success' &&
        result.category !== 'Others') {
      showAISuggestion(result.category, result.confidence);
    } else {
      clearAISuggestion();
    }
  }, 500);
}

function showAISuggestion(category, confidence) {
  let hint = document.getElementById('ai-category-hint');
  if (!hint) return;

  const pct = Math.round(confidence * 100);
  hint.innerHTML = `
    AI suggests: <strong>${category}</strong>
    (${pct}% confident)
    <button onclick="applyAISuggestion('${category}')"
            style="margin-left:8px;padding:2px 10px;
                   background:var(--primary);color:white;
                   border:none;border-radius:6px;
                   cursor:pointer;font-size:0.8rem;">
      Apply
    </button>
  `;
  hint.style.display = 'block';
}

function clearAISuggestion() {
  const hint = document.getElementById('ai-category-hint');
  if (hint) hint.style.display = 'none';
}

function applyAISuggestion(category) {
  const select = document.getElementById('exp-category');
  if (!select) return;

  for (const option of select.options) {
    if (option.value === category) {
      select.value = category;
      break;
    }
  }
  clearAISuggestion();
  showToast(`Category set to: ${category}`);
}