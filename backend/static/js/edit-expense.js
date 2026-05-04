// ── EXPENSE EDIT & DELETE (IndexedDB-backed) ──────────────────

// ── OPEN EDIT MODAL ───────────────────────────────────────────
async function openEditExpenseModal(localId) {
  const expenses = await getAllExpensesLocal();
  const expense  = expenses.find(e => e.local_id === localId);

  if (!expense) { showToast('Expense not found.'); return; }

  document.getElementById('edit-exp-id').value      = localId;
  document.getElementById('edit-exp-title').value   = expense.title          || '';
  document.getElementById('edit-exp-amount').value  = expense.amount         || '';
  document.getElementById('edit-exp-date').value    = expense.expense_date   || '';
  document.getElementById('edit-exp-notes').value   = expense.notes          || '';
  document.getElementById('edit-exp-payment').value = expense.payment_method || 'cash';

  const catSel = document.getElementById('edit-exp-category');
  if (catSel) catSel.value = expense.category || '';

  openModal('modal-edit-expense');
}

// ── SAVE EDITED EXPENSE ───────────────────────────────────────
async function saveEditedExpense() {
  const localId = parseInt(document.getElementById('edit-exp-id').value, 10);
  const title   = document.getElementById('edit-exp-title').value.trim();
  const amount  = document.getElementById('edit-exp-amount').value;
  const cat     = document.getElementById('edit-exp-category').value;
  const date    = document.getElementById('edit-exp-date').value;
  const notes   = document.getElementById('edit-exp-notes').value.trim();
  const pay     = document.getElementById('edit-exp-payment').value;

  if (!title)  { showToast('Title is required.');    return; }
  if (!amount) { showToast('Amount is required.');   return; }
  if (!date)   { showToast('Date is required.');     return; }

  await updateExpenseLocal(localId, {
    title,
    amount:         parseFloat(amount),
    category:       cat,
    expense_date:   date,
    notes,
    payment_method: pay,
  });

  closeModal('modal-edit-expense');
  showToast('Expense updated!');

  if (typeof renderExpenses === 'function') await renderExpenses();
}

// ── DELETE EXPENSE ────────────────────────────────────────────
async function deleteExpense(localId) {
  const expenses = await getAllExpensesLocal();
  const expense  = expenses.find(e => e.local_id === localId);

  if (!expense) { showToast('Expense not found.'); return; }

  document.getElementById('delete-expense-id').value = localId;
  document.getElementById('delete-expense-title').textContent =
    `"${expense.title}" — ₱${parseFloat(expense.amount).toFixed(2)}`;

  openModal('modal-confirm-delete');
}

async function confirmDeleteExpense() {
  const localId  = parseInt(document.getElementById('delete-expense-id').value, 10);
  const expenses = await getAllExpensesLocal();
  const expense  = expenses.find(e => e.local_id === localId);

  // Remove from server if already synced
  if (expense && expense.server_id) {
    await API.request(`/expenses/${expense.server_id}`, 'DELETE');
  }

  await deleteExpenseLocal(localId);
  closeModal('modal-confirm-delete');
  showToast('Expense deleted.');

  if (typeof renderExpenses === 'function') await renderExpenses();
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('load', () => {

  document.getElementById('btn-save-edit-expense')
    ?.addEventListener('click', saveEditedExpense);

  document.getElementById('btn-confirm-delete-expense')
    ?.addEventListener('click', confirmDeleteExpense);

  document.getElementById('btn-cancel-edit-expense')
    ?.addEventListener('click', () => closeModal('modal-edit-expense'));
  document.getElementById('btn-close-edit-expense')
    ?.addEventListener('click', () => closeModal('modal-edit-expense'));

  document.getElementById('btn-cancel-delete-expense')
    ?.addEventListener('click', () => closeModal('modal-confirm-delete'));
  document.getElementById('btn-close-delete-expense')
    ?.addEventListener('click', () => closeModal('modal-confirm-delete'));

  ['modal-edit-expense', 'modal-confirm-delete'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', function(e) {
      if (e.target === this) closeModal(this);
    });
  });

});
