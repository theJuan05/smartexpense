// goals.js — Financial Goals Tracker (fully offline, IndexedDB)

// ── Goal icon SVG map ────────────────────────────────────────
function getGoalIconSVG(icon) {
  const s = (path) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const map = {
    '🎯': s('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
    '🏠': s('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    '📱': s('<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>'),
    '✈️': s('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-1 0-2 1-3.5 2.5L11 8 2.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L6 11l-2 3H3l-1 1 3 2 2 3 1-1v-1l3-2 3.5 4.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
    '🎓': s('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
    '💻': s('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8m-4-4v4"/>'),
    '🚗': s('<path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
    '💰': s('<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>'),
  };
  return map[icon] || map['🎯'];
}

// ── DB helpers ───────────────────────────────────────────────
function addGoalLocal(goal) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('goals', 'readwrite');
    const req = tx.objectStore('goals').put(goal);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function getGoalsLocal() {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('goals', 'readonly');
    const req = tx.objectStore('goals').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function updateGoalLocal(id, updates) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('goals', 'readwrite');
    const store = tx.objectStore('goals');
    const req   = store.get(id);
    req.onsuccess = () => {
      store.put({ ...req.result, ...updates }).onsuccess = () => resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

function deleteGoalLocal(id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('goals', 'readwrite');
    const req = tx.objectStore('goals').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Shared renderer ──────────────────────────────────────────
function _renderGoals(container, goals) {
  if (goals.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p style="font-weight:600;margin-bottom:6px;">No goals yet</p>
        <p style="font-size:0.85rem;color:var(--text-muted);">Set a savings goal and track your progress toward it.</p>
        <button class="btn btn-primary" style="margin-top:14px;" onclick="showAddGoalModal()">+ Create First Goal</button>
      </div>`;
    return;
  }
  container.innerHTML = '';
  goals.forEach(goal => container.appendChild(createGoalCard(goal)));
}

// ── Load and render goals list ───────────────────────────────
async function loadGoals() {
  const container = document.getElementById('goals-list');
  if (!container) return;

  // Instant render from local cache — no waiting
  let cached = [];
  try { cached = await getGoalsLocal(); } catch (_) {}
  _renderGoals(container, cached);

  // Fetch fresh data from server in background
  if (!navigator.onLine) return;
  try {
    const res = await fetch('/api/v1/goals');
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;

    const goals = data.map(g => ({
      id:            g.id,
      name:          g.name,
      icon:          g.icon || '🎯',
      targetAmount:  parseFloat(g.targetAmount  || 0),
      savedAmount:   parseFloat(g.savedAmount   || 0),
      deadline:      g.deadline      || null,
      contributions: g.contributions || [],
      createdAt:     g.createdAt     || new Date().toISOString(),
    }));

    // Update local cache
    try {
      const tx    = db.transaction('goals', 'readwrite');
      const store = tx.objectStore('goals');
      store.clear();
      goals.forEach(g => store.put(g));
    } catch (_) {}

    _renderGoals(container, goals);
  } catch (_) {}
}

function createGoalCard(goal) {
  const div    = document.createElement('div');
  const saved  = parseFloat(goal.savedAmount  || 0);
  const target = parseFloat(goal.targetAmount || 0);
  const pct    = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const remain = Math.max(0, target - saved);
  const done   = pct >= 100;

  div.className = 'goal-card' + (done ? ' goal-card--done' : '');

  let etaHtml = '';
  if (goal.deadline) {
    const days = Math.ceil((new Date(goal.deadline) - new Date()) / 86400000);
    if (days > 0) {
      etaHtml = `<span class="goal-eta">${days}d left</span>`;
    } else if (!done) {
      etaHtml = `<span class="goal-eta goal-eta--over">Past deadline</span>`;
    }
  }

  const contributions = goal.contributions || [];
  const logHtml       = contributions.length === 0 ? '' : `
    <div class="goal-log">
      ${[...contributions].reverse().map(c => `
        <div class="goal-log-entry">
          <span class="goal-log-date">${new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
          <span class="goal-log-amount">+₱${Number(c.amount).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        </div>`).join('')}
    </div>`;

  div.innerHTML = `
    <div class="goal-card-header">
      <div class="goal-icon">${getGoalIconSVG(goal.icon)}</div>
      <div class="goal-info">
        <div class="goal-name">${_esc(goal.name)}</div>
        <div class="goal-amounts">
          <span class="goal-saved">₱${saved.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          <span class="goal-sep">of</span>
          <span class="goal-target">₱${target.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          ${etaHtml}
        </div>
      </div>
      <button class="goal-delete" onclick="deleteGoalUI(${goal.id})" aria-label="Delete goal">✕</button>
    </div>
    <div class="goal-progress-track">
      <div class="goal-progress-fill${done ? ' goal-progress-fill--done' : ''}" style="width:${pct}%"></div>
    </div>
    <div class="goal-footer">
      <span class="goal-pct">${pct}% complete</span>
      ${done
        ? `<span class="goal-done-badge">🎉 Achieved!</span>`
        : `<button class="goal-fund-btn" data-id="${goal.id}" data-name="${_esc(goal.name)}" data-remain="${remain}" onclick="showFundGoalModal(parseInt(this.dataset.id), this.dataset.name, parseFloat(this.dataset.remain))">+ Fund</button>`
      }
    </div>
    ${logHtml}`;

  return div;
}

// ── Add goal modal ───────────────────────────────────────────
function showAddGoalModal() {
  const modal = document.getElementById('modal-add-goal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('goal-name-input').value     = '';
  document.getElementById('goal-target-input').value   = '';
  document.getElementById('goal-deadline-input').value = '';
  document.querySelectorAll('.goal-icon-btn').forEach((b, i) => b.classList.toggle('selected', i === 0));
}

function closeAddGoalModal() {
  const modal = document.getElementById('modal-add-goal');
  if (modal) modal.style.display = 'none';
}

async function saveNewGoal() {
  const name     = document.getElementById('goal-name-input').value.trim();
  const target   = parseFloat(document.getElementById('goal-target-input').value);
  const deadline = document.getElementById('goal-deadline-input').value;
  const icon     = document.querySelector('.goal-icon-btn.selected')?.dataset.icon || '🎯';

  if (!name)                  { showToast('Please enter a goal name', 'warning');        return; }
  if (!target || target <= 0) { showToast('Please enter a valid target amount', 'warning'); return; }

  const goalData = {
    name,
    targetAmount: target,
    savedAmount:  0,
    icon,
    deadline:     deadline || null,
    createdAt:    new Date().toISOString(),
    contributions: [],
  };

  // Save to server first so we get the real ID
  let synced = false;
  try {
    const res  = await fetch('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalData),
    });
    const data = await res.json();
    if (data.id) { goalData.id = data.id; synced = true; }
  } catch (_) {}

  await addGoalLocal(goalData);
  closeAddGoalModal();
  await loadGoals();
  if (typeof renderGoalsSummary === 'function') await renderGoalsSummary();
  showToast(synced ? 'Goal created!' : 'Goal saved locally — server sync failed', synced ? 'success' : 'warning');
}

// ── Fund goal modal ──────────────────────────────────────────
function showFundGoalModal(goalId, goalName, remaining) {
  const modal = document.getElementById('modal-fund-goal');
  if (!modal) return;
  modal.style.display  = 'flex';
  modal.dataset.goalId = goalId;
  document.getElementById('fund-goal-title').textContent  = `Fund "${goalName}"`;
  document.getElementById('fund-remaining').textContent   = `₱${Number(remaining).toLocaleString()} remaining`;
  document.getElementById('fund-amount-input').value      = '';
}

function closeFundGoalModal() {
  const modal = document.getElementById('modal-fund-goal');
  if (modal) modal.style.display = 'none';
}

async function confirmFund() {
  const modal  = document.getElementById('modal-fund-goal');
  const goalId = parseInt(modal.dataset.goalId);
  const amount = parseFloat(document.getElementById('fund-amount-input').value);

  if (!amount || amount <= 0) { showToast('Please enter a valid amount', 'warning'); return; }

  // Resolve goal — try local first, fall back to server
  let goal = null;
  try {
    const localGoals = await getGoalsLocal();
    goal = localGoals.find(g => g.id === goalId) || null;
  } catch (_) {}

  if (!goal && navigator.onLine) {
    try {
      const res  = await fetch('/api/v1/goals');
      const data = await res.json();
      if (Array.isArray(data)) goal = data.find(g => g.id === goalId) || null;
    } catch (_) {}
  }

  if (!goal) { showToast('Goal not found', 'warning'); return; }

  // Use atomic server-side fund endpoint (avoids race condition)
  let newSaved = (parseFloat(goal.savedAmount) || 0) + amount;
  if (navigator.onLine) {
    try {
      const res  = await fetch(`/api/v1/goals/${goalId}/fund`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount, date: new Date().toISOString() }),
      });
      const data = await res.json();
      if (data.status === 'success') newSaved = data.savedAmount;
    } catch (_) {}
  }

  // Update local cache to match
  const contributions = [...(goal.contributions || []), { amount, date: new Date().toISOString() }];
  await updateGoalLocal(goalId, { savedAmount: newSaved, contributions });

  closeFundGoalModal();
  await loadGoals();
  if (typeof renderGoalsSummary === 'function') await renderGoalsSummary();
  if (typeof renderBalance      === 'function') await renderBalance();

  if (newSaved >= parseFloat(goal.targetAmount)) {
    showToast(`🎉 Goal "${goal.name}" achieved!`, 'success');
  } else {
    showToast(`₱${Number(amount).toLocaleString()} added to "${goal.name}"`, 'success');
  }
}

// ── Delete ───────────────────────────────────────────────────
async function deleteGoalUI(id) {
  if (!confirm('Delete this goal?')) return;
  await deleteGoalLocal(id);
  fetch(`/api/v1/goals/${id}`, { method: 'DELETE' }).catch(() => {});
  await loadGoals();
  if (typeof renderGoalsSummary === 'function') await renderGoalsSummary();
  showToast('Goal deleted');
}

// ── Icon picker ──────────────────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.goal-icon-btn');
  if (!btn) return;
  document.querySelectorAll('.goal-icon-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
});
