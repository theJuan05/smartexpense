// db.js — Complete IndexedDB Manager for SmartExpense AI Pro

const DB_NAME    = 'SmartExpenseDB';
const DB_VERSION = 2;
let db = null;

// ============================================================
// 1. INITIALIZE DATABASE
// ============================================================
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      db = event.target.result;

      // ── expenses store ──────────────────────────────────
      if (!db.objectStoreNames.contains('expenses')) {
        const expenseStore = db.createObjectStore('expenses', {
          keyPath: 'local_id',
          autoIncrement: true
        });
        expenseStore.createIndex('synced',       'synced',       { unique: false });
        expenseStore.createIndex('category',     'category',     { unique: false });
        expenseStore.createIndex('expense_date', 'expense_date', { unique: false });
        console.log('[IndexedDB] expenses store created ✅');
      }

      // ── sync_queue store (pending uploads) ──────────────
      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncStore = db.createObjectStore('sync_queue', {
          keyPath: 'queue_id',
          autoIncrement: true
        });
        syncStore.createIndex('status', 'status', { unique: false });
        console.log('[IndexedDB] sync_queue store created ✅');
      }

      // ── categories store (cached from server) ───────────
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
        console.log('[IndexedDB] categories store created ✅');
      }

      // ── budgets store ───────────────────────────────────
      if (!db.objectStoreNames.contains('budgets')) {
        db.createObjectStore('budgets', {
          keyPath: 'local_id',
          autoIncrement: true
        });
        console.log('[IndexedDB] budgets store created ✅');
      }

      // ── settings store (user prefs, last sync time) ─────
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
        console.log('[IndexedDB] settings store created ✅');
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('[IndexedDB] Database opened successfully ✅');
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Failed to open:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ============================================================
// 2. EXPENSES — Add, Get, Update, Delete
// ============================================================

/**
 * Save a new expense to IndexedDB.
 * synced: false = waiting to be sent to server
 */
