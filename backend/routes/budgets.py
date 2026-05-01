# budgets.py — Full Budget CRUD API

from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one, execute
from datetime import date, datetime

budgets_bp = Blueprint('budgets', __name__)


# ── GET /api/budgets ───────────────────────────────────────
@budgets_bp.route('/budgets', methods=['GET'])
def get_budgets():
    user_id = session.get('user_id', 1)

    sql = """
        SELECT
            b.id,
            b.amount_limit,
            b.period,
            b.start_date,
            COALESCE(c.name, 'Overall Budget') AS category,
            c.icon  AS category_icon,
            c.color AS category_color
        FROM budgets b
        LEFT JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = %s
        ORDER BY b.id
    """
    rows = query_all(sql, (user_id,))

    for row in rows:
        if isinstance(row.get('start_date'), date):
            row['start_date'] = row['start_date'].strftime('%Y-%m-%d')

    return jsonify({"status": "success", "data": rows})


# ── POST /api/budgets ──────────────────────────────────────
@budgets_bp.route('/budgets', methods=['POST'])
def add_budget():
    data = request.get_json()

    required = ['amount_limit', 'period']
    for field in required:
        if not data.get(field):
            return jsonify({
                "status" : "error",
                "message": f"Missing field: {field}"
            }), 400

    try:
        amount = float(data['amount_limit'])
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    # Find category_id if category name provided
    category_id = None
    if data.get('category') and data['category'] != 'Overall Budget':
        cat = query_one(
            "SELECT id FROM categories WHERE name = %s LIMIT 1",
            (data['category'],)
        )
        if cat:
            category_id = cat['id']

    user_id = session.get('user_id', 1)

    # Check if budget already exists for this category
    existing = query_one("""
        SELECT id FROM budgets
        WHERE user_id = %s
        AND (
            (category_id IS NULL AND %s IS NULL)
            OR category_id = %s
        )
        AND period = %s
        LIMIT 1
    """, (user_id, category_id, category_id, data['period']))

    if existing:
        # ── UPDATE existing budget ─────────────────────────
        execute("""
            UPDATE budgets
            SET amount_limit = %s
            WHERE id = %s
        """, (amount, existing['id']))

        return jsonify({
            "status" : "success",
            "message": "Budget updated successfully",
            "id"     : existing['id'],
            "action" : "updated"
        }), 200

    else:
        # ── INSERT new budget ──────────────────────────────
        start_date = date.today().replace(day=1).strftime('%Y-%m-%d')
        new_id = execute("""
            INSERT INTO budgets
                (user_id, category_id, amount_limit, period, start_date)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, category_id, amount, data['period'], start_date))

        if new_id:
            return jsonify({
                "status" : "success",
                "message": "Budget created successfully",
                "id"     : new_id,
                "action" : "created"
            }), 201

        return jsonify({
            "status" : "error",
            "message": "Failed to save budget"
        }), 500


# ── DELETE /api/budgets/<id> ───────────────────────────────
@budgets_bp.route('/budgets/<int:budget_id>', methods=['DELETE'])
def delete_budget(budget_id):
    existing = query_one(
        "SELECT id FROM budgets WHERE id = %s", (budget_id,)
    )
    if not existing:
        return jsonify({"status": "error", "message": "Not found"}), 404

    execute("DELETE FROM budgets WHERE id = %s", (budget_id,))
    return jsonify({"status": "success", "message": f"Budget {budget_id} deleted"})


# ── GET /api/budgets/summary ───────────────────────────────
# Returns budgets with actual spending this month
@budgets_bp.route('/budgets/summary', methods=['GET'])
def budget_summary():
    user_id = session.get('user_id', 1)

    sql = """
        SELECT
            b.id,
            b.amount_limit,
            b.period,
            COALESCE(c.name, 'Overall Budget') AS category,
            c.icon AS category_icon,
            COALESCE(SUM(e.amount), 0) AS spent
        FROM budgets b
        LEFT JOIN categories c ON b.category_id = c.id
        LEFT JOIN expenses e
            ON  e.user_id = b.user_id
            AND MONTH(e.expense_date) = MONTH(CURDATE())
            AND YEAR(e.expense_date)  = YEAR(CURDATE())
            AND (b.category_id IS NULL OR e.category_id = b.category_id)
        WHERE b.user_id = %s
        GROUP BY b.id, b.amount_limit, b.period, c.name, c.icon
        ORDER BY b.id
    """
    rows = query_all(sql, (user_id,))

    for row in rows:
        limit   = float(row['amount_limit'])
        spent   = float(row['spent'])
        pct     = (spent / limit * 100) if limit > 0 else 0
        row['spent']      = round(spent, 2)
        row['amount_limit'] = round(limit, 2)
        row['percentage'] = round(pct, 1)
        row['status']     = (
            'danger'  if pct >= 90 else
            'warning' if pct >= 70 else
            'ok'
        )

    return jsonify({"status": "success", "data": rows})