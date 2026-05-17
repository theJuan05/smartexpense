# anomaly.py — Anomaly Detection Engine

from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one
from security.encryption import decrypt
from datetime import date, timedelta
from collections import defaultdict
import statistics

anomaly_bp = Blueprint('anomaly', __name__)


# ── Helper: fetch recent expenses ─────────────────────────
def get_recent_expenses(user_id, days=90):
    """Get expenses from last N days."""
    start = (date.today() - timedelta(days=days)).strftime('%Y-%m-%d')
    sql = """
        SELECT
            e.id,
            e.title,
            e.amount,
            e.expense_date,
            e.created_at,
            COALESCE(c.name, 'Others') AS category
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = %s
        AND e.expense_date >= %s
        ORDER BY e.expense_date DESC
    """
    rows = query_all(sql, (user_id, start))
    for row in rows:
        if isinstance(row.get('expense_date'), date):
            row['expense_date'] = row['expense_date'].strftime('%Y-%m-%d')
        if row.get('created_at'):
            row['created_at'] = str(row['created_at'])
        if row.get('title'):
            row['title'] = decrypt(row['title'])
        row['amount'] = float(row['amount'])
    return rows


# ── Core: detect anomalies in a list of expenses ──────────
def detect_anomalies(expenses):
    """
    Runs multiple anomaly checks and returns flagged expenses.
    Each anomaly has a reason and severity (low/medium/high).
    """
    anomalies = []

    if len(expenses) < 3:
        return anomalies  # Not enough data

    amounts = [e['amount'] for e in expenses]

    # ── Stats for comparison ───────────────────────────────
    mean_amount = statistics.mean(amounts)
    try:
        std_amount = statistics.stdev(amounts)
    except statistics.StatisticsError:
        std_amount = 0

    # Per-category stats
    cat_amounts = defaultdict(list)
    for e in expenses:
        cat_amounts[e['category']].append(e['amount'])

    cat_stats = {}
    for cat, amts in cat_amounts.items():
        cat_stats[cat] = {
            'mean': statistics.mean(amts),
            'std' : statistics.stdev(amts) if len(amts) > 1 else 0,
            'max' : max(amts),
            'count': len(amts)
        }

    # ── Check 1: Unusually large amount ───────────────────
    # Flag if amount > mean + 2.5 * std (statistical outlier)
    threshold_high = mean_amount + (2.5 * std_amount)
    threshold_low  = mean_amount * 3  # or 3x the average

    for exp in expenses:
        reasons  = []
        severity = 'low'

        # Statistical outlier check
        if std_amount > 0 and exp['amount'] > threshold_high:
            z_score = (exp['amount'] - mean_amount) / std_amount
            reasons.append(
                f'Amount is {z_score:.1f}x standard deviations above normal'
            )
            severity = 'high' if z_score > 4 else 'medium'

        # Simple multiple check
        elif mean_amount > 0 and exp['amount'] > threshold_low:
            multiple = exp['amount'] / mean_amount
            reasons.append(
                f'Amount is {multiple:.1f}x your average expense'
            )
            severity = 'medium'

        # ── Check 2: Category spike ────────────────────────
        cat = exp['category']
        if cat in cat_stats and cat_stats[cat]['count'] > 1:
            cat_mean = cat_stats[cat]['mean']
            cat_std  = cat_stats[cat]['std']
            if cat_std > 0:
                cat_z = (exp['amount'] - cat_mean) / cat_std
                if cat_z > 2.0:
                    reasons.append(
                        f'Unusually high for {cat} '
                        f'(P{cat_mean:,.0f} avg)'
                    )
                    if severity == 'low':
                        severity = 'medium'

        if reasons:
            anomalies.append({
                'expense_id'  : exp['id'],
                'title'       : exp['title'],
                'amount'      : exp['amount'],
                'category'    : exp['category'],
                'expense_date': exp['expense_date'],
                'reasons'     : reasons,
                'severity'    : severity,
            })

    # ── Check 3: Duplicate detection ──────────────────────
    # Flag expenses with same title + amount within 3 days
    seen = {}
    for exp in sorted(expenses, key=lambda x: x['expense_date']):
        key = f"{exp['title'].lower().strip()}_{exp['amount']}"
        if key in seen:
            prev      = seen[key]
            prev_date = date.fromisoformat(prev['expense_date'])
            curr_date = date.fromisoformat(exp['expense_date'])
            days_diff = abs((curr_date - prev_date).days)

            if days_diff <= 3:
                # Check if already flagged
                existing = next(
                    (a for a in anomalies
                     if a['expense_id'] == exp['id']), None
                )
                dup_reason = (
                    f'Possible duplicate of '
                    f'"{prev["title"]}" on {prev["expense_date"]}'
                )
                if existing:
                    existing['reasons'].append(dup_reason)
                    existing['severity'] = 'high'
                else:
                    anomalies.append({
                        'expense_id'  : exp['id'],
                        'title'       : exp['title'],
                        'amount'      : exp['amount'],
                        'category'    : exp['category'],
                        'expense_date': exp['expense_date'],
                        'reasons'     : [dup_reason],
                        'severity'    : 'medium',
                    })
        seen[key] = exp

    # ── Check 4: Daily spending spike ─────────────────────
    # Flag if a single day's total is 3x the daily average
    day_totals = defaultdict(float)
    for exp in expenses:
        day_totals[exp['expense_date']] += exp['amount']

    if len(day_totals) > 3:
        daily_values  = list(day_totals.values())
        daily_mean    = statistics.mean(daily_values)
        daily_std     = (
            statistics.stdev(daily_values)
            if len(daily_values) > 1 else 0
        )
        spike_threshold = daily_mean + (2 * daily_std)

        for day, total in day_totals.items():
            if total > spike_threshold and total > daily_mean * 2:
                anomalies.append({
                    'expense_id'  : None,
                    'title'       : f'Daily spending spike on {day}',
                    'amount'      : total,
                    'category'    : 'Multiple',
                    'expense_date': day,
                    'reasons'     : [
                        f'Total spending of P{total:,.0f} on this day '
                        f'is {total/daily_mean:.1f}x your daily average '
                        f'(P{daily_mean:,.0f})'
                    ],
                    'severity'    : 'medium',
                })

    # Sort by severity then amount
    severity_order = {'high': 0, 'medium': 1, 'low': 2}
    anomalies.sort(
        key=lambda x: (severity_order.get(x['severity'], 3),
                       -x['amount'])
    )

    return anomalies


