# advice.py — Personalized Financial Advice Engine

from flask import Blueprint, jsonify, request
from models.db import query_all, query_one
from datetime import date, timedelta
from collections import defaultdict
import statistics

advice_bp = Blueprint('advice', __name__)


# ── Helper: fetch user data ────────────────────────────────
def get_financial_data(user_id):
    """Collect all financial data needed for analysis."""

    # Get expenses (last 90 days)
    start = (date.today() - timedelta(days=90)).strftime('%Y-%m-%d')
    expenses = query_all("""
        SELECT
            e.amount,
            e.expense_date,
            e.title,
            COALESCE(c.name, 'Others') AS category
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = %s AND e.expense_date >= %s
        ORDER BY e.expense_date DESC
    """, (user_id, start))

    for e in expenses:
        if isinstance(e.get('expense_date'), date):
            e['expense_date'] = e['expense_date'].strftime('%Y-%m-%d')
        e['amount'] = float(e['amount'])

    # Get budgets with spending
    budgets = query_all("""
        SELECT
            b.amount_limit,
            COALESCE(c.name, 'Overall Budget') AS category,
            COALESCE(
                (SELECT SUM(e2.amount)
                 FROM expenses e2
                 LEFT JOIN categories c2 ON e2.category_id = c2.id
                 WHERE e2.user_id = b.user_id
                 AND MONTH(e2.expense_date) = MONTH(CURDATE())
                 AND YEAR(e2.expense_date)  = YEAR(CURDATE())
                 AND (c.id IS NULL OR c2.id = c.id)
                ), 0
            ) AS spent
        FROM budgets b
        LEFT JOIN categories c ON b.category_id = c.id
        WHERE b.user_id = %s
    """, (user_id,))

    for b in budgets:
        b['amount_limit'] = float(b['amount_limit'])
        b['spent']        = float(b['spent'])

    # Get goals
    goals = query_all("""
        SELECT title, target_amount, saved_amount, target_date, status
        FROM goals
        WHERE user_id = %s AND status = 'active'
    """, (user_id,))

    for g in goals:
        g['target_amount'] = float(g['target_amount'])
        g['saved_amount']  = float(g['saved_amount'])
        if isinstance(g.get('target_date'), date):
            g['target_date'] = g['target_date'].strftime('%Y-%m-%d')

    # Get user income
    user = query_one(
        "SELECT monthly_income FROM users WHERE id = %s", (user_id,)
    )
    monthly_income = float(user['monthly_income']) if user else 0

    return {
        'expenses'      : expenses,
        'budgets'       : budgets,
        'goals'         : goals,
        'monthly_income': monthly_income,
    }