function addExpenseLocal(expense) {
  return new Promise((resolve, reject) => {
    const record = {
      ...expense,
      synced:     0,
      created_at: new Date().toISOString()
    };

    const tx      = db.transaction('expenses', 'readwrite');
    const store   = tx.objectStore('expenses');
    const request = store.add(record);

    request.onsuccess = () => {
      console.log('[IndexedDB] Expense saved locally, id:', request.result);
      resolve(request.result);   // returns local_id
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get ALL expenses from IndexedDB (newest first).
 */
function getAllExpensesLocal() {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('expenses', 'readonly');
    const store   = tx.objectStore('expenses');
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort newest first
      const sorted = request.result.sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );
      resolve(sorted);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get only expenses that haven't been synced to server yet.
 */
function getUnsyncedExpenses() {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('expenses', 'readonly');
    const store   = tx.objectStore('expenses');
    const index   = store.index('synced');
    const request = index.getAll(0);   // 0 = not synced (IndexedDB stores boolean as 0/1)
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

/**
 * Mark an expense as synced (after successful server upload).
 * Also stores the server-assigned ID.
 */
function markExpenseSynced(local_id, server_id) {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('expenses', 'readwrite');
    const store   = tx.objectStore('expenses');
    const request = store.get(local_id);

    request.onsuccess = () => {
      const record   = request.result;
      record.synced    = 1;
      record.server_id = server_id;
      store.put(record).onsuccess = () => {
        console.log(`[IndexedDB] Expense ${local_id} marked as synced ✅`);
        resolve();
      };
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a single expense by local_id.
 */
function deleteExpenseLocal(local_id) {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('expenses', 'readwrite');
    const store   = tx.objectStore('expenses');
    const request = store.delete(local_id);

    request.onsuccess = () => {
      console.log(`[IndexedDB] Expense ${local_id} deleted`);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear ALL expenses from IndexedDB.
 */
function clearAllExpensesLocal() {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('expenses', 'readwrite');
    const store = tx.objectStore('expenses');
    const req   = store.clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ============================================================
// 3. CATEGORIES — Cache from server
// ============================================================

/**
 * Save categories fetched from Flask into IndexedDB.
 * So they're available offline.
 */
function saveCategoriesLocal(categories) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');

    categories.forEach(cat => store.put(cat));

    tx.oncomplete = () => {
      console.log(`[IndexedDB] ${categories.length} categories cached ✅`);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all cached categories from IndexedDB.
 */
function getCategoriesLocal() {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('categories', 'readonly');
    const store   = tx.objectStore('categories');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

// ============================================================
// 4. SETTINGS — Save/get user preferences & sync time
// ============================================================

function saveSetting(key, value) {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('settings', 'readwrite');
    const store   = tx.objectStore('settings');
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror  = () => reject(request.error);
  });
}

function getSetting(key) {
  return new Promise((resolve, reject) => {
    const tx      = db.transaction('settings', 'readonly');
    const store   = tx.objectStore('settings');
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror  = () => reject(request.error);
  });
}

// ============================================================
// 5. SYNC ENGINE — Push local data to Flask server
// ============================================================

/**
 * Main sync function.
 * Call this whenever the app comes back online.
 * Finds all unsynced expenses and sends them to Flask.
 */
async function syncToServer() {
  if (!navigator.onLine) {
    console.log('[Sync] Offline — sync skipped');
    return { synced: 0, failed: 0 };
  }

  const unsynced = await getUnsyncedExpenses();

  if (unsynced.length === 0) {
    console.log('[Sync] Nothing to sync ✅');
    return { synced: 0, failed: 0 };
  }

  console.log(`[Sync] Syncing ${unsynced.length} expense(s) to server...`);

  let synced = 0;
  let failed = 0;

  for (const expense of unsynced) {
    try {
      const result = await API.postExpense({
        title:          expense.title,
        amount:         expense.amount,
        category:       expense.category,
        expense_date:   expense.expense_date,
        notes:          expense.notes || '',
        payment_method: expense.payment_method || 'cash',
        user_id:        1   // hardcoded for now — auth comes later
      });

      if (result && result.status === 'success') {
        await markExpenseSynced(expense.local_id, result.id);
        synced++;
      } else {
        failed++;
      }
    } catch (err) {
      console.warn('[Sync] Failed for expense:', expense.local_id, err);
      failed++;
    }
  }

  // Save last sync timestamp
  await saveSetting('last_sync', new Date().toISOString());

  console.log(`[Sync] Done — ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

// ============================================================
// 6. PULL SYNC — Download server expenses into IndexedDB
// ============================================================

/**
 * Pull expenses from the server and import any that aren't
 * already in IndexedDB (identified by server_id).
 * Call this once on startup when online.
 */
async function pullExpensesFromServer() {
  if (!navigator.onLine) return 0;

  let serverData;
  try {
    const res = await fetch('/api/expenses');
    if (!res.ok) return 0;
    const json = await res.json();
    serverData = json.data;
    if (!Array.isArray(serverData) || serverData.length === 0) return 0;
  } catch (_) { return 0; }

  // Collect server_ids already stored locally
  const local     = await getAllExpensesLocal();
  const localIds  = new Set(local.map(e => e.server_id).filter(Boolean));

  // Only import expenses the local DB doesn't know about
  const toImport = serverData.filter(e => !localIds.has(e.id));
  if (toImport.length === 0) return 0;

  const tx    = db.transaction('expenses', 'readwrite');
  const store = tx.objectStore('expenses');

  for (const exp of toImport) {
    store.add({
      title:          exp.title,
      amount:         parseFloat(exp.amount),
      category:       exp.category || 'Others',
      expense_date:   exp.expense_date,
      notes:          exp.notes || '',
      payment_method: exp.payment_method || 'cash',
      synced:         1,
      server_id:      exp.id,
      created_at:     exp.created_at || new Date().toISOString(),
    });
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });

  console.log(`[Sync] Pulled ${toImport.length} expense(s) from server ✅`);
  return toImport.length;
}

// ============================================================
// 7. STATS — Quick summary for dashboard
// ============================================================

/**
 * Calculate total expenses, this month's total, and count.
 */
async function getLocalStats() {
  const expenses = await getAllExpensesLocal();

  const now       = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();

  let total      = 0;
  let thisMonthTotal = 0;

  expenses.forEach(exp => {
    const amount = parseFloat(exp.amount) || 0;
    total += amount;

    const date = new Date(exp.expense_date);
    if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
      thisMonthTotal += amount;
    }
  });

  return {
    total:      total.toFixed(2),
    thisMonth:  thisMonthTotal.toFixed(2),
    count:      expenses.length
  };
}