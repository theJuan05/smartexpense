// budget.js — Budget management logic

// ── Load and display budget summary ───────────────────────
async function loadBudgetSummary() {
  const container = document.getElementById('budget-summary-list');
  if (!container) return;

  container.innerHTML = '<div class="spinner">Loading...</div>';

  // Fetch from Flask budget summary endpoint
  const result = await API.request('/budgets/summary?user_id=1');

  if (!result || result.status !== 'success' || !result.data.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No budgets set yet.</p>
        <p style="font-size:0.85rem;margin-top:6px;">
          Add your first budget below!
        </p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  // Check for alerts first
  const alerts = result.data.filter(b => b.status !== 'ok');
  if (alerts.length > 0) {
    const alertBox = document.createElement('div');
    alertBox.style.marginBottom = '16px';
    alerts.forEach(b => {
      const pct  = b.percentage;
      const type = b.status;
      const msg  = type === 'danger'
        ? `Over budget alert! ${b.category} is at ${pct}% of limit`
        : `Warning: ${b.category} is at ${pct}% of limit`;

      alertBox.innerHTML += `
        <div class="budget-alert ${type}">
          ${type === 'danger' ? 'OVER BUDGET' : 'WARNING'}: ${msg}
        </div>`;
    });
    container.appendChild(alertBox);
  }

  // Render each budget card
  result.data.forEach(budget => {
    const card = createBudgetCard(budget);
    container.appendChild(card);
  });

  // Also refresh dashboard budget section
  await renderBudgetProgress();
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
    <button class="budget-card-delete" data-id="${budget.id}"
            title="Delete budget">X</button>
    <div class="budget-card-header">
      <div>
        <div class="budget-card-title">
          ${budget.category_icon || ''} ${budget.category}
        </div>
        <div class="budget-card-period">${budget.period}</div>
      </div>
      <div class="budget-card-amounts">
        <div class="budget-card-spent">
          P${Number(budget.spent).toLocaleString()}
        </div>
        <div class="budget-card-limit">
          of P${Number(budget.amount_limit).toLocaleString()}
        </div>
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
    period,
    user_id: 1
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

  const result = await API.request('/budgets/summary?user_id=1');
  if (!result || result.status !== 'success') return;

  result.data.forEach(budget => {
    if (budget.status === 'danger') {
      showToast(
        `OVER BUDGET: ${budget.category} (${budget.percentage}%)`,
        'warning'
      );
    } else if (budget.status === 'warning') {
      showToast(
        `Warning: ${budget.category} at ${budget.percentage}%`,
        'warning'
      );
    }
  });
}