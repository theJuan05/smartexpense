# expenses.py — Full expense CRUD API

from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one, execute
from security.encryption import encrypt, decrypt
from datetime import date

expenses_bp = Blueprint('expenses', __name__)


# ── GET /api/expenses ─────────────────────────────────────────
# Returns all expenses for a user (default user_id=1 for now)
@expenses_bp.route('/expenses', methods=['GET'])
def get_expenses():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    sql = """
        SELECT
            e.id,
            e.title,
            e.amount,
            e.expense_date,
            e.payment_method,
            e.notes,
            e.created_at,
            c.name  AS category,
            c.icon  AS category_icon,
            c.color AS category_color
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = %s
        ORDER BY e.expense_date DESC, e.created_at DESC
        LIMIT 500
    """
    rows = query_all(sql, (user_id,))

    # Convert date objects to strings; decrypt AES-256 encrypted fields
    for row in rows:
        if isinstance(row.get('expense_date'), date):
            row['expense_date'] = row['expense_date'].strftime('%Y-%m-%d')
        if row.get('created_at'):
            row['created_at'] = str(row['created_at'])
        if row.get('title'):
            row['title'] = decrypt(row['title'])
        if row.get('notes'):
            row['notes'] = decrypt(row['notes'])

    return jsonify({"status": "success", "data": rows, "count": len(rows)})


# ── POST /api/expenses ────────────────────────────────────────
# Adds a new expense to MySQL
@expenses_bp.route('/expenses', methods=['POST'])
def add_expense():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    data = request.get_json() or {}

    # ── Validate required fields ──────────────────────────────
    required = ['title', 'amount', 'expense_date']
    for field in required:
        if not data.get(field):
            return jsonify({
                "status" : "error",
                "message": f"Missing required field: {field}"
            }), 400

    try:
        amount = float(data['amount'])
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    # ── Find category_id from category name ───────────────────
    category_id = None
    if data.get('category'):
        cat = query_one(
            "SELECT id FROM categories WHERE name = %s LIMIT 1",
            (data['category'],)
        )
        if cat:
            category_id = cat['id']

    # ── Insert into MySQL ─────────────────────────────────────
    sql = """
        INSERT INTO expenses
            (user_id, category_id, title, amount, expense_date,
             notes, payment_method, synced)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, 1)
    """

    params = (
        user_id,
        category_id,
        encrypt(data['title'].strip()),
        amount,
        data['expense_date'],
        encrypt(data.get('notes', '')),
        data.get('payment_method', 'cash')
    )

    new_id = execute(sql, params)

    if new_id:
        import threading
        def _check_and_notify(uid):
            try:
                from routes.push import _send_to_all
                from models.db import query_all as _qa
                budgets = _qa("""
                    SELECT b.amount_limit,
                           COALESCE(c.name, 'Overall Budget') AS category,
                           COALESCE(SUM(e.amount), 0) AS spent
                    FROM budgets b
                    LEFT JOIN categories c ON b.category_id = c.id
                    LEFT JOIN expenses e
                        ON e.user_id = b.user_id
                        AND MONTH(e.expense_date) = MONTH(CURDATE())
                        AND YEAR(e.expense_date)  = YEAR(CURDATE())
                        AND (b.category_id IS NULL OR e.category_id = b.category_id)
                    WHERE b.user_id = %s
                    GROUP BY b.id, b.amount_limit, c.name
                """, (uid,))
                for b in (budgets or []):
                    limit = float(b['amount_limit'])
                    spent = float(b['spent'])
                    pct   = (spent / limit * 100) if limit > 0 else 0
                    cat   = b['category']
                    if pct >= 90:
                        _send_to_all(uid, f'Over Budget: {cat}',
                                     f"You've spent ₱{spent:,.0f} — {pct:.0f}% of your ₱{limit:,.0f} limit!")
                    elif pct >= 70:
                        _send_to_all(uid, f'Budget Warning: {cat}',
                                     f"You've used {pct:.0f}% of your ₱{limit:,.0f} monthly budget.")
            except Exception:
                pass
        threading.Thread(target=_check_and_notify, args=(user_id,), daemon=True).start()
        return jsonify({
            "status" : "success",
            "message": "Expense added successfully",
            "id"     : new_id
        }), 201
    else:
        return jsonify({
            "status" : "error",
            "message": "Failed to save expense"
        }), 500


# ── DELETE /api/expenses/<id> ─────────────────────────────────
# Deletes an expense by ID
@expenses_bp.route('/expenses/<int:expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    existing = query_one(
        "SELECT id FROM expenses WHERE id = %s AND user_id = %s", (expense_id, user_id)
    )
    if not existing:
        return jsonify({
            "status" : "error",
            "message": "Expense not found"
        }), 404

    execute("DELETE FROM expenses WHERE id = %s AND user_id = %s", (expense_id, user_id))
    return jsonify({
        "status" : "success",
        "message": f"Expense {expense_id} deleted"
    })


# ── DELETE /api/expenses (clear all) ─────────────────────────
@expenses_bp.route('/expenses', methods=['DELETE'])
def clear_all_expenses():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    execute("DELETE FROM expenses WHERE user_id = %s", (user_id,))
    return jsonify({"status": "success", "message": "All expenses deleted"})


# ── GET /api/categories ───────────────────────────────────────
# Returns all categories (for the add expense dropdown)
@expenses_bp.route('/categories', methods=['GET'])
def get_categories():
    rows = query_all(
        "SELECT id, name, icon, color FROM categories ORDER BY name"
    )
    return jsonify({"status": "success", "data": rows})