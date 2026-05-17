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

    // 4. Wire up tabs immediately — before any network calls
    setupTabs();
    setPageTitle('dashboard');

    // 5. Load from local IndexedDB (instant, no network needed)
    await Promise.all([
      loadExpenseList(),
      refreshStats()
    ]);
    await renderBalance();
    setupIncomeModal();
  } finally {
    // Always dismiss skeleton — even if something above threw
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
    await syncIncomeFromServer();
    await pullGoalsFromServer();
    if (document.querySelector('#tab-goals.active')) await loadGoals();
  });
  window.addEventListener('offline', () => {
    updateOnlineStatus();
    showToast('You are offline - data saved locally', 'warning');
  });

  // Re-sync when app is resumed from background (mobile PWA)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await syncIncomeFromServer();
      await pullGoalsFromServer();
      if (document.querySelector('#tab-goals.active')) await loadGoals();
    }
  });

  // 8. Auth check + server sync — both run in background, never block UI
  checkBackendConnection();
  _syncOnLoad();

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
      if (target === 'goals')     { await pullGoalsFromServer(); await loadGoals(); }
      if (target === 'profile')   { if (typeof updateNotifPermissionStatus === 'function') updateNotifPermissionStatus(); }
      if (target === 'insights') {
        await Promise.all([loadFIESBenchmark(), loadPrediction(), loadAnomalies(), loadMLForecast()]);
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

  // Sync to server in background — budget alert fires after server confirms
  if (navigator.onLine) _syncNewExpense(localId, expense);

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
      await checkBudgetAlerts(expense.category); // only toast the category just logged
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
  // Slides: 0-2 = intro showcase, 3 = income, 4 = budget, 5 = done
  const ICONS = ['💰', '📊', '🎯', '💵', '📋', '✅'];
  let current = 0;

  function goTo(idx) {
    const slides = document.querySelectorAll('.ob-slide');
    if (!slides.length) return;
    const prev = current;
    slides[prev].classList.remove('ob-slide--active');
    slides[prev].classList.add('ob-slide--exit');
    current = idx;
    slides[current].classList.add('ob-slide--active');
    updateChrome();
    setTimeout(() => slides[prev].classList.remove('ob-slide--exit'), 220);
  }

  function updateChrome() {
    const isIntro = current < 3;
    const skipEl  = document.getElementById('ob-skip-all');
    const stepEl  = document.getElementById('ob-step-count');
    const metaEl  = document.querySelector('.ob-card-meta');
    const iconEl  = document.getElementById('ob-visual-icon');

    if (skipEl) skipEl.style.display = isIntro ? '' : 'none';
    if (stepEl) stepEl.textContent   = isIntro ? `0${current + 1} / 03` : '';
    if (metaEl) metaEl.style.display = isIntro ? 'flex' : 'none';

    if (iconEl) {
      iconEl.style.opacity   = '0';
      iconEl.style.transform = 'scale(0.72) translateY(6px)';
      setTimeout(() => {
        iconEl.textContent     = ICONS[current];
        iconEl.style.opacity   = '1';
        iconEl.style.transform = 'scale(1) translateY(0)';
      }, 160);
    }
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

    document.querySelectorAll('.ob-slide').forEach((s, i) => {
      s.classList.toggle('ob-slide--active', i === 0);
      s.classList.remove('ob-slide--exit');
    });
    updateChrome();
    el.style.display = 'flex';

    // Pre-fill income if already saved
    const savedIncome = localStorage.getItem('se_income');
    if (savedIncome) {
      const inp = document.getElementById('ob-income-val');
      if (inp) inp.value = savedIncome;
    }

    // Intro slide CTAs
    document.getElementById('ob-next-0')?.addEventListener('click', () => goTo(1), { once: true });
    document.getElementById('ob-next-1')?.addEventListener('click', () => goTo(2), { once: true });
    document.getElementById('ob-next-2')?.addEventListener('click', () => goTo(3), { once: true });

    // Skip
    document.getElementById('ob-skip-all')?.addEventListener('click', () => closeOnboarding(), { once: true });

    // Income step
    document.getElementById('ob-income-next')?.addEventListener('click', () => {
      const val = parseFloat(document.getElementById('ob-income-val')?.value);
      if (val > 0) {
        localStorage.setItem('se_income', val.toString());
        fetch('/api/v1/user/income', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthly_income: val }),
        }).catch(() => {});
        const hint = document.getElementById('ob-budget-hint');
        if (hint) hint.textContent = `Based on your ₱${val.toLocaleString()} income, a common rule is to budget 80%.`;
        const budgetInp = document.getElementById('ob-budget-val');
        if (budgetInp && !budgetInp.value) budgetInp.value = Math.round(val * 0.8);
      }
      goTo(4);
    }, { once: true });
    document.getElementById('ob-income-skip')?.addEventListener('click', () => goTo(4), { once: true });

    // Budget step
    document.getElementById('ob-budget-next')?.addEventListener('click', () => {
      const val = parseFloat(document.getElementById('ob-budget-val')?.value);
      if (val > 0) localStorage.setItem('se_total_budget', val.toString());
      goTo(5);
    }, { once: true });
    document.getElementById('ob-budget-skip')?.addEventListener('click', () => goTo(5), { once: true });

    // Done step
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
}

