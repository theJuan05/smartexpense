let categoryChart = null;
let dailyChart = null;

// Reads chart colors from CSS custom properties so dark mode works automatically.
function getChartColors() {
  const s = getComputedStyle(document.documentElement);
  const v = function(name) { return s.getPropertyValue(name).trim(); };
  return {
    'Food & Dining'    : v('--chart-food'),
    'Transportation'   : v('--chart-transport'),
    'Utilities & Bills': v('--chart-utilities'),
    'Shopping'         : v('--chart-shopping'),
    'Healthcare'       : v('--chart-health'),
    'Entertainment'    : v('--chart-entertainment'),
    'Education'        : v('--chart-education'),
    'Savings'          : v('--chart-savings'),
    'Housing & Rent'   : v('--chart-housing'),
    'Others'           : v('--chart-others'),
    '_sliceBorder'     : v('--chart-slice-border'),
  };
}

// ── Category Pie Chart ───────────────────────────────────────────
// expenses: optional — pass from renderAllCharts to avoid a second DB read
async function renderCategoryChart(expenses) {
  if (!expenses) expenses = await getAllExpensesLocal();

  const totals = {};
  expenses.forEach(function(exp) {
    const cat = exp.category || 'Others';
    totals[cat] = (totals[cat] || 0) + parseFloat(exp.amount || 0);
  });

  const labels      = Object.keys(totals);
  const data        = Object.values(totals);
  const chartColors = getChartColors();
  const colors      = labels.map(function(l) { return chartColors[l] || chartColors['Others']; });

  const ctx = document.getElementById('chart-category');
  if (!ctx) return;

  if (categoryChart) categoryChart.destroy();

  const tbody = document.getElementById('chart-category-tbody');

  if (labels.length === 0) {
    ctx.parentElement.innerHTML =
      '<p style="text-align:center;color:var(--text-muted);padding:40px 0;">No spending data yet.</p>';
    if (tbody) tbody.innerHTML = '';
    return;
  }

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: chartColors['_sliceBorder'],
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 16, font: { size: 12 }, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: function(c) {
              const val   = c.parsed;
              const total = c.dataset.data.reduce(function(a, b) { return a + b; }, 0);
              const pct   = ((val / total) * 100).toFixed(1);
              return ' ₱' + val.toLocaleString('en-PH') + ' (' + pct + '%)';
            }
          }
        }
      }
    }
  });

  if (tbody) {
    const total = data.reduce(function(a, b) { return a + b; }, 0);
    tbody.innerHTML = labels.map(function(label, i) {
      const pct = total > 0 ? ((data[i] / total) * 100).toFixed(1) : '0.0';
      return '<tr><td>' + label + '</td><td>₱' +
        Number(data[i]).toLocaleString('en-PH', { minimumFractionDigits: 2 }) +
        ' (' + pct + '%)</td></tr>';
    }).join('');
  }
}

// ── Daily Spending Line Chart ────────────────────────────────────
// expenses: optional — pass from renderAllCharts to avoid a second DB read
async function renderDailyChart(rangeDays, expenses) {
  rangeDays = rangeDays || 7;
  if (!expenses) expenses = await getAllExpensesLocal();

  const days   = [];
  const totals = {};
  const dateFmt = { month: 'short', day: 'numeric' };

  for (let i = rangeDays - 1; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    days.push({ key: key, label: d.toLocaleDateString('en-PH', dateFmt) });
    totals[key] = 0;
  }

  expenses.forEach(function(exp) {
    if (Object.prototype.hasOwnProperty.call(totals, exp.expense_date)) {
      totals[exp.expense_date] += parseFloat(exp.amount || 0);
    }
  });

  const labels     = days.map(function(d) { return d.label; });
  const data       = days.map(function(d) { return totals[d.key]; });
  const rangeTotal = data.reduce(function(a, b) { return a + b; }, 0);

  const totalEl = document.getElementById('daily-total');
  if (totalEl) {
    totalEl.textContent = '₱' + rangeTotal.toLocaleString('en-PH',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const rangeLabel = document.getElementById('daily-range-label');
  if (rangeLabel) {
    rangeLabel.textContent =
      rangeDays === 7  ? 'Last 7 days' :
      rangeDays === 30 ? 'Last 30 days' : 'Last 3 months';
  }

  const ctx = document.getElementById('chart-daily');
  if (!ctx) return;

  if (dailyChart) dailyChart.destroy();

  // Use the CSS-defined container height (260px) — avoids an offsetHeight
  // DOM read that would force layout before the canvas has painted.
  const chartCtx  = ctx.getContext('2d');
  const gradient  = chartCtx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(108,79,255,0.45)');
  gradient.addColorStop(1, 'rgba(108,79,255,0.00)');

  const lastNonZeroIdx = data.reduce(function(acc, val, idx) {
    return val > 0 ? idx : acc;
  }, -1);

  const pointBg = data.map(function(_, idx) {
    return idx === lastNonZeroIdx ? '#00b894' : 'rgba(108,79,255,0.8)';
  });
  const pointRadius = data.map(function(_, idx) {
    return idx === lastNonZeroIdx ? 7 : (rangeDays > 30 ? 2 : 4);
  });
  const pointHoverRadius = data.map(function(_, idx) {
    return idx === lastNonZeroIdx ? 9 : 6;
  });

  dailyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Spending',
        data: data,
        borderColor: '#6c4fff',
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: pointBg,
        pointRadius: pointRadius,
        pointHoverRadius: pointHoverRadius,
        pointBorderWidth: 0,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(26,26,46,0.95)',
          titleColor: 'rgba(255,255,255,0.6)',
          bodyColor: '#ffffff',
          padding: 10,
          callbacks: {
            label: function(c) {
              return ' ₱' + c.parsed.y.toLocaleString('en-PH', { minimumFractionDigits: 2 });
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: 'rgba(255,255,255,0.45)',
            font: { size: 11 },
            callback: function(val) {
              return val >= 1000 ? '₱' + (val / 1000).toFixed(1) + 'k' : '₱' + val;
            }
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
          border: { display: false }
        },
        x: {
          ticks: {
            color: 'rgba(255,255,255,0.45)',
            font: { size: 11 },
            maxRotation: 0,
            maxTicksLimit: rangeDays <= 7 ? 7 : rangeDays <= 30 ? 10 : 9
          },
          grid: { display: false },
          border: { display: false }
        }
      }
    }
  });

  const tbody = document.getElementById('chart-daily-tbody');
  if (tbody) {
    tbody.innerHTML = days.map(function(d, i) {
      return '<tr><td>' + d.label + '</td><td>₱' +
        Number(data[i]).toLocaleString('en-PH', { minimumFractionDigits: 2 }) +
        '</td></tr>';
    }).join('');
  }
}

