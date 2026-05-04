// advice.js — Financial Advice UI

// ── Load and display advice ────────────────────────────────
async function loadAdvice() {
  const container  = document.getElementById('advice-list');
  const scoreEl    = document.getElementById('health-score');
  const scoreLblEl = document.getElementById('health-label');
  if (!container) return;

  container.innerHTML = '<div class="spinner">Generating advice...</div>';

  const result = await API.request('/advice');

  if (!result || result.status !== 'success') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💡</div>
        <p>Could not generate advice.</p>
        <p style="font-size:0.85rem;margin-top:6px;">
          Make sure Flask is running and you have expense data.
        </p>
      </div>`;
    return;
  }

  // ── Health Score ───────────────────────────────────────
  if (scoreEl && scoreLblEl) {
    const score = result.health_score;
    const color = score >= 85 ? 'var(--success)'
                : score >= 70 ? '#00cec9'
                : score >= 50 ? 'var(--warning)'
                : score >= 30 ? 'var(--danger)'
                :               '#c0392b';

    scoreEl.innerHTML = `
      <div style="
        width: 120px; height: 120px;
        border-radius: 50%;
        background: conic-gradient(
          ${color} ${score * 3.6}deg,
          var(--border) 0deg
        );
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 12px;
        position: relative;
      ">
        <div style="
          width: 90px; height: 90px;
          border-radius: 50%;
          background: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        ">
          <span style="font-size:1.6rem;font-weight:800;
                       color:${color};">${score}</span>
          <span style="font-size:0.65rem;color:var(--text-muted);">
            / 100
          </span>
        </div>
      </div>
    `;
    scoreLblEl.textContent = result.health_label;
    scoreLblEl.style.color = color;
  }

  // ── Advice Cards ───────────────────────────────────────
  container.innerHTML = '';

  if (!result.advice || result.advice.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>Your finances look great! No issues found.</p>
      </div>`;
    return;
  }

  result.advice.forEach(item => {
    container.appendChild(createAdviceCard(item));
  });
}

// ── Create advice card ─────────────────────────────────────
function createAdviceCard(item) {
  const div = document.createElement('div');

  const styles = {
    danger : {
      bg    : '#ffeaea',
      border: 'var(--danger)',
      icon  : 'ALERT'
    },
    warning: {
      bg    : '#fff8e1',
      border: 'var(--warning)',
      icon  : 'WARNING'
    },
    success: {
      bg    : '#e8f8f0',
      border: 'var(--success)',
      icon  : 'GREAT'
    },
    info   : {
      bg    : 'rgba(108,99,255,0.06)',
      border: 'var(--primary)',
      icon  : 'TIP'
    },
    tip    : {
      bg    : '#e8f4fd',
      border: '#0984e3',
      icon  : 'WEEKLY'
    },
  };

  const s = styles[item.type] || styles.info;

  div.style.cssText = `
    background: ${s.bg};
    border: 1px solid ${s.border};
    border-left: 4px solid ${s.border};
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 12px;
  `;

  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;
                align-items:center;margin-bottom:8px;">
      <div style="font-weight:700;font-size:0.95rem;
                  color:var(--text);">
        ${item.title}
      </div>
      <span style="
        padding: 2px 8px;
        background: ${s.border};
        color: white;
        border-radius: 10px;
        font-size: 0.68rem;
        font-weight: 700;
        flex-shrink: 0;
        margin-left: 8px;
      ">${s.icon}</span>
    </div>
    <div style="font-size:0.88rem;color:var(--text-muted);
                line-height:1.6;">
      ${item.message}
    </div>
  `;

  return div;
}