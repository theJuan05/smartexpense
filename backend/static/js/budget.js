// budget.js — Budget management logic

// ── Load and display budget summary ───────────────────────
async function loadBudgetSummary() {
  const container = document.getElementById('budget-summary-list');
  if (!container) return;

  container.innerHTML = '<div class="spinner">Loading...</div>';

  const result = await API.request('/budgets/summary');

  if (!result) {
    renderBudgetHero(null);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <p style="font-weight:600;">Could not reach server</p>
        <p style="font-size:0.85rem;margin-top:6px;color:var(--text-muted);">
          Make sure the app is running, then retry.
        </p>
        <button onclick="loadBudgetSummary()"
                style="margin-top:12px;padding:8px 20px;background:var(--primary);
                       color:#fff;border:none;border-radius:8px;cursor:pointer;
                       font-size:0.85rem;">
          Retry
        </button>
      </div>`;
    return;
  }

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
            P${Number(budget.spent).toLocaleString()}
          </div>
          <div class="budget-card-limit">
            of P${Number(budget.amount_limit).toLocaleString()}
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

// ── Check budgets after adding expense ────────────────────
async function checkBudgetAlerts() {
  if (!navigator.onLine) return;

  const result = await API.request('/budgets/summary');
  if (!result || result.status !== 'success') return;

  const today   = new Date().toISOString().split('T')[0];
  const seenKey = `se-budget-notified-${today}`;
  const seen    = JSON.parse(localStorage.getItem(seenKey) || '[]');

  result.data.forEach(budget => {
    if (budget.status === 'danger') {
      showToast(`OVER BUDGET: ${budget.category} (${budget.percentage}%)`, 'warning');
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
      showToast(`Warning: ${budget.category} at ${budget.percentage}%`, 'warning');
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