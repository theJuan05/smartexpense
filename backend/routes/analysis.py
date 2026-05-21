# analysis.py — AI Analysis & Prediction Engine

from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one
from datetime import date, datetime, timedelta
from collections import defaultdict
import statistics

analysis_bp = Blueprint('analysis', __name__)


# ── Helper: get expenses for a user ───────────────────────
def get_user_expenses(user_id, months_back=3):
    """Fetch expenses from the last N months."""
    start = date.today().replace(day=1)
    # Go back N months
    for _ in range(months_back):
        start = (start - timedelta(days=1)).replace(day=1)

    sql = """
        SELECT
            e.amount,
            e.expense_date,
            COALESCE(c.name, 'Others') AS category
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = %s
        AND e.expense_date >= %s
        ORDER BY e.expense_date ASC
    """
    rows = query_all(sql, (user_id, start.strftime('%Y-%m-%d')))

    # Convert date objects to strings
    for row in rows:
        if isinstance(row.get('expense_date'), date):
            row['expense_date'] = row['expense_date'].strftime('%Y-%m-%d')
        row['amount'] = float(row['amount'])

    return rows


# ── Helper: group expenses by month ───────────────────────
def group_by_month(expenses):
    """Returns { 'YYYY-MM': total_amount }"""
    months = defaultdict(float)
    for exp in expenses:
        month_key = exp['expense_date'][:7]  # 'YYYY-MM'
        months[month_key] += exp['amount']
    return dict(months)


# ── Helper: group expenses by day ─────────────────────────
def group_by_day(expenses):
    """Returns { 'YYYY-MM-DD': total_amount }"""
    days = defaultdict(float)
    for exp in expenses:
        days[exp['expense_date']] += exp['amount']
    return dict(days)


# ── Helper: group by category ─────────────────────────────
def group_by_category(expenses):
    """Returns { 'Category': total_amount }"""
    cats = defaultdict(float)
    for exp in expenses:
        cats[exp['category']] += exp['amount']
    return dict(cats)


