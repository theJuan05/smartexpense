// predict.js — Predictive spending UI

let forecastChart = null;

async function loadPrediction() {
  const container = document.getElementById('prediction-card');
  if (!container) return;

  container.innerHTML = '<div class="spinner">Analyzing spending...</div>';

  const result = await API.request('/analysis/predict?user_id=1');

  if (!result || result.status !== 'success') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔮</div>
        <p>Not enough data to predict yet.</p>
        <p style="font-size:0.85rem;margin-top:6px;">
          Add more expenses to unlock predictions!
        </p>
      </div>`;
    return;
  }

  const riskColor =
    result.risk === 'high'   ? 'var(--danger)'  :
    result.risk === 'medium' ? 'var(--warning)' :
    'var(--success)';

  const trendIcon =
    result.trend_direction === 'up'   ? 'Trending Up'   :
    result.trend_direction === 'down' ? 'Trending Down' :
    'Stable';

  container.innerHTML = `
    <div style="
      padding:14px 18px;border-radius:10px;
      background:${riskColor}18;border:2px solid ${riskColor};
      margin-bottom:16px;color:${riskColor};
      font-weight:600;font-size:0.95rem;">
      ${result.risk === 'high'   ? 'HIGH RISK'  :
        result.risk === 'medium' ? 'WARNING'    : 'ON TRACK'}:
      ${result.risk_message}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;
                gap:12px;margin-bottom:16px;">
      <div class="predict-stat">
        <div class="predict-label">Spent So Far</div>
        <div class="predict-value">
          P${Number(result.spent_so_far).toLocaleString()}
        </div>
        <div class="predict-sub">${result.days_elapsed} days elapsed</div>
      </div>
      <div class="predict-stat">
        <div class="predict-label">Predicted Total</div>
        <div class="predict-value" style="color:${riskColor}">
          P${Number(result.predicted_total).toLocaleString()}
        </div>
        <div class="predict-sub">${result.days_remaining} days remaining</div>
      </div>
      <div class="predict-stat">
        <div class="predict-label">Daily Average</div>
        <div class="predict-value">
          P${Number(result.daily_average).toLocaleString()}
        </div>
        <div class="predict-sub">per day</div>
      </div>
      <div class="predict-stat">
        <div class="predict-label">Spending Trend</div>
        <div class="predict-value">${trendIcon}</div>
        <div class="predict-sub">
          P${Number(result.trend_amount).toLocaleString()} vs last month
        </div>
      </div>
    </div>

    ${result.budget_limit ? `
      <div style="padding:12px 16px;background:var(--bg);
                  border-radius:8px;font-size:0.88rem;">
        <strong>Budget:</strong>
        P${Number(result.budget_limit).toLocaleString()} /month
        &nbsp;|&nbsp;
        <strong>Projected usage:</strong>
        ${((result.predicted_total/result.budget_limit)*100).toFixed(1)}%
      </div>` : ''}
  `;

  await loadForecastChart();
}

async function loadForecastChart() {
  const result = await API.request(
    '/analysis/forecast-chart?user_id=1'
  );
  if (!result || result.status !== 'success') return;

  const ctx = document.getElementById('chart-forecast');
  if (!ctx) return;

  if (forecastChart) {
    forecastChart.destroy();
    forecastChart = null;
  }

  forecastChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: result.labels,
      datasets: [
        {
          label          : 'Actual Spending',
          data           : result.actual,
          borderColor    : '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.08)',
          borderWidth    : 3,
          pointRadius    : 3,
          fill           : true,
          tension        : 0.3,
          spanGaps       : false,
        },
        {
          label          : 'Projected',
          data           : result.projected,
          borderColor    : '#e17055',
          backgroundColor: 'rgba(225,112,85,0.06)',
          borderWidth    : 2,
          borderDash     : [6, 4],
          pointRadius    : 2,
          fill           : true,
          tension        : 0.3,
          spanGaps       : false,
        }
      ]
    },
    options: {
      responsive          : true,
      maintainAspectRatio : false,
      interaction         : { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels  : { usePointStyle: true, font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y !== null
              ? ` P${ctx.parsed.y.toLocaleString()}` : null
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: val => `P${val.toLocaleString()}` },
          grid : { color: 'rgba(0,0,0,0.04)' }
        },
        x: {
          ticks: { maxTicksLimit: 10, maxRotation: 0 },
          grid : { display: false }
        }
      }
    }
  });
}