// ── Chart Pill Range Toggle ──────────────────────────────────────
// Called once from app.js DOMContentLoaded — not inside renderAllCharts.
function setupChartPillToggle() {
  document.querySelectorAll('.chart-pill[data-range]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.chart-pill[data-range]').forEach(function(b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      // No cached expenses here — user-triggered, single fetch is fine
      renderDailyChart(parseInt(btn.dataset.range, 10));
    });
  });
}

// ── Budget Progress (Dashboard Overview) ────────────────────────
async function renderBudgetProgress(prefetched = null) {
  const container = document.getElementById('budget-progress-list');
  if (!container) return;

  // Use prefetched data → then cache → then network (avoid standalone server call)
  const result = prefetched
    || await getSetting('budget_summary_cache')
    || await API.request('/budgets/summary');

  if (!result || result.status !== 'success' || !result.data.length) {
    container.innerHTML =
      '<div style="text-align:center;padding:30px;color:var(--text-muted);">' +
      'No budgets set yet. <a onclick="document.querySelector(\'[data-tab=budget]\').click()" ' +
      'style="color:var(--purple);cursor:pointer;text-decoration:underline;">Set one up</a></div>';
    return;
  }

  container.innerHTML = '';

  result.data.forEach(function(budget) {
    const limit    = parseFloat(budget.amount_limit);
    const spent    = parseFloat(budget.spent);
    const pct      = Math.min((spent / limit) * 100, 100).toFixed(1);
    const fillClass = budget.status === 'danger'  ? 'danger'  :
                      budget.status === 'warning' ? 'warning' : '';

    const item = document.createElement('div');
    item.className = 'budget-item';
    item.innerHTML =
      '<div class="budget-header">' +
      '<span class="budget-label">' +
        (budget.category_icon ? '<span aria-hidden="true">' + budget.category_icon + '</span> ' : '') +
        budget.category +
      '</span>' +
      '<span class="budget-amounts">₱' + spent.toLocaleString('en-PH') +
      ' / ₱' + limit.toLocaleString('en-PH') + '</span>' +
      '</div>' +
      '<div class="progress-bar-track">' +
      '<div class="progress-bar-fill ' + fillClass + '"' +
      ' role="progressbar"' +
      ' aria-valuenow="' + Math.round(parseFloat(pct)) + '"' +
      ' aria-valuemin="0"' +
      ' aria-valuemax="100"' +
      ' aria-label="' + budget.category + ' budget: ' + pct + '% used"' +
      ' style="width:' + pct + '%"></div>' +
      '</div>';
    container.appendChild(item);
  });
}

// ── Render All Charts ────────────────────────────────────────────
// Fetches expenses once and passes to both chart functions —
// avoids two parallel IndexedDB reads for the same dataset.
async function renderAllCharts() {
  const expenses = await getAllExpensesLocal();
  await Promise.all([
    renderCategoryChart(expenses),
    renderDailyChart(7, expenses),
    renderBudgetProgress()
  ]);
}