# ── GET /api/analysis/predict ──────────────────────────────
@analysis_bp.route('/analysis/predict', methods=['GET'])
def predict_spending():
    """
    Predicts end-of-month spending based on:
    1. Daily average from past 3 months
    2. Current month spending so far
    3. Days remaining in month
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    today   = date.today()

    # Days in current month and days remaining
    if today.month == 12:
        next_month = date(today.year + 1, 1, 1)
    else:
        next_month = date(today.year, today.month + 1, 1)

    days_in_month  = (next_month - date(today.year, today.month, 1)).days
    days_elapsed   = today.day
    days_remaining = days_in_month - days_elapsed

    # Get past 3 months of expenses
    expenses = get_user_expenses(user_id, months_back=3)

    # Current month expenses only
    current_month_key = today.strftime('%Y-%m')
    current_expenses  = [
        e for e in expenses
        if e['expense_date'].startswith(current_month_key)
    ]
    spent_so_far = sum(e['amount'] for e in current_expenses)

    # Past months expenses (excluding current)
    past_expenses = [
        e for e in expenses
        if not e['expense_date'].startswith(current_month_key)
    ]

    # Calculate daily average from past data
    if past_expenses:
        total_past  = sum(e['amount'] for e in past_expenses)
        # Count distinct days with spending
        past_days   = group_by_day(past_expenses)
        num_days    = max(len(past_days), 1)
        daily_avg   = total_past / num_days
    else:
        # No past data — use current month average
        daily_avg = spent_so_far / max(days_elapsed, 1)

    # Prediction = spent so far + projected remaining
    projected_remaining = daily_avg * days_remaining
    predicted_total     = spent_so_far + projected_remaining

    # Monthly averages for trend
    monthly = group_by_month(past_expenses)
    monthly_values = list(monthly.values())
    avg_monthly = (
        statistics.mean(monthly_values)
        if monthly_values else spent_so_far
    )

    # Trend: is spending increasing or decreasing?
    if len(monthly_values) >= 2:
        trend = monthly_values[-1] - monthly_values[-2]
        trend_direction = 'up' if trend > 0 else 'down' if trend < 0 else 'flat'
    else:
        trend_direction = 'flat'
        trend = 0

    # Get budget for comparison
    budget_row = query_one("""
        SELECT amount_limit FROM budgets
        WHERE user_id = %s AND category_id IS NULL
        LIMIT 1
    """, (user_id,))
    budget_limit = float(budget_row['amount_limit']) if budget_row else None

    # Risk assessment
    risk = 'low'
    risk_message = 'Spending looks healthy!'
    if budget_limit:
        pct = (predicted_total / budget_limit) * 100
        if pct >= 100:
            risk = 'high'
            risk_message = (
                f'You are projected to EXCEED your budget by '
                f'P{predicted_total - budget_limit:,.2f}!'
            )
        elif pct >= 80:
            risk = 'medium'
            risk_message = (
                f'You may reach {pct:.0f}% of your budget this month.'
            )
        else:
            risk_message = (
                f'On track! Projected to use {pct:.0f}% of budget.'
            )

    return jsonify({
        'status'             : 'success',
        'today'              : today.strftime('%Y-%m-%d'),
        'days_elapsed'       : days_elapsed,
        'days_remaining'     : days_remaining,
        'days_in_month'      : days_in_month,
        'spent_so_far'       : round(spent_so_far, 2),
        'daily_average'      : round(daily_avg, 2),
        'projected_remaining': round(projected_remaining, 2),
        'predicted_total'    : round(predicted_total, 2),
        'avg_monthly'        : round(avg_monthly, 2),
        'trend_direction'    : trend_direction,
        'trend_amount'       : round(abs(trend), 2),
        'budget_limit'       : budget_limit,
        'risk'               : risk,
        'risk_message'       : risk_message,
    })


# ── GET /api/analysis/forecast-chart ──────────────────────
@analysis_bp.route('/analysis/forecast-chart', methods=['GET'])
def forecast_chart():
    """
    Returns daily spending data for current month +
    projected spending for remaining days.
    Used to draw the forecast line on the chart.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    today   = date.today()

    # Get current month expenses
    current_month_key = today.strftime('%Y-%m')
    expenses = get_user_expenses(user_id, months_back=1)
    current  = [
        e for e in expenses
        if e['expense_date'].startswith(current_month_key)
    ]

    # Build cumulative spending per day
    daily = group_by_day(current)

    # Days in month
    if today.month == 12:
        next_month = date(today.year + 1, 1, 1)
    else:
        next_month = date(today.year, today.month + 1, 1)
    days_in_month = (
        next_month - date(today.year, today.month, 1)
    ).days

    # Daily average for projection
    spent_so_far = sum(daily.values())
    daily_avg    = spent_so_far / max(today.day, 1)

    # Build chart data
    labels         = []
    actual_data    = []
    projected_data = []
    cumulative     = 0

    for day_num in range(1, days_in_month + 1):
        d   = date(today.year, today.month, day_num)
        key = d.strftime('%Y-%m-%d')
        lbl = d.strftime('%b %d')
        labels.append(lbl)

        if day_num <= today.day:
            cumulative += daily.get(key, 0)
            actual_data.append(round(cumulative, 2))
            projected_data.append(None)
        else:
            actual_data.append(None)
            projected_cumulative = (
                spent_so_far + daily_avg * (day_num - today.day)
            )
            projected_data.append(round(projected_cumulative, 2))

    return jsonify({
        'status'        : 'success',
        'labels'        : labels,
        'actual'        : actual_data,
        'projected'     : projected_data,
        'spent_so_far'  : round(spent_so_far, 2),
        'daily_average' : round(daily_avg, 2),
    })


