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

    // 3. Detect account switch — wipe local data if a different user logs in
    try {
      const authRes  = await fetch('/api/v1/auth/status');
      const authData = await authRes.json();
      if (authData.logged_in && authData.user_id) {
        const storedUid = await getSetting('current_user_id');
        if (storedUid !== null && storedUid !== authData.user_id) {
          await clearAllExpensesLocal();
          await saveSetting('last_sync', null);
          localStorage.removeItem('se_income');
        }
        await saveSetting('current_user_id', authData.user_id);

        // Always sync income from server — server is source of truth across devices
        if (authData.monthly_income) {
          localStorage.setItem('se_income', authData.monthly_income.toString());
        }
      }
    } catch (_) {}

    // 4. Pull server expenses into IndexedDB (fills dashboard on first load / new device)
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

  // Cache the app shell on every online load so offline always works
  if (navigator.onLine && 'caches' in window) {
    caches.keys().then(function(keys) {
      var swCache = keys.find(function(k) { return k.startsWith('smartexpense-'); });
      if (!swCache) return;
      fetch('/').then(function(resp) {
        if (resp && resp.ok) caches.open(swCache).then(function(c) { c.put('/', resp); });
      }).catch(function() {});
    });
  }

  // Ask for notification permission once, after a short delay
  setTimeout(requestNotificationPermission, 3000);

  // Notification bell
  setupNotificationBell();
  loadNotifications();
});