// ── Search ─────────────────────────────────────────────────
async function handleSearch(e) {
  await loadExpenseList(e.target.value);
}

// ── Expense Item ───────────────────────────────────────────
function createExpenseItem(exp) {
  const div = document.createElement('div');
  div.className = 'expense-item';

  const catData = getCategoryIcon(exp.category);
  const synced  = exp.synced == 1;
  const dateStr = exp.expense_date
    ? new Date(exp.expense_date + 'T00:00:00')
        .toLocaleDateString('en-PH',
          { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  div.innerHTML = `
    <div class="expense-icon" style="background:${catData.bg};border-color:transparent;color:${catData.color}">${catData.svg}</div>
    <div class="expense-info">
      <div class="expense-title">${escapeHtml(safeTitle(exp.title))}</div>
      <div class="expense-meta">
        ${exp.category || 'Uncategorized'} &bull; ${dateStr}
      </div>
    </div>
    <div class="expense-right">
      <div class="expense-amount">-₱${Number(exp.amount).toLocaleString()}</div>
      ${!synced ? '<span class="expense-sync-badge">Pending</span>' : ''}
      <div class="expense-actions">
        <button class="expense-edit-btn" data-id="${exp.local_id}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
        <button class="expense-delete-btn" data-id="${exp.local_id}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
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

// Returns total goal contributions for the current month (from tracked contributions)
async function getGoalContribForMonth(year, month) {
  if (typeof getGoalsLocal !== 'function') return 0;
  const now   = new Date();
  const y     = year  ?? now.getFullYear();
  const m     = month ?? now.getMonth();
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const goals  = await getGoalsLocal();
  let total = 0;
  goals.forEach(g => (g.contributions || []).forEach(c => {
    if (c.date && c.date.startsWith(prefix)) total += parseFloat(c.amount || 0);
  }));
  return total;
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

  const goalContribThisMonth = await getGoalContribForMonth();
  if (el('stat-month'))
    el('stat-month').textContent =
      `₱${Number(stats.thisMonth + goalContribThisMonth).toLocaleString()}`;
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

  thisTotal += await getGoalContribForMonth(thisYear, thisMonth);
  lastTotal += await getGoalContribForMonth(lastYear, lastMonth);

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

  // Fold in goal contributions so funded goals appear on the heatmap
  if (typeof getGoalsLocal === 'function') {
    const goals = await getGoalsLocal();
    goals.forEach(g => (g.contributions || []).forEach(c => {
      if (!c.date) return;
      const dateStr = c.date.slice(0, 10);
      if (dateStr.startsWith(monthStr)) {
        dayMap[dateStr] = (dayMap[dateStr] || 0) + parseFloat(c.amount || 0);
      }
    }));
  }

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

  const goals      = typeof getGoalsLocal === 'function' ? await getGoalsLocal() : [];
  const totalGoals = goals.reduce((sum, g) => sum + parseFloat(g.savedAmount || 0), 0);

  const balance = income - totalExpenses - totalGoals;

  const fmt = val => '₱' + Math.abs(val).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  const amountEl   = document.getElementById('balance-amount');
  const incomeEl   = document.getElementById('balance-income');
  const expensesEl = document.getElementById('balance-expenses');
  const goalsEl    = document.getElementById('balance-goals');

  if (amountEl) {
    amountEl.textContent = (balance < 0 ? '-' : '') + fmt(balance);
    amountEl.classList.toggle('negative', balance < 0);
  }
  if (incomeEl)   incomeEl.textContent   = fmt(income);
  if (expensesEl) expensesEl.textContent = fmt(totalExpenses);
  if (goalsEl)    goalsEl.textContent    = fmt(totalGoals);

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
  const slider    = document.getElementById('income-slider');
  const display   = document.getElementById('income-display-val');

  if (!btnSet || !modal) return;

  function formatIncome(val) {
    return '₱' + Number(val).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function syncFromSlider() {
    const val = parseInt(slider.value, 10);
    input.value   = val;
    display.textContent = formatIncome(val);
  }

  function syncFromInput() {
    const val = Math.min(Math.max(parseInt(input.value, 10) || 0, 0), 500000);
    slider.value  = val;
    display.textContent = formatIncome(val);
  }

  slider.addEventListener('input', syncFromSlider);
  input.addEventListener('input',  syncFromInput);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });

  const open = () => {
    const saved = parseFloat(localStorage.getItem('se_income') || '0');
    const clamped = Math.min(saved, 500000);
    input.value  = clamped || '';
    slider.value = clamped;
    display.textContent = formatIncome(clamped);
    openModal(modal, btnSet);
  };
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
    fetch('/api/v1/user/income', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ monthly_income: val }),
    }).then(r => r.json()).then(d => {
      if (d.status === 'success') showToast('Income updated! Synced to all devices.');
      else showToast('Income saved locally — sync failed', 'warning');
    }).catch(() => showToast('Income saved locally — check connection', 'warning'));
  });
}

// Fetch income from server and update localStorage + UI if changed
async function syncIncomeFromServer() {
  try {
    const res  = await fetch('/api/v1/auth/status');
    const data = await res.json();
    if (data.logged_in && data.monthly_income > 0) {
      const current = parseFloat(localStorage.getItem('se_income') || '0');
      if (data.monthly_income !== current) {
        localStorage.setItem('se_income', data.monthly_income.toString());
        renderBalance();
      }
    }
  } catch (_) {}
}

// ── Background Sync on Load ────────────────────────────────
// Runs auth check + server pull after UI is ready. Never awaited — won't block tabs or buttons.
async function _syncOnLoad() {
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
      if (authData.monthly_income > 0) {
        localStorage.setItem('se_income', authData.monthly_income.toString());
      } else {
        const localIncome = parseFloat(localStorage.getItem('se_income') || '0');
        if (localIncome > 0) {
          fetch('/api/v1/user/income', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monthly_income: localIncome }),
          }).catch(() => {});
        }
      }
    }
  } catch (_) {}
  const pulled = await pullExpensesFromServer();
  await pullGoalsFromServer();
  if (pulled > 0) {
    await loadExpenseList();
    await refreshStats();
    await renderBalance();
  }
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
async function requestNotificationPermission(fromSettings = false) {
  if (typeof updateNotifPermissionStatus === 'function') updateNotifPermissionStatus();

  if (!('Notification' in window)) {
    if (fromSettings) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (isIOS && !isStandalone) {
        alert('To enable notifications:\n1. Close this page\n2. Open SmartExpense from your home screen icon\n3. Go to Profile → Push Notifications');
      } else {
        alert('Notifications are not supported in this browser. Try Chrome.');
      }
    }
    return;
  }

  if (Notification.permission === 'denied') {
    if (fromSettings) alert('Notifications are blocked.\n\nFix: phone Settings → Apps → Chrome → Notifications → Allow');
    return;
  }

  if (Notification.permission === 'granted') {
    // Already granted — just ensure FCM token is registered
    if (typeof initFirebaseMessaging === 'function') await initFirebaseMessaging();
    if (typeof updateNotifPermissionStatus === 'function') updateNotifPermissionStatus();
    return;
  }

  // 'default' — ask
  if (!fromSettings && localStorage.getItem('se-notif-asked')) return;
  localStorage.setItem('se-notif-asked', '1');

  const result = await Notification.requestPermission();
  if (typeof updateNotifPermissionStatus === 'function') updateNotifPermissionStatus();

  if (result === 'granted') {
    if (typeof initFirebaseMessaging === 'function') {
      const ok = await initFirebaseMessaging();
      if (fromSettings) {
        if (ok) {
          if (typeof showToast === 'function') showToast('Push notifications enabled!', 'success');
        } else {
          if (typeof showToast === 'function') showToast('Permission granted, but device registration failed. Try the test button.', 'warning');
        }
      }
    }
  } else if (fromSettings) {
    alert('Permission was not granted. You can try again from Profile → Push Notifications.');
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
  const map = {
    'Food & Dining': {
      color: '#d97706', bg: 'rgba(217,119,6,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3"/><path d="M21 15v7"/></svg>`,
    },
    'Transportation': {
      color: '#2563eb', bg: 'rgba(37,99,235,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
    },
    'Utilities & Bills': {
      color: '#ca8a04', bg: 'rgba(202,138,4,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    },
    'Shopping': {
      color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    },
    'Healthcare': {
      color: '#dc2626', bg: 'rgba(220,38,38,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    },
    'Entertainment': {
      color: '#db2777', bg: 'rgba(219,39,119,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    },
    'Education': {
      color: '#0891b2', bg: 'rgba(8,145,178,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    },
    'Savings': {
      color: '#059669', bg: 'rgba(5,150,105,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
    },
    'Housing & Rent': {
      color: '#475569', bg: 'rgba(71,85,105,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    },
    'Others': {
      color: '#6b7280', bg: 'rgba(107,114,128,0.1)',
      svg: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
    },
  };
  return map[category] || map['Others'];
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
  hint.append('Smart suggest: ', strong, ` (${pct}% confident) `, btn);
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