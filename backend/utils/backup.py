"""
Backup and recovery utilities.

Server backup: dumps all user data to JSON files in backend/backups/.
Keeps the last 7 daily backups automatically.
"""

import os
import json
import logging
from datetime import datetime, timezone

from models.db import query_all, execute

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(os.path.dirname(__file__), '..', 'backups')


def _ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


def export_user_data(user_id: int) -> dict:
    """Return all data for a single user as a plain dict."""
    expenses = query_all(
        "SELECT id, title, amount, category_id, expense_date, notes, created_at "
        "FROM expenses WHERE user_id = %s ORDER BY expense_date DESC",
        (user_id,)
    )
    budgets = query_all(
        "SELECT id, category_id, amount_limit FROM budgets WHERE user_id = %s",
        (user_id,)
    )
    goals = query_all(
        "SELECT id, name, icon, target_amount, saved_amount, deadline, contributions, created_at "
        "FROM goals WHERE user_id = %s",
        (user_id,)
    )

    def serialise(rows):
        out = []
        for row in rows:
            r = {}
            for k, v in row.items():
                if hasattr(v, 'isoformat'):
                    r[k] = v.isoformat()
                else:
                    r[k] = v
            out.append(r)
        return out

    return {
        'backup_version': '1.0',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'user_id': user_id,
        'data': {
            'expenses': serialise(expenses),
            'budgets':  serialise(budgets),
            'goals':    serialise(goals),
        }
    }


def restore_user_data(user_id: int, backup: dict) -> dict:
    """
    Restore a user's data from a backup dict.
    Clears existing records first, then inserts from backup.
    Returns {'expenses': N, 'budgets': N, 'goals': N}.
    """
    data = backup.get('data', {})

    execute("DELETE FROM expenses WHERE user_id = %s", (user_id,))
    execute("DELETE FROM budgets  WHERE user_id = %s", (user_id,))
    execute("DELETE FROM goals    WHERE user_id = %s", (user_id,))

    exp_count = 0
    for e in data.get('expenses', []):
        execute(
            "INSERT INTO expenses (user_id, title, amount, category_id, expense_date, notes) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, e.get('title', ''), e.get('amount', 0),
             e.get('category_id'), e.get('expense_date'), e.get('notes', ''))
        )
        exp_count += 1

    bud_count = 0
    for b in data.get('budgets', []):
        execute(
            "INSERT INTO budgets (user_id, category_id, amount_limit) VALUES (%s, %s, %s)",
            (user_id, b.get('category_id'), b.get('amount_limit', 0))
        )
        bud_count += 1

    goal_count = 0
    for g in data.get('goals', []):
        execute(
            "INSERT INTO goals (user_id, name, icon, target_amount, saved_amount, deadline, contributions) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (user_id, g.get('name', ''), g.get('icon', ''),
             g.get('target_amount', 0), g.get('saved_amount', 0),
             g.get('deadline'), g.get('contributions'))
        )
        goal_count += 1

    return {'expenses': exp_count, 'budgets': bud_count, 'goals': goal_count}


def run_server_backup(app):
    """
    Scheduled job: dump all users' data to a dated JSON file.
    Keeps only the last 7 backup files.
    """
    with app.app_context():
        try:
            _ensure_backup_dir()
            users = query_all("SELECT id FROM users")
            all_data = {}
            for u in users:
                all_data[str(u['id'])] = export_user_data(u['id'])

            filename = f"backup_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
            filepath = os.path.join(BACKUP_DIR, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, ensure_ascii=False, indent=2)

            logger.info('[Backup] Saved %s (%d users)', filename, len(users))

            # Prune — keep only the 7 most recent backups
            files = sorted(
                [x for x in os.listdir(BACKUP_DIR) if x.startswith('backup_') and x.endswith('.json')]
            )
            for old in files[:-7]:
                os.remove(os.path.join(BACKUP_DIR, old))
                logger.info('[Backup] Pruned old backup: %s', old)

        except Exception as err:
            logger.error('[Backup] Server backup failed: %s', err)