// ── Notification Bell ──────────────────────────────────────
function setupNotificationBell() {
  const btn   = document.getElementById('btn-notif-bell');
  const panel = document.getElementById('notif-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (!open) loadNotifications();
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('notif-bell-wrap')?.contains(e.target)) {
      panel.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

async function loadNotifications() {
  const list  = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  const btn   = document.getElementById('btn-notif-bell');
  if (!list || !badge) return;

  try {
    const res  = await fetch('/api/v1/budgets/summary');
    if (!res.ok) throw new Error();
    const data = (await res.json()).data || [];

    const alerts = data.filter(b => b.status === 'danger' || b.status === 'warning');

    if (alerts.length === 0) {
      badge.style.display = 'none';
      btn?.classList.remove('has-alerts');
      list.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icon">✅</div>
          All budgets on track
        </div>`;
      return;
    }

    badge.textContent    = alerts.length;
    badge.style.display  = 'flex';
    btn?.classList.add('has-alerts');

    list.innerHTML = alerts.map(b => {
      const isDanger = b.status === 'danger';
      return `
        <div class="notif-item">
          <div class="notif-dot notif-dot--${b.status}"></div>
          <div class="notif-item-body">
            <div class="notif-item-title">${isDanger ? 'Over budget' : 'Budget warning'}: ${_esc(b.category)}</div>
            <div class="notif-item-desc">₱${Number(b.spent).toLocaleString()} spent — ${b.percentage}% of ₱${Number(b.amount_limit).toLocaleString()} limit</div>
          </div>
        </div>`;
    }).join('');
  } catch (_) {
    list.innerHTML = '<div class="notif-loading">Could not load notifications</div>';
  }
}

// ── Tab System ─────────────────────────────────────────────
const TAB_TITLES = {
  dashboard: 'Dashboard',
  expenses:  'Expenses',
  add:       'Add Expense',
  budget:    'Budget',
  insights:  'Insights',
  advice:    'Advice',
  goals:     'Goals',
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
      buttons.forEach(b => {
        const match = b.dataset.tab === target;
        b.classList.toggle('active', match);
        if (b.closest('.sidebar-nav')) b.setAttribute('aria-current', match ? 'page' : '');
      });
      document.getElementById(`tab-${target}`).classList.add('active');

      // Sync aria-selected on tab-bar role="tab" buttons only
      document.querySelectorAll('[role="tab"]').forEach(b => {
        b.setAttribute('aria-selected', b.dataset.tab === target ? 'true' : 'false');
      });

      setPageTitle(target);

      // Wait for DOM to update before loading data
      await new Promise(resolve => setTimeout(resolve, 50));

      if (target === 'dashboard') { await renderAllCharts(); await renderHeatmap(); await renderGoalsSummary(); }
      if (target === 'expenses')  { await pullExpensesFromServer(); await loadExpenseList(); }
      if (target === 'budget')    await loadBudgetSummary();
      if (target === 'advice')    await loadAdvice();
      if (target === 'goals')     await loadGoals();
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

  // Save locally first — instant feedback, no waiting for network
  const localId = await addExpenseLocal(expense);

  const catLabel = category || 'Uncategorized';
  showToast(`₱${amount.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} · ${catLabel} saved!`);
  clearForm();

  await loadExpenseList();
  await refreshStats();
  await renderAllCharts();
  renderRecentTransactions();

  // Sync to server in background — doesn't block UI
  if (navigator.onLine) _syncNewExpense(localId, expense);

  // In-app toast + local SW notification (immediate feedback while app is open)
  await checkBudgetAlerts();

  // Switch to expenses tab to show new entry
  document.querySelector('[data-tab="expenses"]').click();
}

// Sends a newly-added local expense to the server in the background.
// On success, marks it synced so other devices can pull it immediately.
async function _syncNewExpense(localId, expense) {
  try {
    const result = await API.postExpense(expense);
    if (result && result.status === 'success') {
      await markExpenseSynced(localId, result.id);
      await loadExpenseList();  // refresh to remove Pending badge
    }
    fetch('/api/v1/budgets/notify', { method: 'POST' }).catch(() => {});
  } catch (_) {}
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

  const onboardingEl = document.getElementById('onboarding-overlay');

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
    if (onboardingEl && !filter && !sessionStorage.getItem('ob_skipped')) {
      showOnboarding();
    }
    return;
  }

  if (onboardingEl) onboardingEl.style.display = 'none';
  listEl.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'expense-list';
  expenses.forEach(exp => container.appendChild(createExpenseItem(exp)));
  listEl.appendChild(container);
}

// ── Onboarding wizard ──────────────────────────────────────
(function () {
  const TOTAL = 4; // slides 0-3
  let current = 0;

  const PROGRESS = ['', 'Step 1 of 2', 'Step 2 of 2', ''];
  const FILL     = [0, 33, 66, 100];

  function goTo(idx) {
    const slides = document.querySelectorAll('.ob-slide');
    if (!slides.length) return;

    const leaving = slides[current];
    leaving.classList.remove('ob-slide--active');
    leaving.classList.add('ob-slide--exit');

    setTimeout(() => {
      leaving.classList.remove('ob-slide--exit');
      current = idx;
      slides[current].classList.add('ob-slide--active');
      updateProgress();
    }, 200);
  }

  function updateProgress() {
    const fill  = document.getElementById('ob-progress-fill');
    const label = document.getElementById('ob-progress-label');
    if (fill)  fill.style.width  = FILL[current] + '%';
    if (label) label.textContent = PROGRESS[current];
  }

  function closeOnboarding() {
    const el = document.getElementById('onboarding-overlay');
    if (el) el.style.display = 'none';
    sessionStorage.setItem('ob_skipped', '1');
  }

  window.showOnboarding = function () {
    const el = document.getElementById('onboarding-overlay');
    if (!el) return;
    current = 0;

    // Activate first slide
    document.querySelectorAll('.ob-slide').forEach((s, i) => {
      s.classList.toggle('ob-slide--active', i === 0);
      s.classList.remove('ob-slide--exit');
    });
    updateProgress();
    el.style.display = 'flex';

    // Pre-fill income if already saved
    const savedIncome = localStorage.getItem('se_income');
    if (savedIncome) {
      const inp = document.getElementById('ob-income-val');
      if (inp) inp.value = savedIncome;
    }

    // ── Step 0 buttons ──
    document.getElementById('ob-start')?.addEventListener('click', () => goTo(1), { once: true });
    document.getElementById('ob-skip-all')?.addEventListener('click', () => closeOnboarding(), { once: true });

    // ── Step 1 — income ──
    document.getElementById('ob-income-next')?.addEventListener('click', () => {
      const val = parseFloat(document.getElementById('ob-income-val')?.value);
      if (val > 0) {
        localStorage.setItem('se_income', val.toString());
        // Also update the hint on budget step
        const hint = document.getElementById('ob-budget-hint');
        if (hint) hint.textContent = `Based on your ₱${val.toLocaleString()} income, a common rule is to budget 80%.`;
        const budgetInp = document.getElementById('ob-budget-val');
        if (budgetInp && !budgetInp.value) budgetInp.value = Math.round(val * 0.8);
      }
      goTo(2);
    }, { once: true });
    document.getElementById('ob-income-skip')?.addEventListener('click', () => goTo(2), { once: true });

    // ── Step 2 — budget ──
    document.getElementById('ob-budget-next')?.addEventListener('click', () => {
      const val = parseFloat(document.getElementById('ob-budget-val')?.value);
      if (val > 0) {
        localStorage.setItem('se_total_budget', val.toString());
      }
      goTo(3);
    }, { once: true });
    document.getElementById('ob-budget-skip')?.addEventListener('click', () => goTo(3), { once: true });

    // ── Step 3 — done ──
    document.getElementById('ob-go-add')?.addEventListener('click', () => {
      closeOnboarding();
      document.querySelector('[data-tab=add]')?.click();
    }, { once: true });
    document.getElementById('ob-go-dash')?.addEventListener('click', () => closeOnboarding(), { once: true });
  };
}());

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
  await renderMonthComparison();
  await renderHeatmap();
  await renderGoalsSummary();
}

// ── Goals summary widget (dashboard) ──────────────────────
async function renderGoalsSummary() {
  const container = document.getElementById('goals-summary-list');
  if (!container) return;

  const goals  = await getGoalsLocal();
  const active = goals
    .filter(g => {
      const pct = g.targetAmount > 0 ? (parseFloat(g.savedAmount) / parseFloat(g.targetAmount)) * 100 : 0;
      return pct < 100;
    })
    .slice(0, 3);

  if (goals.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:12px 0;">
        <div style="font-size:1.6rem;margin-bottom:6px;">🎯</div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px;">No goals yet</p>
        <button class="btn btn-primary" style="font-size:0.8rem;padding:7px 14px;"
          onclick="document.querySelector('[data-tab=goals]').click();setTimeout(showAddGoalModal,100)">+ New Goal</button>
      </div>`;
    return;
  }

  if (active.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:12px 0;">
        <div style="font-size:1.4rem;margin-bottom:4px;">🎉</div>
        <p style="font-size:0.8rem;color:var(--text-muted);">All goals achieved!</p>
      </div>`;
    return;
  }

  container.innerHTML = active.map(goal => {
    const saved  = parseFloat(goal.savedAmount  || 0);
    const target = parseFloat(goal.targetAmount || 0);
    const pct    = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    return `
      <div class="gs-item">
        <div class="gs-row">
          <span class="gs-icon">${goal.icon || '🎯'}</span>
          <span class="gs-name">${_esc(goal.name)}</span>
          <span class="gs-pct">${pct}%</span>
        </div>
        <div class="gs-track"><div class="gs-fill" style="width:${pct}%"></div></div>
        <div class="gs-amounts">₱${saved.toLocaleString()} <span style="color:var(--text-muted)">of ₱${target.toLocaleString()}</span></div>
      </div>`;
  }).join('');
}

// ── Month-over-month comparison card ───────────────────────
async function renderMonthComparison() {
  const card = document.getElementById('month-comparison-card');
  if (!card) return;

  const expenses = await getAllExpensesLocal();
  const now = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth();
  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastYear  = lastMonthDate.getFullYear();
  const lastMonth = lastMonthDate.getMonth();

  let thisTotal = 0, lastTotal = 0;
  expenses.forEach(e => {
    if (!e.expense_date) return;
    const d = new Date(e.expense_date + 'T00:00:00');
    if (d.getFullYear() === thisYear && d.getMonth() === thisMonth)
      thisTotal += parseFloat(e.amount || 0);
    else if (d.getFullYear() === lastYear && d.getMonth() === lastMonth)
      lastTotal += parseFloat(e.amount || 0);
  });

  const fmt = v => '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const thisName = now.toLocaleDateString('en-PH', { month: 'short' });
  const lastName = lastMonthDate.toLocaleDateString('en-PH', { month: 'short' });

  let badgeHtml = '';
  if (lastTotal > 0) {
    const pct  = ((thisTotal - lastTotal) / lastTotal * 100).toFixed(0);
    const isUp = thisTotal > lastTotal;
    badgeHtml  = `<span class="mcmp-badge ${isUp ? 'up' : 'down'}">${isUp ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  }

  card.innerHTML = `
    <div class="mcmp-row">
      <div class="mcmp-col">
        <div class="mcmp-label">${thisName} (now)</div>
        <div class="mcmp-val">${fmt(thisTotal)}</div>
      </div>
      <div class="mcmp-sep"></div>
      <div class="mcmp-col">
        <div class="mcmp-label">${lastName}</div>
        <div class="mcmp-val mcmp-muted">${fmt(lastTotal)}</div>
      </div>
      ${badgeHtml}
    </div>`;
}

// ── Spending Heatmap Calendar ──────────────────────────────
async function renderHeatmap() {
  const card = document.getElementById('heatmap-card');
  if (!card) return;

  const expenses = await getAllExpensesLocal();
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth();
  const todayStr = now.toISOString().slice(0, 10);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const dayMap   = {};
  expenses.forEach(e => {
    if (e.expense_date && e.expense_date.startsWith(monthStr)) {
      dayMap[e.expense_date] = (dayMap[e.expense_date] || 0) + parseFloat(e.amount || 0);
    }
  });

  const vals       = Object.values(dayMap);
  const maxAmt     = vals.length ? Math.max(...vals) : 1;
  const daysInMon  = new Date(year, month + 1, 0).getDate();
  const firstDow   = new Date(year, month, 1).getDay();
  const monthName  = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

  function lvl(amt) {
    if (!amt) return 0;
    const r = amt / maxAmt;
    if (r > 0.75) return 4;
    if (r > 0.5)  return 3;
    if (r > 0.25) return 2;
    return 1;
  }

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="hm-cell hm-cell--empty"></div>';
  for (let d = 1; d <= daysInMon; d++) {
    const ds    = `${monthStr}-${String(d).padStart(2, '0')}`;
    const amt   = dayMap[ds] || 0;
    const label = amt > 0
      ? `₱${Number(amt).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
      : 'No spending';
    cells += `<div class="hm-cell hm-cell--l${lvl(amt)}${ds === todayStr ? ' hm-cell--today' : ''}" data-date="${ds}" data-amt="${amt}" role="gridcell" aria-label="${ds}: ${label}"><span class="hm-day-num">${d}</span></div>`;
  }

  card.innerHTML = `
    <div class="hm-header">
      <h2>Spending Heatmap</h2>
      <span class="hm-month-label">${monthName}</span>
    </div>
    <div class="hm-dow-row" aria-hidden="true">
      <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
    </div>
    <div class="hm-grid" role="grid" aria-label="Daily spending heatmap">${cells}</div>
    <div class="hm-legend" aria-hidden="true">
      <span class="hm-legend-label">Less</span>
      <div class="hm-cell hm-cell--l0 hm-legend-cell"></div>
      <div class="hm-cell hm-cell--l1 hm-legend-cell"></div>
      <div class="hm-cell hm-cell--l2 hm-legend-cell"></div>
      <div class="hm-cell hm-cell--l3 hm-legend-cell"></div>
      <div class="hm-cell hm-cell--l4 hm-legend-cell"></div>
      <span class="hm-legend-label">More</span>
    </div>`;

  card.querySelectorAll('.hm-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const amt  = parseFloat(cell.dataset.amt || 0);
      const date = cell.dataset.date;
      showToast(amt > 0
        ? `${date}: ₱${Number(amt).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        : `${date}: No spending`);
    });
  });
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
    fetch('/api/v1/user/income', {
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
      .then(() => {})
      .catch(err => console.warn('[SW] Registration failed:', err));
  }
}

// ── Push Notifications ─────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;
  if (Notification.permission === 'granted') {
    if (typeof initFirebaseMessaging === 'function') initFirebaseMessaging();
    return;
  }
  if (localStorage.getItem('se-notif-asked')) return;
  localStorage.setItem('se-notif-asked', '1');
  const result = await Notification.requestPermission();
  if (result === 'granted' && typeof initFirebaseMessaging === 'function') {
    initFirebaseMessaging();
  }
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
  const recent   = expenses.slice(0, 12);

  if (recent.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:32px 16px;">
        <div style="font-size:2.5rem;margin-bottom:12px;">🧾</div>
        <div style="font-weight:600;margin-bottom:6px;color:var(--text);">No expenses yet</div>
        <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:18px;">Log your first expense to start seeing insights and trends.</div>
        <button class="btn btn-primary" style="padding:10px 24px;"
                onclick="document.querySelector('[data-tab=add]').click()">
          + Log First Expense
        </button>
      </div>`;
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