// ── EXPENSE EDIT & DELETE ─────────────────────────────────────
// This works by adding Edit and Delete buttons to each expense
// in the expenses list, then opening a modal to edit or confirm delete.

// ── OPEN EDIT MODAL ───────────────────────────────────────────
function openEditExpenseModal(expenseId) {
  const raw      = localStorage.getItem('expenses') || '[]';
  const expenses = JSON.parse(raw);
  const expense  = expenses.find(e => e.id === expenseId);

  if (!expense) {
    showToast('❌ Expense not found.');
    return;
  }

  // Fill form with existing data
  document.getElementById('edit-exp-id').value       = expense.id;
  document.getElementById('edit-exp-title').value    = expense.title    || '';
  document.getElementById('edit-exp-amount').value   = expense.amount   || '';
  document.getElementById('edit-exp-date').value     = expense.date     || '';
  document.getElementById('edit-exp-notes').value    = expense.notes    || '';
  document.getElementById('edit-exp-payment').value  = expense.payment  || 'cash';

  // Set category dropdown
  const catSel = document.getElementById('edit-exp-category');
  if (catSel) {
    for (const opt of catSel.options) {
      if (opt.value === expense.category) {
        catSel.value = expense.category;
        break;
      }
    }
  }

  openModal('modal-edit-expense');
}

// ── SAVE EDITED EXPENSE ───────────────────────────────────────
function saveEditedExpense() {
  const id     = document.getElementById('edit-exp-id').value;
  const title  = document.getElementById('edit-exp-title').value.trim();
  const amount = document.getElementById('edit-exp-amount').value;
  const cat    = document.getElementById('edit-exp-category').value;
  const date   = document.getElementById('edit-exp-date').value;
  const notes  = document.getElementById('edit-exp-notes').value.trim();
  const pay    = document.getElementById('edit-exp-payment').value;

  if (!title)  { showToast('⚠️ Title is required.');  return; }
  if (!amount) { showToast('⚠️ Amount is required.'); return; }
  if (!cat)    { showToast('⚠️ Category is required.'); return; }
  if (!date)   { showToast('⚠️ Date is required.');   return; }

  const raw      = localStorage.getItem('expenses') || '[]';
  const expenses = JSON.parse(raw);
  const index    = expenses.findIndex(e => e.id === id);

  if (index === -1) {
    showToast('❌ Expense not found.');
    return;
  }

  // Update expense
  expenses[index] = {
    ...expenses[index],
    title,
    amount:   parseFloat(amount),
    category: cat,
    date,
    notes,
    payment:  pay,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem('expenses', JSON.stringify(expenses));
  closeEditExpenseModal();
  showToast('✅ Expense updated!');

  // Refresh expense list if function exists
  if (typeof renderExpenses === 'function')    renderExpenses();
  if (typeof updateDashboard === 'function')   updateDashboard();
  if (typeof renderCharts === 'function')      renderCharts();
}

// ── DELETE EXPENSE ────────────────────────────────────────────
function deleteExpense(expenseId) {
  const raw      = localStorage.getItem('expenses') || '[]';
  const expenses = JSON.parse(raw);
  const expense  = expenses.find(e => e.id === expenseId);

  if (!expense) { showToast('❌ Expense not found.'); return; }

  // Store ID for confirm button
  document.getElementById('delete-expense-id').value = expenseId;
  document.getElementById('delete-expense-title').textContent =
    `"${expense.title}" — ₱${parseFloat(expense.amount).toFixed(2)}`;

  openModal('modal-confirm-delete');
}

function confirmDeleteExpense() {
  const id       = document.getElementById('delete-expense-id').value;
  const raw      = localStorage.getItem('expenses') || '[]';
  let expenses   = JSON.parse(raw);
  expenses       = expenses.filter(e => e.id !== id);

  localStorage.setItem('expenses', JSON.stringify(expenses));
  closeDeleteModal();
  showToast('🗑️ Expense deleted.');

  // Refresh
  if (typeof renderExpenses === 'function')    renderExpenses();
  if (typeof updateDashboard === 'function')   updateDashboard();
  if (typeof renderCharts === 'function')      renderCharts();
}

// ── CLOSE MODALS ──────────────────────────────────────────────
function closeEditExpenseModal() {
  closeModal('modal-edit-expense');
}

function closeDeleteModal() {
  closeModal('modal-confirm-delete');
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('load', () => {

  document.getElementById('btn-save-edit-expense')
    ?.addEventListener('click', saveEditedExpense);

  document.getElementById('btn-confirm-delete-expense')
    ?.addEventListener('click', confirmDeleteExpense);

  document.getElementById('btn-cancel-edit-expense')
    ?.addEventListener('click', closeEditExpenseModal);
  document.getElementById('btn-close-edit-expense')
    ?.addEventListener('click', closeEditExpenseModal);

  document.getElementById('btn-cancel-delete-expense')
    ?.addEventListener('click', closeDeleteModal);
  document.getElementById('btn-close-delete-expense')
    ?.addEventListener('click', closeDeleteModal);

  // Close on backdrop click
  ['modal-edit-expense','modal-confirm-delete'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(e) {
      if (e.target === this) closeModal(this);
    });
  });

});