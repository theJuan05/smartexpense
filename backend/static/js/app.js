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

    // 3. Pull server expenses into IndexedDB (fills dashboard on first load / new device)
    await pullExpensesFromServer();

    // 4. Set today's date in form
    const dateEl = document.getElementById('exp-date');
    if (dateEl) dateEl.value = today();

    // 5. Setup tabs
    setupTabs();
    setPageTitle('dashboard');

    // 6. Load UI data in parallel (faster)
    await Promise.all([
      loadExpenseList(),
      refreshStats(),
      renderRecentTransactions()
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

  // Ask for notification permission once, after a short delay
  setTimeout(requestNotificationPermission, 3000);
});

// ── Tab System ─────────────────────────────────────────────
const TAB_TITLES = {
  dashboard: 'Dashboard',
  expenses:  'Expenses',
  add:       'Add Expense',
  budget:    'Budget',
  insights:  'Insights',
  advice:    'Advice',
  profile:   'Settings',
};

function setPageTitle(tab) {
  const label = TAB_TITLES[tab] || tab;
  document.title = `${label} | SmartExpense`;
}

function setupTabs() {
  const buttons  = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.tab;

      buttons.forEach(b  => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Mark ALL nav buttons pointing to the same tab (sidebar + top bar)
      buttons.forEach(b => { if (b.dataset.tab === target) b.classList.add('active'); });
      document.getElementById(`tab-${target}`).classList.add('active');

      setPageTitle(target);

      // Wait for DOM to update before loading data
      await new Promise(resolve => setTimeout(resolve, 50));

      if (target === 'dashboard') await renderAllCharts();
      if (target === 'budget')    await loadBudgetSummary();
      if (target === 'advice')    await loadAdvice();
      if (target === 'insights') {
        await Promise.all([loadPrediction(), loadAnomalies()]);
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
  renderRecentTransactions();

  if (navigator.onLine) {
    await runSync();
    // Server-side FCM push for budget thresholds (works even when app later closes)
    fetch('/api/budgets/notify', { method: 'POST' }).catch(() => {});
  }

  // In-app toast + local SW notification (immediate feedback while app is open)
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
    listEl.innerHTML = filter
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>No results found.</p></div>`
      : `<div class="empty-state">
           <div class="empty-icon">📭</div>
           <p style="font-weight:600;margin-bottom:6px;">No expenses yet.</p>
           <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px;">
             Start tracking to see insights, budget alerts, and predictions.
           </p>
           <button class="btn btn-primary" style="font-size:0.85rem;padding:8px 20px;"
                   onclick="document.querySelector('[data-tab=add]').click()">
             Add your first expense
           </button>
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
  renderRecentTransactions();
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

  // Update label to show which month
  const monthLabel = el('stat-month-label');
  if (monthLabel) {
    monthLabel.textContent = new Date().toLocaleDateString('en-PH', { month: 'long' }) + ' Spending';
  }

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
      encourageEl.innerHTML = `You're ${over} over right now. <button class="balance-encourage-btn">Check your budgets</button> to see where to adjust.`;
      encourageEl.querySelector('.balance-encourage-btn')
        .addEventListener('click', () => document.querySelector('[data-tab="budget"]').click());
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

  const open  = () => { input.value = localStorage.getItem('se_income') || ''; openModal(modal, btnSet); };
  const close = () => closeModal(modal);

  btnSet.addEventListener('click', open);
  if (btnClose)  btnClose.addEventListener('click',  close);
  if (btnCancel) btnCancel.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  btnSave.addEventListener('click', async () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid amount', 'warning');
      return;
    }
    localStorage.setItem('se_income', val.toString());
    close();
    renderBalance();
    showToast('Income updated!');
    // Sync to DB so Advice savings-rate analysis works
    fetch('/api/user/income', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ monthly_income: val }),
    }).catch(() => {});
  });

  input.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });
}

