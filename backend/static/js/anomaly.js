// anomaly.js — Anomaly detection (computed from local IndexedDB, no server call)

// ── Load and display anomalies ─────────────────────────────
async function loadAnomalies() {
  const container = document.getElementById('anomaly-list');
  if (!container) return;

  const expenses = await getAllExpensesLocal();
  const anomalies = detectAnomaliesLocal(expenses);

  const summaryEl = document.getElementById('anomaly-summary');
  const high   = anomalies.filter(a => a.severity === 'high').length;
  const medium = anomalies.filter(a => a.severity === 'medium').length;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span style="background:#ffeaea;color:var(--danger);padding:4px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;margin-right:6px;">
        HIGH: ${high}
      </span>
      <span style="background:#fff3cd;color:#856404;padding:4px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;margin-right:6px;">
        MEDIUM: ${medium}
      </span>
      <span style="background:#d4edda;color:#155724;padding:4px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;">
        Scanned: ${expenses.length}
      </span>
    `;
  }

  if (anomalies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p style="color:var(--success);font-weight:600;">No anomalies detected!</p>
        <p style="font-size:0.85rem;margin-top:6px;color:var(--text-muted)">
          All ${expenses.length} transactions look normal.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  anomalies.forEach(a => container.appendChild(createAnomalyCard(a)));
}

// ── Detect anomalies from local data ──────────────────────
function detectAnomaliesLocal(expenses) {
  if (expenses.length < 3) return [];

  // Build per-category stats (avg + std dev)
  const catAmounts = {};
  expenses.forEach(e => {
    const cat = e.category || 'Others';
    if (!catAmounts[cat]) catAmounts[cat] = [];
    catAmounts[cat].push(parseFloat(e.amount || 0));
  });

  const catStats = {};
  Object.entries(catAmounts).forEach(([cat, amounts]) => {
    if (amounts.length < 2) return;
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const std = Math.sqrt(amounts.reduce((s, v) => s + (v - avg) ** 2, 0) / amounts.length);
    catStats[cat] = { avg, std };
  });

  // Overall average for fallback
  const allAmounts  = expenses.map(e => parseFloat(e.amount || 0));
  const overallAvg  = allAmounts.reduce((s, v) => s + v, 0) / allAmounts.length;
  const overallStd  = Math.sqrt(allAmounts.reduce((s, v) => s + (v - overallAvg) ** 2, 0) / allAmounts.length);

  const anomalies = [];

  expenses.forEach(e => {
    const amount  = parseFloat(e.amount || 0);
    const cat     = e.category || 'Others';
    const reasons = [];
    let score     = 0;

    const stats = catStats[cat] || { avg: overallAvg, std: overallStd };

    if (stats.std > 0) {
      const z = (amount - stats.avg) / stats.std;
      if (z > 3)      { score += 3; reasons.push(`Extremely high for ${cat} (${z.toFixed(1)}× std dev above avg)`); }
      else if (z > 2) { score += 2; reasons.push(`Unusually high for ${cat} (${z.toFixed(1)}× std dev above avg)`); }
      else if (z > 1.5) { score += 1; reasons.push(`Above average for ${cat}`); }
    }

    if (amount > overallAvg * 3) { score += 2; reasons.push(`3× your overall average spend`); }

    if (score === 0) return;

    anomalies.push({
      title:        e.title,
      amount,
      category:     cat,
      expense_date: e.expense_date || '',
      severity:     score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low',
      reasons,
      your_average: stats.avg,
    });
  });

  // Show worst first, cap at 20
  return anomalies
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);
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

// ── Check single expense before saving (local, no server call) ──
async function checkExpenseAnomaly(title, amount, category) {
  const expenses = await getAllExpensesLocal();
  if (expenses.length < 3) return;

  const catAmounts = expenses
    .filter(e => (e.category || 'Others') === (category || 'Others'))
    .map(e => parseFloat(e.amount || 0));

  if (catAmounts.length < 2) return;

  const avg = catAmounts.reduce((s, v) => s + v, 0) / catAmounts.length;
  const std = Math.sqrt(catAmounts.reduce((s, v) => s + (v - avg) ** 2, 0) / catAmounts.length);

  if (std === 0) return;

  const z = (amount - avg) / std;
  if (z > 2) {
    const severity = z > 3 ? 'high' : 'medium';
    showAnomalyWarning(
      severity,
      `This is unusually high for ${category || 'this category'}`,
      avg
    );
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