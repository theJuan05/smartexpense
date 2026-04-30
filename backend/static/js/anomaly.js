// anomaly.js — Anomaly detection UI

// ── Load and display anomalies ─────────────────────────────
async function loadAnomalies() {
  const container = document.getElementById('anomaly-list');
  if (!container) return;

  container.innerHTML = '<div class="spinner">Scanning transactions...</div>';

  const result = await API.request('/anomaly/detect?user_id=1');

  if (!result || result.status !== 'success') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>Could not scan transactions.</p>
      </div>`;
    return;
  }

  // Summary badges
  const summaryEl = document.getElementById('anomaly-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span style="background:#ffeaea;color:var(--danger);
                   padding:4px 10px;border-radius:20px;
                   font-size:0.8rem;font-weight:600;margin-right:6px;">
        HIGH: ${result.summary.high}
      </span>
      <span style="background:#fff3cd;color:#856404;
                   padding:4px 10px;border-radius:20px;
                   font-size:0.8rem;font-weight:600;margin-right:6px;">
        MEDIUM: ${result.summary.medium}
      </span>
      <span style="background:#d4edda;color:#155724;
                   padding:4px 10px;border-radius:20px;
                   font-size:0.8rem;font-weight:600;">
        Scanned: ${result.total_expenses}
      </span>
    `;
  }

  if (result.anomaly_count === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p style="color:var(--success);font-weight:600;">
          No anomalies detected!
        </p>
        <p style="font-size:0.85rem;margin-top:6px;color:var(--text-muted)">
          All ${result.total_expenses} transactions look normal.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  result.anomalies.forEach(anomaly => {
    container.appendChild(createAnomalyCard(anomaly));
  });
}

// ── Create anomaly card ────────────────────────────────────
function createAnomalyCard(anomaly) {
  const div = document.createElement('div');

  const colors = {
    high  : { bg: '#ffeaea', border: 'var(--danger)',  text: 'var(--danger)'  },
    medium: { bg: '#fff3cd', border: 'var(--warning)', text: '#856404'        },
    low   : { bg: '#e8f4fd', border: '#0984e3',        text: '#0984e3'        },
  };
  const c = colors[anomaly.severity] || colors.low;

  div.style.cssText = `
    background: ${c.bg};
    border: 1px solid ${c.border};
    border-left: 4px solid ${c.border};
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 10px;
  `;

  const badge = anomaly.severity.toUpperCase();
  const reasonsList = anomaly.reasons
    .map(r => `<li style="margin-bottom:4px;">${r}</li>`)
    .join('');

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;
                align-items:flex-start;margin-bottom:8px;">
      <div>
        <span style="font-weight:700;color:${c.text};
                     font-size:0.95rem;">
          ${anomaly.title}
        </span>
        <span style="margin-left:8px;padding:2px 8px;
                     background:${c.border};color:white;
                     border-radius:10px;font-size:0.7rem;
                     font-weight:700;">
          ${badge}
        </span>
      </div>
      <div style="font-weight:700;color:${c.text};
                  font-size:1rem;">
        P${Number(anomaly.amount).toLocaleString()}
      </div>
    </div>
    <div style="font-size:0.8rem;color:var(--text-muted);
                margin-bottom:8px;">
      ${anomaly.category} &bull; ${anomaly.expense_date || ''}
    </div>
    <ul style="margin:0;padding-left:18px;
               font-size:0.83rem;color:${c.text};">
      ${reasonsList}
    </ul>
  `;

  return div;
}

// ── Check single expense before saving ────────────────────
async function checkExpenseAnomaly(title, amount, category) {
  if (!navigator.onLine) return;

  const result = await API.request(
    '/anomaly/check-single', 'POST',
    { title, amount, category, user_id: 1 }
  );

  if (result && result.anomaly) {
    const severity = result.severity || 'medium';
    const reason   = result.reasons[0] || 'Unusual amount detected';

    // Show warning but don't block saving
    showAnomalyWarning(severity, reason, result.your_average);
  }
}

// ── Show anomaly warning on Add form ──────────────────────
function showAnomalyWarning(severity, reason, average) {
  let warningEl = document.getElementById('anomaly-warning');
  if (!warningEl) return;

  const colors = {
    high  : { bg: '#ffeaea', color: 'var(--danger)',  label: 'HIGH RISK' },
    medium: { bg: '#fff3cd', color: '#856404',         label: 'WARNING'   },
  };
  const c = colors[severity] || colors.medium;

  warningEl.style.cssText = `
    display: block;
    padding: 10px 14px;
    background: ${c.bg};
    border: 1px solid ${c.color};
    border-radius: 8px;
    font-size: 0.85rem;
    color: ${c.color};
    margin-top: 10px;
    font-weight: 600;
  `;
  warningEl.innerHTML = `
    ${c.label}: ${reason}
    <span style="font-weight:400;display:block;margin-top:4px;">
      Your average expense: P${Number(average).toLocaleString()}
    </span>
  `;

  // Auto-hide after 8 seconds
  setTimeout(() => {
    if (warningEl) warningEl.style.display = 'none';
  }, 8000);
}

function clearAnomalyWarning() {
  const w = document.getElementById('anomaly-warning');
  if (w) w.style.display = 'none';
}