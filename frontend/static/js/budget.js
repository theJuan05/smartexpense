// budget.js — Budget management logic

// ── Load and display budget summary ───────────────────────
async function loadBudgetSummary() {
  const container = document.getElementById('budget-summary-list');
  if (!container) return;

  container.innerHTML = '<div class="spinner">Loading...</div>';

  const result = await API.request('/budgets/summary');

  if (!result) {
    await renderBudgetOffline(container);
    return;
  }

  // Cache the budget definitions for offline use (amounts only, not computed spent)
  const cacheable = (result.data || []).map(b => ({
    id: b.id, category: b.category, category_icon: b.category_icon,
    amount_limit: b.amount_limit, period: b.period
  }));
  await saveSetting('budget_cache', cacheable);

  if (result.status !== 'success' || !result.data.length) {
    renderBudgetHero(null);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No budgets set yet.</p>
        <p style="font-size:0.85rem;margin-top:6px;">
          Add your first budget using the form →
        </p>
      </div>`;
    return;
  }

  // Overall budget goes to hero; ALL budgets appear in the overview list
  const overall    = result.data.find(b => b.category === 'Overall Budget');
  const listBudgets = result.data;

  renderBudgetHero(overall || null);

  container.innerHTML = '';

  // Alerts for budgets in warning/danger
  const alerts = listBudgets.filter(b => b.status !== 'ok');
  if (alerts.length > 0) {
    const alertBox = document.createElement('div');
    alertBox.style.marginBottom = '16px';
    alerts.forEach(b => {
      const type = b.status;
      const msg  = type === 'danger'
        ? `${b.category} is at ${b.percentage}% of limit`
        : `${b.category} is at ${b.percentage}% of limit`;
      alertBox.innerHTML += `
        <div class="budget-alert ${type}">
          ${type === 'danger' ? 'OVER BUDGET' : 'WARNING'}: ${msg}
        </div>`;
    });
    container.appendChild(alertBox);
  }

  listBudgets.forEach(budget => {
    container.appendChild(createBudgetCard(budget));
  });

  await renderBudgetProgress(result);
}

// ── Render overall budget as a hero card ──────────────────
function renderBudgetHero(budget) {
  const heroEl = document.getElementById('budget-hero');
  if (!heroEl) return;

  if (!budget) {
    heroEl.innerHTML = '';
    return;
  }

  const remaining  = budget.amount_limit - budget.spent;
  const pct        = Math.min(budget.percentage, 100);
  const isOver     = budget.status === 'danger';
  const isWarn     = budget.status === 'warning';
  const remainColor = isOver ? '#ff7675' : '#00b894';
  const fmt = v => '₱' + Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2 });

  heroEl.innerHTML = `
    <div class="balance-card" style="margin-bottom:14px;">
      <div class="balance-card-header">
        <span class="balance-card-label">Overall Budget</span>
        ${isOver
          ? '<span style="background:rgba(255,118,117,0.2);color:#ff7675;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;letter-spacing:.5px;">OVER BUDGET</span>'
          : isWarn
          ? '<span style="background:rgba(253,203,110,0.2);color:#fdcb6e;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;letter-spacing:.5px;">WARNING</span>'
          : ''}
      </div>
      <div class="balance-amount" style="color:${remainColor}">
        ${remaining < 0 ? '-' : ''}${fmt(remaining)}
      </div>
      <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-bottom:14px;position:relative;z-index:1;">
        Remaining this ${budget.period || 'month'}
      </div>
      <div class="balance-footer">
        <div class="balance-col">
          <div class="balance-col-icon income">↑</div>
          <div class="balance-col-body">
            <div class="balance-col-label">Budget Limit</div>
            <div class="balance-col-val income">${fmt(budget.amount_limit)}</div>
          </div>
        </div>
        <div class="balance-sep"></div>
        <div class="balance-col">
          <div class="balance-col-icon expense">↓</div>
          <div class="balance-col-body">
            <div class="balance-col-label">Spent</div>
            <div class="balance-col-val expense">${fmt(budget.spent)}</div>
          </div>
        </div>
      </div>
      <div class="progress-bar-track"
           style="margin-top:14px;background:rgba(255,255,255,0.1);border-radius:6px;height:6px;overflow:hidden;position:relative;z-index:1;">
        <div class="progress-bar-fill ${isOver ? 'danger' : isWarn ? 'warning' : ''}"
             style="width:${pct}%;transition:width 0.6s ease;height:100%;border-radius:6px;"></div>
      </div>
    </div>
  `;
}

// ── Create a single budget card ────────────────────────────
function createBudgetCard(budget) {
  const card = document.createElement('div');
  card.className = `budget-card ${budget.status === 'ok' ? '' : budget.status}`;
  card.dataset.id = budget.id;

  const pct       = budget.percentage;
  const fillClass = budget.status === 'danger' ? 'danger'
                  : budget.status === 'warning' ? 'warning' : '';

  card.innerHTML = `
    <div class="budget-card-header">
      <div>
        <div class="budget-card-title">
          ${budget.category_icon || ''} ${budget.category}
        </div>
        <div class="budget-card-period">${budget.period}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="budget-card-amounts">
          <div class="budget-card-spent">
            ₱${Number(budget.spent).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <div class="budget-card-limit">
            of ₱${Number(budget.amount_limit).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
        </div>
        <button class="budget-card-delete" data-id="${budget.id}"
                title="Delete budget">🗑</button>
      </div>
    </div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill ${fillClass}"
           style="width: ${Math.min(pct, 100)}%"></div>
    </div>
  `;

  card.querySelector('.budget-card-delete')
    .addEventListener('click', () => handleDeleteBudget(budget.id));

  return card;
}

// ── Add new budget ─────────────────────────────────────────
async function handleAddBudget() {
  const category = document.getElementById('budget-category').value;
  const amount   = parseFloat(document.getElementById('budget-amount').value);
  const period   = document.getElementById('budget-period').value;

  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount', 'warning');
    return;
  }

  const btn = document.getElementById('btn-add-budget');
  btn.textContent = 'Saving...';
  btn.disabled    = true;

  const result = await API.request('/budgets', 'POST', {
    category,
    amount_limit: amount,
    period
  });

  btn.textContent = '+ Set Budget';
  btn.disabled    = false;

  if (result && result.status === 'success') {
    const action = result.action === 'updated' ? 'updated' : 'created';
    showToast(`Budget ${action} successfully!`);
    document.getElementById('budget-amount').value = '';
    await loadBudgetSummary();
  } else {
    const msg = result && result.message
      ? result.message
      : 'Failed to save budget';
    showToast(msg, 'warning');
  }
}

// ── Delete budget ──────────────────────────────────────────
async function handleDeleteBudget(budget_id) {
  if (!confirm('Delete this budget?')) return;

  const result = await API.request(
    `/budgets/${budget_id}`, 'DELETE'
  );

  if (result && result.status === 'success') {
    showToast('Budget deleted');
    await loadBudgetSummary();
  } else {
    showToast('Failed to delete budget', 'warning');
  }
}

// ── Offline budget rendering (computed from local expenses) ──
async function renderBudgetOffline(container) {
  const cached = await getSetting('budget_cache');

  if (!cached || cached.length === 0) {
    renderBudgetHero(null);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <p style="font-weight:600;">No cached budgets yet</p>
        <p style="font-size:0.85rem;margin-top:6px;color:var(--text-muted);">
          Connect once to load your budgets, then they'll show here offline.
        </p>
      </div>`;
    return;
  }

  const expenses = await getAllExpensesLocal();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const budgets = cached.map(b => {
    let spent = 0;
    if (b.category === 'Overall Budget') {
      spent = expenses
        .filter(e => new Date(e.expense_date + 'T00:00:00') >= startOfMonth)
        .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    } else {
      spent = expenses
        .filter(e => e.category === b.category &&
                     new Date(e.expense_date + 'T00:00:00') >= startOfMonth)
        .reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    }
    const pct = b.amount_limit > 0 ? Math.round(spent / b.amount_limit * 100) : 0;
    return {
      ...b, spent,
      percentage: pct,
      status: pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok'
    };
  });

  const overall = budgets.find(b => b.category === 'Overall Budget');
  renderBudgetHero(overall || null);
  container.innerHTML = '';
  budgets.forEach(b => container.appendChild(createBudgetCard(b)));
  await renderBudgetProgress({ status: 'success', data: budgets });

  const note = document.createElement('p');
  note.style.cssText = 'text-align:center;font-size:0.75rem;color:var(--text-muted);margin-top:10px;';
  note.textContent = 'Offline — showing locally computed data';
  container.appendChild(note);
}

// ── Check budgets after adding expense ────────────────────
async function checkBudgetAlerts(triggeredCategory = null) {
  if (!navigator.onLine) return;

  const result = await API.request('/budgets/summary');
  if (!result || result.status !== 'success') return;

  const today   = new Date().toISOString().split('T')[0];
  const seenKey = `se-budget-notified-${today}`;
  const seen    = JSON.parse(localStorage.getItem(seenKey) || '[]');

  result.data.forEach(budget => {
    const isThisCategory = !triggeredCategory || budget.category === triggeredCategory;

    if (budget.status === 'danger') {
      if (isThisCategory) showToast(`Over budget: ${budget.category} (${budget.percentage}%)`, 'warning');
      const id = `${budget.id}-danger`;
      if (!seen.includes(id)) {
        seen.push(id);
        if (typeof showPushNotification === 'function') {
          showPushNotification(
            `Over Budget: ${budget.category}`,
            `You've used ${budget.percentage}% of your ₱${Number(budget.amount_limit).toLocaleString()} limit.`,
            `budget-danger-${budget.id}`
          );
        }
      }
    } else if (budget.status === 'warning') {
      if (isThisCategory) showToast(`Budget warning: ${budget.category} at ${budget.percentage}%`, 'warning');
      const id = `${budget.id}-warning`;
      if (!seen.includes(id)) {
        seen.push(id);
        if (typeof showPushNotification === 'function') {
          showPushNotification(
            `Budget Warning: ${budget.category}`,
            `You've used ${budget.percentage}% of your ₱${Number(budget.amount_limit).toLocaleString()} limit.`,
            `budget-warning-${budget.id}`
          );
        }
      }
    }
  });

  localStorage.setItem(seenKey, JSON.stringify(seen));
}