# ── GET /api/anomaly/detect ────────────────────────────────
@anomaly_bp.route('/anomaly/detect', methods=['GET'])
def detect():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    days = int(request.args.get('days', 90))

    expenses  = get_recent_expenses(user_id, days)
    anomalies = detect_anomalies(expenses)

    # ── Budget overrun check ───────────────────────────────
    sql = """
        SELECT
            b.id,
            b.amount_limit,
            b.period,
            COALESCE(c.name, 'Overall Budget') AS category,
            COALESCE(
                (
                    SELECT SUM(e.amount)
                    FROM expenses e
                    LEFT JOIN categories ec ON e.category_id = ec.id
                    WHERE e.user_id = b.user_id
                    AND MONTH(e.expense_date) = MONTH(CURDATE())
                    AND YEAR(e.expense_date)  = YEAR(CURDATE())
                    AND (c.id IS NULL OR ec.id = c.id)
                ), 0
            ) AS spent
        FROM budgets b
        LEFT JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = %s
    """
    budgets = query_all(sql, (user_id,))

    for budget in budgets:
        limit = float(budget['amount_limit'])
        spent = float(budget['spent'])
        pct   = (spent / limit * 100) if limit > 0 else 0

        if pct >= 100:
            anomalies.insert(0, {
                'expense_id'  : None,
                'title'       : f'Budget Exceeded: {budget["category"]}',
                'amount'      : spent,
                'category'    : budget['category'],
                'expense_date': date.today().strftime('%Y-%m-%d'),
                'reasons'     : [
                    f'Spent P{spent:,.0f} of '
                    f'P{limit:,.0f} limit '
                    f'({pct:.1f}% used this month)'
                ],
                'severity'    : 'high',
            })
        elif pct >= 70:
            anomalies.insert(0, {
                'expense_id'  : None,
                'title'       : f'Budget Warning: {budget["category"]}',
                'amount'      : spent,
                'category'    : budget['category'],
                'expense_date': date.today().strftime('%Y-%m-%d'),
                'reasons'     : [
                    f'Spent P{spent:,.0f} of '
                    f'P{limit:,.0f} limit '
                    f'({pct:.1f}% used — approaching limit)'
                ],
                'severity'    : 'medium',
            })

    # Re-sort after adding budget anomalies
    severity_order = {'high': 0, 'medium': 1, 'low': 2}
    anomalies.sort(
        key=lambda x: (severity_order.get(x['severity'], 3),
                       -x['amount'])
    )

    return jsonify({
        'status'         : 'success',
        'total_expenses' : len(expenses),
        'anomaly_count'  : len(anomalies),
        'anomalies'      : anomalies,
        'summary': {
            'high'  : sum(1 for a in anomalies if a['severity'] == 'high'),
            'medium': sum(1 for a in anomalies if a['severity'] == 'medium'),
            'low'   : sum(1 for a in anomalies if a['severity'] == 'low'),
        }
    })


# ── POST /api/anomaly/check-single ────────────────────────
@anomaly_bp.route('/anomaly/check-single', methods=['POST'])
def check_single():
    """
    Checks if a SINGLE new expense is anomalous
    before saving. Called from the Add Expense form.
    Body: { title, amount, category }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    data = request.get_json() or {}
    amount  = float(data.get('amount', 0))
    category = data.get('category', 'Others')

    # Get past expenses for comparison
    expenses = get_recent_expenses(user_id, days=90)

    if len(expenses) < 3:
        return jsonify({
            'status'   : 'success',
            'anomaly'  : False,
            'message'  : 'Not enough history to check'
        })

    amounts     = [e['amount'] for e in expenses]
    mean_amount = statistics.mean(amounts)
    try:
        std_amount = statistics.stdev(amounts)
    except statistics.StatisticsError:
        std_amount = 0

    reasons  = []
    severity = None

    # Overall amount check
    if std_amount > 0:
        z_score = (amount - mean_amount) / std_amount
        if z_score > 2.5:
            reasons.append(
                f'This amount is {z_score:.1f}x above your normal '
                f'average of P{mean_amount:,.0f}'
            )
            severity = 'high' if z_score > 4 else 'medium'

    # Category check
    cat_amounts = [
        e['amount'] for e in expenses
        if e['category'] == category
    ]
    if len(cat_amounts) >= 2:
        cat_mean = statistics.mean(cat_amounts)
        cat_std  = statistics.stdev(cat_amounts)
        if cat_std > 0:
            cat_z = (amount - cat_mean) / cat_std
            if cat_z > 2.0:
                reasons.append(
                    f'Unusually high for {category} '
                    f'(your avg: P{cat_mean:,.0f})'
                )
                if not severity:
                    severity = 'medium'

    is_anomaly = len(reasons) > 0

    return jsonify({
        'status'  : 'success',
        'anomaly' : is_anomaly,
        'severity': severity,
        'reasons' : reasons,
        'your_average': round(mean_amount, 2)
    })