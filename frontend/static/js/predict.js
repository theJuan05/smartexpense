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
    const pastTotal = pastExp.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    // Divide by days in months that actually have data, not the full calendar window.
    // e.g. if only April has data, use 30 days — not 109 days since Feb 1.
    const pastMonthSet = new Set(pastExp.map(e => e.expense_date.substring(0, 7)));
    let dataDays = 0;
    pastMonthSet.forEach(k => {
      const [y, m] = k.split('-').map(Number);
      dataDays += new Date(y, m, 0).getDate();
    });
    dailyAvg = pastTotal / Math.max(dataDays, 1);
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
      riskMessage = `Projected to EXCEED budget by ₱${(Math.round((predictedTotal - budgetLimit) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!`;
    } else if (pct >= 80) {
      risk = 'medium';
      riskMessage = `You may reach ${pct.toFixed(0)}% of your overall budget.`;
    } else {
      riskMessage = `On track! Projected to use ${pct.toFixed(0)}% of overall budget.`;
    }
  }

  // If no overall budget is set, use the worst category budget to set overall risk
  // but only go up to 'medium' — category budgets alone never trigger 'high'
  if (!budgetLimit && risk === 'low' && alertBudgets.length > 0) {
    risk = 'medium';
    const worst = alertBudgets.find(b => b.status === 'danger') || alertBudgets[0];
    riskMessage = `${worst.category} is at ${worst.percentage}% of its ₱${Number(worst.amount_limit).toLocaleString()} limit.`;
  }

  const riskColor =
    risk === 'high'   ? 'var(--danger)'  :
    risk === 'medium' ? 'var(--warning)' : 'var(--success)';

  const trendIcon =
    trendDirection === 'up'   ? 'Trending Up'   :
    trendDirection === 'down' ? 'Trending Down' : 'Stable';

  const fmt = v => '₱' + (Math.round(v * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Category budget alert rows
  const alertRows = alertBudgets.map(b => `
    <div class="budget-alert-row budget-alert-row--${b.status}">
      <span class="budget-alert-row-cat">${b.category}</span>
      <span class="budget-alert-row-amt">
        ₱${Number(b.spent).toLocaleString()} / ₱${Number(b.amount_limit).toLocaleString()}
        &nbsp;(${b.percentage}%)
      </span>
    </div>`).join('');

  const riskClass = risk === 'high' ? 'danger' : risk === 'medium' ? 'warning' : 'ok';
  container.innerHTML = `
    <div class="predict-risk-banner predict-risk-banner--${riskClass}">
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

// ── ML Forecast (server-side Linear Regression) ────────────
async function loadMLForecast() {
  const container = document.getElementById('ml-forecast-card');
  if (!container) return;

  try {
    const res = await API.request('/analysis/ml-forecast');

    if (!res || res.status === 'insufficient_data') {
      const n = res?.n_full_months ?? 0;
      const msg = n >= 1
        ? `You have ${n} full month${n > 1 ? 's' : ''} of data. Keep logging expenses — predictions will be ready once the current month ends.`
        : `Start logging your daily expenses and the ML forecast will be ready after your first full month.`;
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🤖</div>
          <p style="font-weight:600;margin-bottom:6px;">Almost there!</p>
          <p style="font-size:0.85rem;color:var(--text-muted);">${msg}</p>
        </div>`;
      return;
    }

    if (res.status !== 'success') throw new Error('API error');

    const fmt = v => '₱' + (Math.round(v * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const trendIcon  = res.trend === 'up' ? '📈 Increasing' : res.trend === 'down' ? '📉 Decreasing' : '➡️ Stable';
    const confidence = res.r2_score >= 0.8 ? 'High' : res.r2_score >= 0.5 ? 'Moderate' : 'Low';
    const confColor  = res.r2_score >= 0.8 ? 'var(--success)' : res.r2_score >= 0.5 ? 'var(--warning)' : 'var(--text-muted)';

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div class="predict-stat" style="grid-column:1/-1;">
          <div class="predict-label">Predicted Spending for ${res.next_month_label}</div>
          <div class="predict-value" style="font-size:2rem;color:var(--purple)">${fmt(res.predicted)}</div>
          <div class="predict-sub">Based on ${res.n_months} month${res.n_months !== 1 ? 's' : ''} of training data</div>
        </div>
        <div class="predict-stat">
          <div class="predict-label">Model Confidence</div>
          <div class="predict-value" style="color:${confColor}">${confidence}</div>
          <div class="predict-sub">R² = ${res.r2_score}</div>
        </div>
        <div class="predict-stat">
          <div class="predict-label">Spending Trend</div>
          <div class="predict-value" style="font-size:1rem;">${trendIcon}</div>
          <div class="predict-sub">₱${Math.abs(res.slope).toLocaleString()} / month slope</div>
        </div>
      </div>
      `;
  } catch (_) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Could not load ML forecast.</p>`;
  }
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
      devicePixelRatio: window.devicePixelRatio || 2,
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

// ── FIES Benchmark ─────────────────────────────────────────
let fiesChart = null;

async function loadFIESBenchmark() {
  const card = document.getElementById('fies-benchmark-card');
  const wrap = document.getElementById('fies-chart-wrap');
  if (!card) return;

  try {
    const res = await API.request('/analysis/fies-benchmark');
    if (res.status !== 'success') {
      card.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Could not load benchmark data.</p>`;
      return;
    }

    const cats = res.categories;
    const hasIncome = res.has_income;

    const incomeNote = hasIncome
      ? `Income: <strong>₱${res.monthly_income.toLocaleString()}/mo</strong> &nbsp;·&nbsp; PH median: ₱${res.national_median_income.toLocaleString()}/mo`
      : `<span style="color:var(--text-muted)">Set your monthly income to see income-adjusted predictions.</span>`;

    const chips = cats.map(c => {
      const pct = c.vs_predicted_pct;
      const badge = pct != null
        ? `<span style="font-size:0.72rem;padding:2px 7px;border-radius:99px;font-weight:600;
            background:${pct > 0 ? 'rgba(224,92,92,0.15)' : 'rgba(61,191,130,0.15)'};
            color:${pct > 0 ? '#e05c5c' : '#3dbf82'}">
            ${pct > 0 ? '+' : ''}${pct}%
           </span>`
        : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;
                  padding:7px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:0.83rem;">${c.category}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:0.83rem;font-weight:600;">₱${c.actual.toLocaleString()}</span>
          ${badge}
        </div>
      </div>`;
    }).join('');

    card.innerHTML = `
      <p style="font-size:0.8rem;margin-bottom:10px;">${incomeNote}</p>
      <div>${chips}</div>
      <p style="font-size:0.7rem;color:var(--text-muted);margin-top:8px;">
        PSA FIES · ${res.n_households.toLocaleString()} households · hover chart bars for full values
      </p>`;

    // Bar chart
    wrap.style.display = 'block';
    const ctx = document.getElementById('chart-fies');
    if (!ctx) return;
    if (fiesChart) { fiesChart.destroy(); fiesChart = null; }

    const labels    = cats.map(c => c.category);
    const actuals   = cats.map(c => c.actual);
    const predicted = cats.map(c => c.predicted ?? null);
    const national  = cats.map(c => c.national);

    const datasets = [
      {
        label: 'Your Actual',
        data: actuals,
        backgroundColor: 'rgba(124,92,191,0.75)',
        borderRadius: 4,
      },
      {
        label: 'PH Median (FIES)',
        data: national,
        backgroundColor: 'rgba(61,191,130,0.55)',
        borderRadius: 4,
      },
    ];

    if (hasIncome) {
      datasets.splice(1, 0, {
        label: 'ML Predicted (your income)',
        data: predicted,
        backgroundColor: 'rgba(240,180,50,0.7)',
        borderRadius: 4,
      });
    }

    fiesChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: window.devicePixelRatio || 2,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => ` ₱${(c.parsed.y ?? 0).toLocaleString()}` } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => `₱${v.toLocaleString()}` }, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

  } catch (e) {
    card.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Could not load FIES benchmark.</p>`;
  }
}