# ── Core: generate advice ──────────────────────────────────
def generate_advice(data):
    """
    Analyzes financial data and returns
    personalized advice with a health score.
    """
    expenses       = data['expenses']
    budgets        = data['budgets']
    goals          = data['goals']
    monthly_income = data['monthly_income']

    advice_list  = []
    health_score = 100  # Start perfect, deduct for issues

    if not expenses:
        return {
            'advice'      : [{
                'type'   : 'info',
                'title'  : 'Start Tracking!',
                'message': 'Add your first expenses to get personalized advice.',
                'icon'   : 'info',
                'priority': 1
            }],
            'health_score': 50,
            'health_label': 'No Data',
        }

    # ── Current month data ─────────────────────────────────
    current_month = date.today().strftime('%Y-%m')
    current_expenses = [
        e for e in expenses
        if e['expense_date'].startswith(current_month)
    ]
    spent_this_month = sum(e['amount'] for e in current_expenses)

    # ── Category breakdown ─────────────────────────────────
    cat_totals = defaultdict(float)
    for e in current_expenses:
        cat_totals[e['category']] += e['amount']

    # ── 1. SAVINGS RATE ANALYSIS ───────────────────────────
    if monthly_income > 0:
        savings_rate = max(
            0, (monthly_income - spent_this_month) / monthly_income * 100
        )
        if savings_rate < 10:
            health_score -= 20
            advice_list.append({
                'type'    : 'danger',
                'title'   : 'Critical: Very Low Savings Rate',
                'message' : (
                    f'You are saving only {savings_rate:.1f}% of your income. '
                    f'Financial experts recommend saving at least 20%. '
                    f'Try to cut P{spent_this_month * 0.1:,.0f} from '
                    f'your monthly expenses.'
                ),
                'icon'    : 'danger',
                'priority': 1,
            })
        elif savings_rate < 20:
            health_score -= 10
            advice_list.append({
                'type'    : 'warning',
                'title'   : 'Improve Your Savings Rate',
                'message' : (
                    f'Your savings rate is {savings_rate:.1f}%. '
                    f'Aim for 20% or more. '
                    f'You need to save P'
                    f'{monthly_income * 0.2 - (monthly_income - spent_this_month):,.0f}'
                    f' more this month to hit the 20% target.'
                ),
                'icon'    : 'warning',
                'priority': 2,
            })
        else:
            advice_list.append({
                'type'    : 'success',
                'title'   : 'Great Savings Rate!',
                'message' : (
                    f'You are saving {savings_rate:.1f}% of your income. '
                    f'Keep it up! Consider investing the extra savings.'
                ),
                'icon'    : 'success',
                'priority': 5,
            })

    # ── 2. BUDGET ADHERENCE ────────────────────────────────
    over_budget = [
        b for b in budgets
        if b['amount_limit'] > 0 and
        b['spent'] / b['amount_limit'] >= 1.0
    ]
    near_budget = [
        b for b in budgets
        if b['amount_limit'] > 0 and
        0.8 <= b['spent'] / b['amount_limit'] < 1.0
    ]

    if over_budget:
        health_score -= 15 * len(over_budget)
        cats = ', '.join(b['category'] for b in over_budget[:3])
        advice_list.append({
            'type'    : 'danger',
            'title'   : f'Over Budget in {len(over_budget)} Category(s)',
            'message' : (
                f'You exceeded your budget in: {cats}. '
                f'Review these categories and adjust your '
                f'spending or increase the budget limit.'
            ),
            'icon'    : 'danger',
            'priority': 1,
        })

    if near_budget:
        health_score -= 5
        cats = ', '.join(b['category'] for b in near_budget[:2])
        advice_list.append({
            'type'    : 'warning',
            'title'   : 'Approaching Budget Limit',
            'message' : (
                f'{cats} — you are at 80%+ of your budget. '
                f'Slow down spending in these areas for the rest of the month.'
            ),
            'icon'    : 'warning',
            'priority': 2,
        })

    # ── 3. TOP SPENDING CATEGORY ADVICE ───────────────────
    if cat_totals:
        top_cat   = max(cat_totals, key=cat_totals.get)
        top_amount = cat_totals[top_cat]

        category_tips = {
            'Food & Dining': (
                'Try meal prepping at home to reduce food costs. '
                'Cooking at home can save 50-70% vs eating out.'
            ),
            'Transportation': (
                'Consider carpooling or using public transport more. '
                'A monthly MRT/LRT pass can save significantly vs daily Grab.'
            ),
            'Shopping': (
                'Use a 24-hour rule before online purchases. '
                'Unsubscribe from Shopee/Lazada flash sale notifications.'
            ),
            'Entertainment': (
                'Look for free or low-cost alternatives. '
                'Share streaming subscriptions with family to split costs.'
            ),
            'Utilities & Bills': (
                'Review your subscriptions — cancel unused ones. '
                'Switch to prepaid internet if usage is low.'
            ),
        }

        tip = category_tips.get(
            top_cat,
            f'Review your {top_cat} expenses for potential savings.'
        )

        if monthly_income > 0:
            pct = top_amount / monthly_income * 100
            if pct > 30:
                health_score -= 10
                advice_list.append({
                    'type'    : 'warning',
                    'title'   : f'High Spending on {top_cat}',
                    'message' : (
                        f'{top_cat} is your biggest expense at '
                        f'P{top_amount:,.0f} ({pct:.1f}% of income). {tip}'
                    ),
                    'icon'    : 'warning',
                    'priority': 3,
                })

    # ── 4. GOAL PROGRESS ──────────────────────────────────
    if goals:
        for goal in goals:
            target  = goal['target_amount']
            saved   = goal['saved_amount']
            pct     = (saved / target * 100) if target > 0 else 0
            remaining = target - saved

            if pct < 25 and goal.get('target_date'):
                target_date = date.fromisoformat(goal['target_date'])
                days_left   = (target_date - date.today()).days
                if days_left > 0:
                    needed_per_day = remaining / days_left
                    advice_list.append({
                        'type'    : 'warning',
                        'title'   : f'Goal Behind Schedule: {goal["title"]}',
                        'message' : (
                            f'You have saved P{saved:,.0f} of '
                            f'P{target:,.0f} ({pct:.1f}%). '
                            f'Save P{needed_per_day:,.0f}/day to reach '
                            f'your goal by {goal["target_date"]}.'
                        ),
                        'icon'    : 'goal',
                        'priority': 3,
                    })
            elif pct >= 75:
                advice_list.append({
                    'type'    : 'success',
                    'title'   : f'Almost There: {goal["title"]}',
                    'message' : (
                        f'You are {pct:.1f}% toward your goal! '
                        f'Just P{remaining:,.0f} more to go. '
                        f'Keep saving!'
                    ),
                    'icon'    : 'success',
                    'priority': 4,
                })
    else:
        advice_list.append({
            'type'    : 'info',
            'title'   : 'Set a Financial Goal',
            'message' : (
                'You have no active savings goals. '
                'Setting a goal (emergency fund, gadget, travel) '
                'helps you stay motivated to save.'
            ),
            'icon'    : 'info',
            'priority': 4,
        })

    # ── 5. EMERGENCY FUND CHECK ────────────────────────────
    if monthly_income > 0:
        emergency_target = monthly_income * 3
        emergency_goal   = next(
            (g for g in goals
             if 'emergency' in g['title'].lower()), None
        )
        if not emergency_goal:
            advice_list.append({
                'type'    : 'info',
                'title'   : 'Build an Emergency Fund',
                'message' : (
                    f'Aim to save 3 months of expenses '
                    f'(~P{emergency_target:,.0f}) as an emergency fund. '
                    f'Start with a small automatic transfer each payday.'
                ),
                'icon'    : 'info',
                'priority': 3,
            })

    # ── 6. SMART WEEKLY TIP ────────────────────────────────
    week_tips = [
        'Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.',
        'Review your bank statements weekly to catch unusual charges.',
        'Avoid impulse buying — wait 24 hours before any purchase over P500.',
        'Pack lunch from home at least 3 days a week to save on food costs.',
        'Set up automatic savings transfer on payday before spending.',
        'Compare prices before buying — use price comparison apps.',
        'Cancel subscriptions you have not used in the last 30 days.',
    ]
    week_num = date.today().isocalendar()[1] % len(week_tips)
    advice_list.append({
        'type'    : 'tip',
        'title'   : 'Weekly Money Tip',
        'message' : week_tips[week_num],
        'icon'    : 'tip',
        'priority': 6,
    })

    # ── Final health score ─────────────────────────────────
    health_score = max(0, min(100, health_score))
    health_label = (
        'Excellent' if health_score >= 85 else
        'Good'      if health_score >= 70 else
        'Fair'      if health_score >= 50 else
        'Poor'      if health_score >= 30 else
        'Critical'
    )

    # Sort by priority
    advice_list.sort(key=lambda x: x.get('priority', 9))

    return {
        'advice'      : advice_list,
        'health_score': health_score,
        'health_label': health_label,
    }


# ── GET /api/advice ────────────────────────────────────────
@advice_bp.route('/advice', methods=['GET'])
def get_advice():
    user_id = request.args.get('user_id', 1)
    data    = get_financial_data(user_id)
    result  = generate_advice(data)

    return jsonify({
        'status'       : 'success',
        'health_score' : result['health_score'],
        'health_label' : result['health_label'],
        'advice_count' : len(result['advice']),
        'advice'       : result['advice'],
    })