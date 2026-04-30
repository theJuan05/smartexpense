// ── EXPORT FEATURES ──────────────────────────────────────────
// Uses IndexedDB via getAllExpensesLocal() from db.js
// Field names match db.js: expense_date, payment_method, title,
//                          amount, category, notes

// ── EXPORT TO CSV ─────────────────────────────────────────────
async function exportToCSV() {
  try {
    const expenses = await getAllExpensesLocal();

    if (!expenses || expenses.length === 0) {
      showToast('⚠️ No expenses to export.');
      return;
    }

    // CSV Headers
    const headers = [
      'Date',
      'Title',
      'Amount (PHP)',
      'Category',
      'Payment Method',
      'Notes'
    ];

    // Build CSV rows
    const rows = expenses.map(e => [
      e.expense_date     || '',
      `"${(e.title       || '').replace(/"/g, '""')}"`,
      parseFloat(e.amount || 0).toFixed(2),
      `"${(e.category    || '').replace(/"/g, '""')}"`,
      e.payment_method   || '',
      `"${(e.notes       || '').replace(/"/g, '""')}"`
    ]);

    // Add total row at bottom
    const total = expenses.reduce((sum, e) =>
      sum + parseFloat(e.amount || 0), 0);
    rows.push([]);
    rows.push(['', 'TOTAL', total.toFixed(2), '', '', '']);

    // Combine into CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    // Download
    const blob    = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const link    = document.createElement('a');
    const today   = new Date().toISOString().split('T')[0];
    link.href     = url;
    link.download = `smartexpense-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast(`✅ Exported ${expenses.length} expenses to CSV!`);

  } catch (err) {
    console.error('CSV export error:', err);
    showToast('❌ Export failed. Try again.');
  }
}

// ── EXPORT TO PDF ─────────────────────────────────────────────
async function exportToPDF() {
  try {
    const expenses = await getAllExpensesLocal();

    if (!expenses || expenses.length === 0) {
      showToast('⚠️ No expenses to export.');
      return;
    }

    const total = expenses.reduce((sum, e) =>
      sum + parseFloat(e.amount || 0), 0);

    const today = new Date().toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    // Group by category
    const byCategory = {};
    expenses.forEach(e => {
      const cat = e.category || 'Others';
      byCategory[cat] = (byCategory[cat] || 0) + parseFloat(e.amount || 0);
    });

    const catRows = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `
        <tr>
          <td>${cat}</td>
          <td style="text-align:right;">₱${amt.toFixed(2)}</td>
        </tr>`)
      .join('');

    const expRows = [...expenses]
      .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date))
      .map(e => `
        <tr>
          <td>${e.expense_date    || '—'}</td>
          <td>${e.title          || '—'}</td>
          <td>${e.category       || '—'}</td>
          <td style="text-align:right;">
            ₱${parseFloat(e.amount || 0).toFixed(2)}
          </td>
          <td>${e.payment_method || '—'}</td>
          <td>${e.notes          || '—'}</td>
        </tr>`)
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8"/>
        <title>SmartExpense Report — ${today}</title>
        <style>
          body  { font-family: Arial, sans-serif; padding: 32px;
                  color: #1a1a2e; font-size: 13px; }
          h1    { color: #6c63ff; margin-bottom: 4px; }
          h2    { color: #444; font-size: 14px; margin-top: 24px;
                  border-bottom: 2px solid #6c63ff; padding-bottom: 4px; }
          .meta { color: #888; font-size: 12px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th    { background: #6c63ff; color: white; padding: 8px 10px;
                  text-align: left; font-size: 12px; }
          td    { padding: 7px 10px; border-bottom: 1px solid #eee; }
          tr:nth-child(even) td { background: #f9f9fb; }
          .total-row td { font-weight: 700;
                          background: #f0eeff !important;
                          color: #6c63ff;
                          border-top: 2px solid #6c63ff; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        <h1>💰 SmartExpense AI Pro</h1>
        <div class="meta">Expense Report • Generated ${today}</div>

        <h2>Summary by Category</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${catRows}
            <tr class="total-row">
              <td>GRAND TOTAL</td>
              <td style="text-align:right;">₱${total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <h2>All Expenses (${expenses.length} transactions)</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Category</th>
              <th style="text-align:right;">Amount</th>
              <th>Payment</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${expRows}</tbody>
        </table>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);

    showToast('📄 PDF report opened — use Save as PDF in print dialog!');

  } catch (err) {
    console.error('PDF export error:', err);
    showToast('❌ Export failed. Try again.');
  }
}

// ── WIRE UP BUTTONS ───────────────────────────────────────────
window.addEventListener('load', () => {
  document.getElementById('btn-export-csv-settings')
    ?.addEventListener('click', exportToCSV);
  document.getElementById('btn-export-pdf-settings')
    ?.addEventListener('click', exportToPDF);
});