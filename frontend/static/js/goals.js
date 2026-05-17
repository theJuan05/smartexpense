// goals.js — Financial Goals Tracker (fully offline, IndexedDB)

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

// ── Load and render goals list ───────────────────────────────
async function loadGoals() {
  const container = document.getElementById('goals-list');
  if (!container) return;

  const goals = await getGoalsLocal();

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
          <span class="goal-log-amount">+₱${Number(c.amount).toLocaleString()}</span>
        </div>`).join('')}
    </div>`;

  div.innerHTML = `
    <div class="goal-card-header">
      <div class="goal-icon">${goal.icon || '🎯'}</div>
      <div class="goal-info">
        <div class="goal-name">${_esc(goal.name)}</div>
        <div class="goal-amounts">
          <span class="goal-saved">₱${saved.toLocaleString()}</span>
          <span class="goal-sep">of</span>
          <span class="goal-target">₱${target.toLocaleString()}</span>
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
        : `<button class="goal-fund-btn" onclick="showFundGoalModal(${goal.id}, '${_esc(goal.name)}', ${remain})">+ Fund</button>`
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
  try {
    const res  = await fetch('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalData),
    });
    const data = await res.json();
    if (data.id) goalData.id = data.id;
  } catch (_) {}

  await addGoalLocal(goalData);
  closeAddGoalModal();
  await loadGoals();
  if (typeof renderGoalsSummary === 'function') await renderGoalsSummary();
  showToast('Goal created!', 'success');
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

  const goals = await getGoalsLocal();
  const goal  = goals.find(g => g.id === goalId);
  if (!goal) return;

  const newSaved      = (parseFloat(goal.savedAmount) || 0) + amount;
  const contributions = [...(goal.contributions || []), { amount, date: new Date().toISOString() }];
  await updateGoalLocal(goalId, { savedAmount: newSaved, contributions });

  // Sync to server
  fetch(`/api/v1/goals/${goalId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedAmount: newSaved, contributions }),
  }).catch(() => {});

  closeFundGoalModal();
  await loadGoals();
  if (typeof renderGoalsSummary === 'function') await renderGoalsSummary();
  if (typeof renderBalance      === 'function') await renderBalance();

  if (newSaved >= goal.targetAmount) {
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
