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
    await loadLocalAdvice();
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

// ── Local insight engine (fully offline, IndexedDB-powered) ──
async function loadLocalAdvice() {
  const container  = document.getElementById('advice-list');
  const scoreEl    = document.getElementById('health-score');
  const scoreLblEl = document.getElementById('health-label');
  if (!container) return;

  const expenses = await getAllExpensesLocal();
  const budgets  = (await getSetting('budget_cache')) || [];
  const income   = parseFloat(localStorage.getItem('se_income') || '0');

  const now           = new Date();
  const thisYear      = now.getFullYear();
  const thisMonth     = now.getMonth();
  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastYear      = lastMonthDate.getFullYear();
  const lastMonth     = lastMonthDate.getMonth();
  const daysInMonth   = new Date(thisYear, thisMonth + 1, 0).getDate();
  const dayOfMonth    = now.getDate();
  const daysLeft      = daysInMonth - dayOfMonth;

  const thisMonthExp = expenses.filter(e => {
    if (!e.expense_date) return false;
    const d = new Date(e.expense_date + 'T00:00:00');
    return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
  });
  const lastMonthExp = expenses.filter(e => {
    if (!e.expense_date) return false;
    const d = new Date(e.expense_date + 'T00:00:00');
    return d.getFullYear() === lastYear && d.getMonth() === lastMonth;
  });

  const thisTotal = thisMonthExp.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const lastTotal = lastMonthExp.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  // Category totals this month
  const catTotals = {};
  thisMonthExp.forEach(e => {
    const cat = e.category || 'Others';
    catTotals[cat] = (catTotals[cat] || 0) + parseFloat(e.amount || 0);
  });
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  const overallBudget = budgets.find(b => b.category === 'Overall Budget');
  const budgetLimit   = overallBudget ? overallBudget.amount_limit : 0;
  const catBudgets    = budgets.filter(b => b.category !== 'Overall Budget');

  const dailyAvg  = dayOfMonth > 0 ? thisTotal / dayOfMonth : 0;
  const projected = thisTotal + dailyAvg * daysLeft;

  // Day-of-week average
  const dayTotals = [0,0,0,0,0,0,0];
  const dayCounts = [0,0,0,0,0,0,0];
  expenses.forEach(e => {
    if (!e.expense_date) return;
    const d = new Date(e.expense_date + 'T00:00:00');
    dayTotals[d.getDay()] += parseFloat(e.amount || 0);
    dayCounts[d.getDay()]++;
  });
  const dayAvgs   = dayTotals.map((t, i) => dayCounts[i] > 0 ? t / dayCounts[i] : 0);
  const maxDayIdx = dayAvgs.indexOf(Math.max(...dayAvgs));
  const dayNames  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const savingsRate = income > 0 ? ((income - thisTotal) / income) * 100 : null;

  // ── Health score ──────────────────────────────────────────
  let score = 60;

  if (savingsRate !== null) {
    if      (savingsRate >= 20) score += 20;
    else if (savingsRate >= 10) score += 10;
    else if (savingsRate < 0)   score -= 20;
  }

  if (budgetLimit > 0) {
    const pct = (thisTotal / budgetLimit) * 100;
    if      (pct < 70)   score += 10;
    else if (pct < 90)   score += 5;
    else if (pct >= 100) score -= 15;
    else                 score -= 5;
  } else if (thisTotal > 0 && lastTotal > 0) {
    const trend = (thisTotal - lastTotal) / lastTotal;
    if      (trend < -0.1) score += 5;
    else if (trend >  0.2) score -= 10;
  }

  catBudgets.forEach(b => {
    const spent = catTotals[b.category] || 0;
    const pct   = b.amount_limit > 0 ? spent / b.amount_limit : 0;
    if      (pct >= 1)   score -= 5;
    else if (pct >= 0.8) score -= 2;
    else if (pct < 0.7)  score += 1;
  });

  score = Math.max(10, Math.min(100, Math.round(score)));

  const healthLabel = score >= 85 ? 'Excellent'
                    : score >= 70 ? 'Good'
                    : score >= 50 ? 'Fair'
                    : score >= 30 ? 'Needs Attention'
                    :               'Critical';
  const color = score >= 85 ? 'var(--success)'
              : score >= 70 ? '#00cec9'
              : score >= 50 ? 'var(--warning)'
              : score >= 30 ? 'var(--danger)'
              :               '#c0392b';

  if (scoreEl && scoreLblEl) {
    scoreEl.innerHTML = `
      <div style="width:120px;height:120px;border-radius:50%;
        background:conic-gradient(${color} ${score*3.6}deg,var(--border) 0deg);
        display:flex;align-items:center;justify-content:center;
        margin:0 auto 12px;position:relative;">
        <div style="width:90px;height:90px;border-radius:50%;background:white;
          display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <span style="font-size:1.6rem;font-weight:800;color:${color};">${score}</span>
          <span style="font-size:0.65rem;color:var(--text-muted);">/ 100</span>
        </div>
      </div>`;
    scoreLblEl.textContent = healthLabel;
    scoreLblEl.style.color = color;
  }

  // ── Generate tips ─────────────────────────────────────────
  const fmt  = v => '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const tips = [];

  // 1. Top spending category
  if (sortedCats.length > 0) {
    const [topCat, topAmt] = sortedCats[0];
    const pct = thisTotal > 0 ? ((topAmt / thisTotal) * 100).toFixed(0) : 0;
    tips.push({
      type: topAmt > thisTotal * 0.5 ? 'warning' : 'info',
      title: `Top Category: ${topCat}`,
      message: `${fmt(topAmt)} — ${pct}% of your spending this month. ${topAmt > thisTotal * 0.5 ? 'Over half your spending is in one category. Consider diversifying.' : 'Looks balanced against your other categories.'}`
    });
  }

  // 2. Spending pace projection
  if (dailyAvg > 0) {
    const overUnder = budgetLimit > 0
      ? projected > budgetLimit
        ? ` That puts you <strong>${fmt(projected - budgetLimit)} over budget</strong>.`
        : ` You'll stay within budget with ${fmt(budgetLimit - projected)} to spare.`
      : '';
    tips.push({
      type: budgetLimit > 0 && projected > budgetLimit ? 'warning' : 'info',
      title: 'Spending Pace',
      message: `Daily average: ${fmt(dailyAvg)}. At this pace, you'll spend <strong>${fmt(projected)}</strong> this month.${overUnder}`
    });
  }

  // 3. Month vs last month
  if (lastTotal > 0) {
    const diff    = thisTotal - lastTotal;
    const pct     = Math.abs((diff / lastTotal) * 100).toFixed(0);
    const more    = diff > 0;
    tips.push({
      type: more && diff / lastTotal > 0.2 ? 'warning' : more ? 'info' : 'success',
      title: 'Month vs Last Month',
      message: `You've spent ${more ? fmt(diff) + ' more' : fmt(Math.abs(diff)) + ' less'} than last month (${pct}% ${more ? 'increase' : 'decrease'}). ${!more ? 'Great job keeping costs down!' : diff / lastTotal > 0.2 ? 'Your spending is accelerating — review your categories.' : 'A slight uptick — keep an eye on it.'}`
    });
  }

  // 4. Savings rate
  if (savingsRate !== null) {
    const saved = income - thisTotal;
    tips.push({
      type: savingsRate >= 20 ? 'success' : savingsRate >= 0 ? 'info' : 'danger',
      title: 'Savings Rate This Month',
      message: savingsRate >= 0
        ? `${fmt(thisTotal)} spent of ${fmt(income)} income — <strong>${savingsRate.toFixed(0)}% savings rate</strong>. ${savingsRate >= 20 ? 'Excellent discipline!' : savingsRate >= 10 ? 'On track. Aim for 20%+.' : 'Try to cut back so you can save more.'} You've set aside ${fmt(Math.max(0, saved))} so far.`
        : `You're <strong>${fmt(Math.abs(saved))} over your income</strong> this month. Cut non-essential spending immediately.`
    });
  }

  // 5. Over-budget categories
  catBudgets.forEach(b => {
    const spent = catTotals[b.category] || 0;
    const pct   = b.amount_limit > 0 ? Math.round(spent / b.amount_limit * 100) : 0;
    if (pct >= 100) {
      tips.push({
        type: 'danger',
        title: `Over Budget: ${b.category}`,
        message: `${fmt(spent)} spent vs ${fmt(b.amount_limit)} limit (${pct}%). Stop new ${b.category} expenses until next month.`
      });
    } else if (pct >= 80) {
      tips.push({
        type: 'warning',
        title: `Near Limit: ${b.category}`,
        message: `${fmt(spent)} of ${fmt(b.amount_limit)} used (${pct}%). Only ${fmt(b.amount_limit - spent)} left — spend carefully.`
      });
    }
  });

  // 6. Day-of-week pattern (needs enough data)
  if (expenses.length >= 10 && dayAvgs[maxDayIdx] > 0) {
    tips.push({
      type: 'tip',
      title: `Highest Spend Day: ${dayNames[maxDayIdx]}s`,
      message: `You average ${fmt(dayAvgs[maxDayIdx])} on ${dayNames[maxDayIdx]}s — your most expensive day. Plan bigger purchases on lower-spend days to smooth out your budget.`
    });
  }

  // 7. Biggest expense this month
  if (thisMonthExp.length > 0) {
    const top = thisMonthExp.reduce((m, e) =>
      parseFloat(e.amount || 0) > parseFloat(m.amount || 0) ? e : m, thisMonthExp[0]);
    const topPct = thisTotal > 0 ? ((parseFloat(top.amount) / thisTotal) * 100).toFixed(0) : 0;
    tips.push({
      type: 'info',
      title: 'Biggest Expense This Month',
      message: `"${top.title}" on ${top.expense_date || '?'} — ${fmt(parseFloat(top.amount || 0))} (${topPct}% of your month total).`
    });
  }

  // ── Render ────────────────────────────────────────────────
  container.innerHTML = '';

  if (tips.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>Add more expenses to generate insights.</p>
      </div>`;
    return;
  }

  const badge = document.createElement('p');
  badge.className = 'local-advice-badge';
  badge.textContent = 'Generated locally from your data · AI-powered when online';
  container.appendChild(badge);

  tips.forEach(t => container.appendChild(createAdviceCard(t)));
}

// ── Create advice card ─────────────────────────────────────
function createAdviceCard(item) {
  const div = document.createElement('div');

  const typeMap  = { danger: 'danger', warning: 'warning', success: 'success', info: 'info', tip: 'info' };
  const badgeMap = { danger: 'ALERT', warning: 'WARNING', success: 'GREAT', info: 'TIP', tip: 'WEEKLY' };

  const typeClass = typeMap[item.type]  || 'info';
  const badge     = badgeMap[item.type] || 'TIP';

  div.className = `alert-card alert-card--${typeClass}`;
  div.innerHTML = `
    <div class="alert-card-header">
      <div class="alert-card-title">${item.title}</div>
      <span class="alert-card-badge">${badge}</span>
    </div>
    <div class="alert-card-body">${item.message}</div>
  `;

  return div;
}