// ── Backend ────────────────────────────────────────────────
async function checkBackendConnection() {
  const result = await API.ping();
  const el = document.getElementById('backend-status');
  if (result && result.status === 'ok') {
    if (el) el.textContent = 'connected';
    // Push any local-only expenses to server
    await runSync();
    // Pull any server expenses not yet in local DB, then refresh UI
    const pulled = await pullExpensesFromServer();
    if (pulled > 0) {
      await loadExpenseList();
      await refreshStats();
    }
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

// ── Push Notifications ─────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  if (localStorage.getItem('se-notif-asked')) return;
  localStorage.setItem('se-notif-asked', '1');
  await Notification.requestPermission();
}

async function showPushNotification(title, body, tag) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    // .ready waits for the active controlling SW — more reliable than getRegistration()
    const reg = await navigator.serviceWorker.ready;
    if (!reg) return;
    reg.showNotification(title, {
      body,
      icon:      '/static/icons/logo-icon.svg',
      badge:     '/static/icons/logo-icon.svg',
      tag:       tag || 'smartexpense',
      renotify:  true,
    });
  } catch (_) {}
}

// ── Modal focus management ─────────────────────────────────
const _FOCUSABLE = [
  'button:not([disabled])', '[href]', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function openModal(modal, triggerEl) {
  if (typeof modal === 'string') modal = document.getElementById(modal);
  if (!modal) return;
  modal._triggerEl = triggerEl || document.activeElement;
  modal.classList.add('active');

  requestAnimationFrame(() => {
    const first = modal.querySelector(_FOCUSABLE);
    if (first) first.focus();
  });

  function onKeyDown(e) {
    if (!modal.classList.contains('active')) return;
    if (e.key === 'Escape') { closeModal(modal); return; }
    if (e.key === 'Tab') {
      const els = Array.from(modal.querySelectorAll(_FOCUSABLE));
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }
  if (modal._keyHandler) document.removeEventListener('keydown', modal._keyHandler);
  modal._keyHandler = onKeyDown;
  document.addEventListener('keydown', onKeyDown);
}

function closeModal(modal, triggerEl) {
  if (typeof modal === 'string') modal = document.getElementById(modal);
  if (!modal) return;
  modal.classList.remove('active');
  if (modal._keyHandler) {
    document.removeEventListener('keydown', modal._keyHandler);
    delete modal._keyHandler;
  }
  const tr = triggerEl || modal._triggerEl;
  if (tr && typeof tr.focus === 'function') tr.focus();
  delete modal._triggerEl;
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

// ── Recent Transactions (dashboard aside) ──────────────────
async function renderRecentTransactions() {
  const container = document.getElementById('recent-tx-list');
  if (!container) return;

  const expenses = await getAllExpensesLocal();
  const recent   = expenses.slice(0, 8);

  if (recent.length === 0) {
    container.innerHTML =
      '<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:0.85rem;">No expenses yet.</div>';
    return;
  }

  container.innerHTML = '';
  recent.forEach(exp => {
    const icon    = getCategoryIcon(exp.category);
    const dateStr = exp.expense_date
      ? new Date(exp.expense_date + 'T00:00:00')
          .toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      : '';
    const item = document.createElement('div');
    item.className = 'recent-tx-item';
    item.innerHTML = `
      <span class="recent-tx-icon">${icon}</span>
      <div class="recent-tx-body">
        <div class="recent-tx-title">${escapeHtml(exp.title)}</div>
        <div class="recent-tx-meta">${exp.category || 'Uncategorized'} &bull; ${dateStr}</div>
      </div>
      <span class="recent-tx-amount">-&#8369;${Number(exp.amount).toLocaleString()}</span>
    `;
    container.appendChild(item);
  });
}

function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.type = type;
  toast.style.background = type === 'warning' ? 'var(--amber)' : '';
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
  const hint = document.getElementById('ai-category-hint');
  if (!hint) return;

  const pct = Math.round(confidence * 100);

  const strong = document.createElement('strong');
  strong.textContent = category;

  const btn = document.createElement('button');
  btn.className = 'ai-hint-apply';
  btn.textContent = 'Apply';
  btn.addEventListener('click', () => applyAISuggestion(category));

  hint.innerHTML = '';
  hint.append('AI suggests: ', strong, ` (${pct}% confident) `, btn);
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