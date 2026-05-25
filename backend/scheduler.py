import logging
from datetime import date

logger = logging.getLogger(__name__)

# In-memory guard so multiple gunicorn workers don't double-send on the same day
_last_sent_date = None


def send_daily_budget_reminders(app, force=False):
    global _last_sent_date
    today = date.today()
    if not force and _last_sent_date == today:
        return  # Already ran today in this process
    _last_sent_date = today

    with app.app_context():
        from models.db import query_all
        from routes.push import _send_to_all

        # All users who have at least one device registered
        users = query_all('SELECT DISTINCT user_id FROM push_tokens')
        if not users:
            return

        for user in users:
            uid = user['user_id']
            budgets = query_all("""
                SELECT
                    b.amount_limit,
                    COALESCE(c.name, 'Overall Budget') AS category,
                    COALESCE(SUM(e.amount), 0)          AS spent
                FROM budgets b
                LEFT JOIN categories c ON b.category_id = c.id
                LEFT JOIN expenses e
                    ON  e.user_id = b.user_id
                    AND MONTH(e.expense_date) = MONTH(CURDATE())
                    AND YEAR(e.expense_date)  = YEAR(CURDATE())
                    AND (b.category_id IS NULL OR e.category_id = b.category_id)
                WHERE b.user_id = %s
                GROUP BY b.id, b.amount_limit, c.name
            """, (uid,))

            for budget in budgets:
                limit    = float(budget['amount_limit'])
                spent    = float(budget['spent'])
                if limit <= 0:
                    continue
                pct      = spent / limit * 100
                category = budget['category']
                remain   = max(0, limit - spent)

                if pct >= 100:
                    _send_to_all(
                        uid,
                        f'Budget Exceeded: {category}',
                        f"You've gone over your ₱{limit:,.0f} limit by ₱{spent - limit:,.0f}. "
                        f"Consider reviewing your spending.",
                    )
                elif pct >= 80:
                    _send_to_all(
                        uid,
                        f'Budget Reminder: {category}',
                        f"You've used {pct:.0f}% of your ₱{limit:,.0f} budget. "
                        f"Only ₱{remain:,.0f} left this month.",
                    )
                elif pct >= 50:
                    _send_to_all(
                        uid,
                        f'Spending Update: {category}',
                        f"Halfway through your ₱{limit:,.0f} budget — "
                        f"₱{spent:,.0f} spent, ₱{remain:,.0f} remaining.",
                    )

        logger.info('[Scheduler] Daily budget reminders sent to %d user(s)', len(users))


def start_scheduler(app):
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BackgroundScheduler(daemon=True)

    # 8:00 PM Philippine Time daily  (PHT = UTC+8, so 20:00 PHT = 12:00 UTC)
    scheduler.add_job(
        func=send_daily_budget_reminders,
        args=[app],
        trigger=CronTrigger(hour=12, minute=0, timezone='UTC'),
        id='daily_budget_reminder',
        name='Daily Budget Reminder',
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # 2:00 AM PHT daily (18:00 UTC)
    from utils.backup import run_server_backup
    scheduler.add_job(
        func=run_server_backup,
        args=[app],
        trigger=CronTrigger(hour=18, minute=0, timezone='UTC'),
        id='daily_backup',
        name='Daily Database Backup',
        replace_existing=True,
        misfire_grace_time=3600,
    )

    scheduler.start()
    logger.info('[Scheduler] Started — budget reminders at 8 PM PHT, backup at 2 AM PHT')
    return scheduler
