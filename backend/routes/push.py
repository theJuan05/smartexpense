# push.py — FCM Push Notification Routes

import logging
import requests as http_requests
from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one, get_connection
from config import Config

push_bp = Blueprint('push', __name__)
logger  = logging.getLogger(__name__)


# ── Create push_tokens table if it doesn't exist ──────────────
def _ensure_table():
    conn = get_connection()
    if not conn:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS push_tokens (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                user_id    INT NOT NULL,
                token      TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_push_user (user_id)
            )
        """)
        conn.commit()
    except Exception as e:
        logger.warning('[Push] Table init failed: %s', e)
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        conn.close()


_ensure_table()


# ── POST /api/push-token ───────────────────────────────────────
@push_bp.route('/push-token', methods=['POST'])
def save_push_token():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    data  = request.get_json() or {}
    token = (data.get('token') or '').strip()
    if not token:
        return jsonify({'status': 'error', 'message': 'Missing token'}), 400

    conn = get_connection()
    if not conn:
        return jsonify({'status': 'error', 'message': 'DB unavailable'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO push_tokens (user_id, token)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE
                token      = VALUES(token),
                updated_at = CURRENT_TIMESTAMP
        """, (user_id, token))
        conn.commit()
        logger.info('[Push] Token saved for user %s', user_id)
        return jsonify({'status': 'success'})
    except Exception as e:
        conn.rollback()
        logger.error('[Push] Token save error: %s', e)
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        conn.close()


# ── Helper: send one FCM push ──────────────────────────────────
def send_fcm(token, title, body):
    server_key = getattr(Config, 'FIREBASE_SERVER_KEY', '')
    if not server_key:
        logger.warning('[Push] FIREBASE_SERVER_KEY not set — skipping push')
        return False
    try:
        resp = http_requests.post(
            'https://fcm.googleapis.com/fcm/send',
            headers={
                'Authorization': f'key={server_key}',
                'Content-Type':  'application/json',
            },
            json={
                'to': token,
                'notification': {
                    'title': title,
                    'body':  body,
                    'icon':  '/static/icons/logo-icon.svg',
                },
                'webpush': {
                    'notification': {
                        'icon':    '/static/icons/logo-icon.svg',
                        'badge':   '/static/icons/logo-icon.svg',
                        'vibrate': [200, 100, 200],
                    },
                    'fcm_options': {'link': '/'},
                },
            },
            timeout=10,
        )
        resp.raise_for_status()
        result = resp.json()
        if result.get('failure', 0) > 0:
            logger.warning('[Push] FCM partial failure: %s', result)
        return True
    except Exception as e:
        logger.error('[Push] FCM send error: %s', e)
        return False


# ── POST /api/budgets/notify ───────────────────────────────────
# Client calls this after an expense is synced to server.
# Checks budget thresholds and sends FCM pushes for any warning/danger budgets.
@push_bp.route('/budgets/notify', methods=['POST'])
def check_and_notify():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    row = query_one(
        'SELECT token FROM push_tokens WHERE user_id = %s', (user_id,)
    )
    if not row:
        return jsonify({'status': 'ok', 'message': 'No push token registered'})

    token = row['token']

    budgets = query_all("""
        SELECT
            b.id,
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
    """, (user_id,))

    pushed = 0
    for budget in budgets:
        limit    = float(budget['amount_limit'])
        spent    = float(budget['spent'])
        pct      = (spent / limit * 100) if limit > 0 else 0
        category = budget['category']

        if pct >= 90:
            title = f'Over Budget: {category}'
            body  = (f"You've spent ₱{spent:,.0f} — "
                     f"{pct:.0f}% of your ₱{limit:,.0f} limit!")
            if send_fcm(token, title, body):
                pushed += 1
        elif pct >= 70:
            title = f'Budget Warning: {category}'
            body  = (f"You've used {pct:.0f}% "
                     f"of your ₱{limit:,.0f} monthly budget.")
            if send_fcm(token, title, body):
                pushed += 1

    return jsonify({'status': 'success', 'pushed': pushed})
