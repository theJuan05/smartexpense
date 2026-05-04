// predict.js — Predictive spending (computed from local IndexedDB, no server call)

let forecastChart = null;

async function loadPrediction() {
  const container = document.getElementById('prediction-card');
  if (!container) return;

  const expenses = await getAllExpensesLocal();

  const today        = new Date();
  const thisYear     = today.getFullYear();
  const thisMonth    = today.getMonth();           // 0-indexed
  const daysInMonth  = new Date(thisYear, thisMonth + 1, 0).getDate();
  const daysElapsed  = today.getDate();
  const daysRemaining = daysInMonth - daysElapsed;

  const curKey = `${thisYear}-${String(thisMonth + 1).padStart(2, '0')}`;

  // 3-months-ago boundary
  const cutoff = new Date(thisYear, thisMonth - 3, 1);

  const currentExp = [];
  const pastExp    = [];

  expenses.forEach(e => {
    if (!e.expense_date) return;
    const d = new Date(e.expense_date + 'T00:00:00');
    if (e.expense_date.startsWith(curKey)) {
      currentExp.push(e);
    } else if (d >= cutoff) {
      pastExp.push(e);
    }
  });

  const spentSoFar = currentExp.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  let dailyAvg;
  if (pastExp.length > 0) {
    const pastTotal  = pastExp.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    // Use calendar days in the period, not just days-with-spending.
    // e.g. ₱3,000 over 90 days = ₱33/day, not ₱3,000 over 20 spending days = ₱150/day.
    const periodDays = Math.round((today - cutoff) / (1000 * 60 * 60 * 24));
    dailyAvg = pastTotal / Math.max(periodDays, 1);
  } else {
    dailyAvg = spentSoFar / Math.max(daysElapsed, 1);
  }

  const predictedTotal = spentSoFar + dailyAvg * daysRemaining;

  // Monthly totals for trend (past months only)
  const monthMap = {};
  pastExp.forEach(e => {
    const k = e.expense_date.substring(0, 7);
    monthMap[k] = (monthMap[k] || 0) + parseFloat(e.amount || 0);
  });
  const monthVals = Object.keys(monthMap).sort().map(k => monthMap[k]);

  let trendDirection = 'flat', trendAmount = 0;
  if (monthVals.length >= 2) {
    const diff = monthVals[monthVals.length - 1] - monthVals[monthVals.length - 2];
    trendDirection = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    trendAmount    = Math.abs(diff);
  }

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔮</div>
        <p style="font-weight:600;margin-bottom:6px;">No data to predict yet.</p>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px;">
          Log at least a few expenses and predictions will appear here automatically.
        </p>
        <button class="btn btn-primary" style="font-size:0.85rem;padding:8px 20px;"
                onclick="document.querySelector('[data-tab=add]').click()">
          Add an expense
        </button>
      </div>`;
    return;
  }

  // Fetch live budget data from server
  let budgets = [];
  try {
    const res = await API.request('/budgets/summary');
    if (res && res.status === 'success') budgets = res.data || [];
  } catch (_) {}

  const overall    = budgets.find(b => b.category === 'Overall Budget');
  const budgetLimit = overall ? parseFloat(overall.amount_limit) : null;
  const alertBudgets = budgets.filter(b => b.status !== 'ok');

  // Risk from overall budget projection
  let risk = 'low', riskMessage = 'Spending looks healthy!';
  if (budgetLimit) {
    const pct = (predictedTotal / budgetLimit) * 100;
    if (pct >= 100) {
      risk = 'high';
      riskMessage = `Projected to EXCEED budget by ₱${(predictedTotal - budgetLimit).toLocaleString('en-PH', { minimumFractionDigits: 2 })}!`;
    } else if (pct >= 80) {
      risk = 'medium';
      riskMessage = `You may reach ${pct.toFixed(0)}% of your overall budget.`;
    } else {
      riskMessage = `On track! Projected to use ${pct.toFixed(0)}% of overall budget.`;
    }
  }

  // Escalate risk if any category budget is already in warning/danger
  if (risk === 'low' && alertBudgets.length > 0) {
    const worst = alertBudgets.find(b => b.status === 'danger') || alertBudgets[0];
    if (worst.status === 'danger') {
      risk = 'high';
      riskMessage = `${worst.category} is over budget (${worst.percentage}% of ₱${Number(worst.amount_limit).toLocaleString()} limit)!`;
    } else {
      risk = 'medium';
      riskMessage = `${worst.category} is at ${worst.percentage}% of its ₱${Number(worst.amount_limit).toLocaleString()} limit.`;
    }
  }

  const riskColor =
    risk === 'high'   ? 'var(--danger)'  :
    risk === 'medium' ? 'var(--warning)' : 'var(--success)';

  const trendIcon =
    trendDirection === 'up'   ? 'Trending Up'   :
    trendDirection === 'down' ? 'Trending Down' : 'Stable';

  const fmt = v => '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 });

  // Category budget alert rows
  const alertRows = alertBudgets.map(b => `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:8px 12px;border-radius:7px;margin-bottom:6px;
                background:${b.status === 'danger' ? 'rgba(255,118,117,0.1)' : 'rgba(253,203,110,0.1)'};
                border-left:3px solid ${b.status === 'danger' ? 'var(--danger)' : 'var(--warning)'};">
      <span style="font-size:0.85rem;font-weight:600;color:var(--text);">${b.category}</span>
      <span style="font-size:0.82rem;color:${b.status === 'danger' ? 'var(--danger)' : 'var(--warning)'};">
        ₱${Number(b.spent).toLocaleString()} / ₱${Number(b.amount_limit).toLocaleString()}
        &nbsp;(${b.percentage}%)
      </span>
    </div>`).join('');

  container.innerHTML = `
    <div style="padding:14px 18px;border-radius:10px;
                background:${riskColor}18;border:2px solid ${riskColor};
                margin-bottom:16px;color:${riskColor};
                font-weight:600;font-size:0.95rem;">
      ${risk === 'high' ? 'HIGH RISK' : risk === 'medium' ? 'WARNING' : 'ON TRACK'}:
      ${riskMessage}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div class="predict-stat">
        <div class="predict-label">Spent So Far</div>
        <div class="predict-value">${fmt(spentSoFar)}</div>
        <div class="predict-sub">${daysElapsed} days elapsed</div>
      </div>
      <div class="predict-stat">
        <div class="predict-label">Predicted Total</div>
        <div class="predict-value" style="color:${riskColor}">${fmt(predictedTotal)}</div>
        <div class="predict-sub">${daysRemaining} days remaining</div>
      </div>
      <div class="predict-stat">
        <div class="predict-label">Daily Average</div>
        <div class="predict-value">${fmt(dailyAvg)}</div>
        <div class="predict-sub">per day</div>
      </div>
      <div class="predict-stat">
        <div class="predict-label">Spending Trend</div>
        <div class="predict-value">${trendIcon}</div>
        <div class="predict-sub">${fmt(trendAmount)} vs last month</div>
      </div>
    </div>
    ${alertBudgets.length > 0 ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);
                    letter-spacing:.5px;margin-bottom:8px;">BUDGET ALERTS</div>
        ${alertRows}
      </div>` : ''}
    ${budgetLimit ? `
      <div style="padding:10px 14px;background:var(--bg);border-radius:8px;font-size:0.85rem;color:var(--text-muted);">
        Overall budget: ${fmt(budgetLimit)} &nbsp;|&nbsp;
        Projected usage: ${((predictedTotal / budgetLimit) * 100).toFixed(1)}%
      </div>` : ''}
  `;

  // Build forecast chart from local data too
  renderForecastChartLocal(expenses, curKey, today, daysInMonth, spentSoFar, dailyAvg);
}