# ── GET /api/analysis/ml-forecast ─────────────────────────
@analysis_bp.route('/analysis/ml-forecast', methods=['GET'])
def ml_forecast():
    """
    Trains a scikit-learn Linear Regression on the user's monthly
    spending history and returns next-month predicted total.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    from ml.forecaster import train_and_predict

    # Fetch up to 12 months of data
    expenses = get_user_expenses(user_id, months_back=12)
    monthly  = group_by_month(expenses)

    # Sort all months with data oldest → newest (include current month)
    today = date.today()
    sorted_months  = sorted(monthly.keys())
    monthly_totals = [monthly[m] for m in sorted_months]

    result = train_and_predict(monthly_totals)
    if result is None:
        return jsonify({
            'status':  'insufficient_data',
            'n_full_months': len(monthly_totals),
        })

    # Label months for the response
    from datetime import datetime as dt
    month_labels = [
        dt.strptime(m, '%Y-%m').strftime('%b %Y') for m in sorted_months
    ]

    # Next month label
    if today.month == 12:
        next_month_label = dt(today.year + 1, 1, 1).strftime('%b %Y')
    else:
        next_month_label = dt(today.year, today.month + 1, 1).strftime('%b %Y')

    return jsonify({
        'status':           'success',
        'month_labels':     month_labels,
        'monthly_totals':   [round(t, 2) for t in monthly_totals],
        'next_month_label': next_month_label,
        'predicted':        result['predicted'],
        'r2_score':         result['r2_score'],
        'slope':            result['slope'],
        'trend':            result['trend'],
        'n_months':         result['n_months'],
        'model':            'Linear Regression (scikit-learn)',
    })


# ── GET /api/analysis/fies-benchmark ──────────────────────
@analysis_bp.route('/analysis/fies-benchmark', methods=['GET'])
def fies_benchmark():
    """
    Uses the FIES-trained ML model to predict expected monthly spending
    per category for the user's income level, and compares it against
    their actual spending and the national median.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401

    from ml.fies_model import predict, get_national_averages, CATEGORY_COLUMNS

    # Get user's monthly income
    user = query_one("SELECT monthly_income FROM users WHERE id = %s", (user_id,))
    monthly_income = float(user['monthly_income']) if user and user.get('monthly_income') else 0

    # Get national averages (always available)
    national_avgs = get_national_averages()

    # Get user's actual spending this month per category
    today = date.today()
    current_month_key = today.strftime('%Y-%m')
    expenses = get_user_expenses(user_id, months_back=1)
    current = [e for e in expenses if e['expense_date'].startswith(current_month_key)]
    actual_by_cat = group_by_category(current)

    # Build response per category
    categories = list(CATEGORY_COLUMNS.keys())
    predicted_by_cat = {}
    if monthly_income > 0:
        predicted_by_cat = predict(monthly_income)

    result = []
    for cat in categories:
        actual  = round(actual_by_cat.get(cat, 0.0), 2)
        national = national_avgs.get(cat, 0.0)
        predicted = predicted_by_cat.get(cat, None)

        item = {
            'category': cat,
            'actual':   actual,
            'national': national,
        }
        if predicted is not None:
            item['predicted'] = predicted
            if predicted > 0:
                item['vs_predicted_pct'] = round((actual - predicted) / predicted * 100, 1)
        result.append(item)

    return jsonify({
        'status':           'success',
        'month':            today.strftime('%B %Y'),
        'monthly_income':   monthly_income,
        'national_median_income': national_avgs.get('_national_median_income', 0),
        'n_households':     national_avgs.get('_n_households', 0),
        'categories':       result,
        'has_income':       monthly_income > 0,
        'model':            'MultiOutput LinearRegression (scikit-learn) · FIES 41,544 households',
    })


# ── GET /api/analysis/category-trend ──────────────────────
@analysis_bp.route('/analysis/category-trend', methods=['GET'])
def category_trend():
    """
    Returns spending per category for last 3 months.
    Used to show category trends.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    expenses = get_user_expenses(user_id, months_back=3)

    # Group by month then category
    result = defaultdict(lambda: defaultdict(float))
    months = set()

    for exp in expenses:
        month = exp['expense_date'][:7]
        cat   = exp['category']
        result[month][cat] += exp['amount']
        months.add(month)

    months = sorted(months)

    return jsonify({
        'status': 'success',
        'months': months,
        'data'  : {m: dict(result[m]) for m in months}
    })