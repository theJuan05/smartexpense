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
    const pastTotal    = pastExp.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const distinctDays = new Set(pastExp.map(e => e.expense_date)).size;
    dailyAvg = pastTotal / Math.max(distinctDays, 1);
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

  // Budget from localStorage (set by budget tab)
  const budgetLimit = parseFloat(localStorage.getItem('se_overall_budget') || '0') || null;

  let risk = 'low', riskMessage = 'Spending looks healthy!';
  if (budgetLimit) {
    const pct = (predictedTotal / budgetLimit) * 100;
    if (pct >= 100) {
      risk = 'high';
      riskMessage = `You are projected to EXCEED your budget by ₱${(predictedTotal - budgetLimit).toLocaleString('en-PH', { minimumFractionDigits: 2 })}!`;
    } else if (pct >= 80) {
      risk = 'medium';
      riskMessage = `You may reach ${pct.toFixed(0)}% of your budget this month.`;
    } else {
      riskMessage = `On track! Projected to use ${pct.toFixed(0)}% of budget.`;
    }
  }

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔮</div>
        <p>Not enough data to predict yet.</p>
        <p style="font-size:0.85rem;margin-top:6px;">Add more expenses to unlock predictions!</p>
      </div>`;
    return;
  }

  const riskColor =
    risk === 'high'   ? 'var(--danger)'  :
    risk === 'medium' ? 'var(--warning)' : 'var(--success)';

  const trendIcon =
    trendDirection === 'up'   ? 'Trending Up'   :
    trendDirection === 'down' ? 'Trending Down' : 'Stable';

  const fmt = v => '₱' + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 });

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
    ${budgetLimit ? `
      <div style="padding:12px 16px;background:var(--bg);border-radius:8px;font-size:0.88rem;">
        <strong>Budget:</strong> ${fmt(budgetLimit)} /month
        &nbsp;|&nbsp;
        <strong>Projected usage:</strong> ${((predictedTotal / budgetLimit) * 100).toFixed(1)}%
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