function renderForecastChartLocal(expenses, curKey, today, daysInMonth, spentSoFar, dailyAvg) {
  const ctx = document.getElementById('chart-forecast');
  if (!ctx) return;

  if (forecastChart) { forecastChart.destroy(); forecastChart = null; }

  // Daily totals for current month
  const dailyMap = {};
  expenses.forEach(e => {
    if (e.expense_date && e.expense_date.startsWith(curKey)) {
      dailyMap[e.expense_date] = (dailyMap[e.expense_date] || 0) + parseFloat(e.amount || 0);
    }
  });

  const labels = [], actual = [], projected = [];
  let cumulative = 0;
  const yr = today.getFullYear(), mo = today.getMonth();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(yr, mo, d);
    const key  = date.toISOString().split('T')[0];
    const lbl  = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    labels.push(lbl);

    if (d <= today.getDate()) {
      cumulative += dailyMap[key] || 0;
      actual.push(parseFloat(cumulative.toFixed(2)));
      projected.push(null);
    } else {
      actual.push(null);
      projected.push(parseFloat((spentSoFar + dailyAvg * (d - today.getDate())).toFixed(2)));
    }
  }

  forecastChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Actual Spending', data: actual,
          borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,0.08)',
          borderWidth: 3, pointRadius: 3, fill: true, tension: 0.3, spanGaps: false,
        },
        {
          label: 'Projected', data: projected,
          borderColor: '#e17055', backgroundColor: 'rgba(225,112,85,0.06)',
          borderWidth: 2, borderDash: [6, 4],
          pointRadius: 2, fill: true, tension: 0.3, spanGaps: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, font: { size: 12 } } },
        tooltip: { callbacks: { label: c => c.parsed.y !== null ? ` ₱${c.parsed.y.toLocaleString()}` : null } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => `₱${v.toLocaleString()}` }, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { ticks: { maxTicksLimit: 10, maxRotation: 0 }, grid: { display: false } }
      }
    }
  });
}
