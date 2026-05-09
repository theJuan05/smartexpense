import json
import logging
import os
import requests as http_requests
from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one, get_connection
from config import Config

push_bp = Blueprint('push', __name__)
logger  = logging.getLogger(__name__)

FCM_ENDPOINT = f"https://fcm.googleapis.com/v1/projects/{os.getenv('FIREBASE_PROJECT_ID', 'pwa-5516b')}/messages:send"


# ── Get short-lived OAuth2 token from service account ─────────
def _get_access_token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request as GoogleRequest

    # Prefer env var (for Render / cloud deployments where file can't be committed)
    sa_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
    if sa_json:
        try:
            sa_info = json.loads(sa_json)
            creds = service_account.Credentials.from_service_account_info(
                sa_info,
                scopes=['https://www.googleapis.com/auth/firebase.messaging'],
            )
            creds.refresh(GoogleRequest())
            return creds.token
        except Exception as e:
            logger.error('[Push] Failed to load service account from env var: %s', e)
            return None

    # Fallback: load from file (local dev)
    sa_path = os.getenv('FIREBASE_SERVICE_ACCOUNT_PATH',
                        os.path.join(os.path.dirname(__file__), '..', 'firebase-service-account.json'))
    sa_path = os.path.abspath(sa_path)

    if not os.path.exists(sa_path):
        logger.error('[Push] Service account file not found: %s', sa_path)
        return None

    creds = service_account.Credentials.from_service_account_file(
        sa_path,
        scopes=['https://www.googleapis.com/auth/firebase.messaging'],
    )
    creds.refresh(GoogleRequest())
    return creds.token


# ── Send one FCM v1 push ───────────────────────────────────────
def send_fcm(token, title, body, link='/'):
    access_token = _get_access_token()
    if not access_token:
        logger.warning('[Push] No access token — skipping push')
        return False
    try:
        resp = http_requests.post(
            FCM_ENDPOINT,
            headers={
                'Authorization': f'Bearer {access_token}',
                'Content-Type':  'application/json',
            },
            json={
                'message': {
                    'token': token,
                    'notification': {'title': title, 'body': body},
                    'webpush': {
                        'notification': {
                            'icon':    '/static/icons/icon-192.png',
                            'badge':   '/static/icons/icon-192.png',
                            'vibrate': [200, 100, 200],
                        },
                        'fcm_options': {'link': link},
                    },
                }
            },
            timeout=10,
        )
        resp.raise_for_status()
        logger.info('[Push] FCM v1 sent OK — %s', resp.json())
        return True
    except Exception as e:
        logger.error('[Push] FCM v1 error: %s', e)
        return False


# ── Create push_tokens table ───────────────────────────────────
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
        try: cursor.close()
        except Exception: pass
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
            ON DUPLICATE KEY UPDATE token = VALUES(token), updated_at = CURRENT_TIMESTAMP
        """, (user_id, token))
        conn.commit()
        logger.info('[Push] Token saved for user %s', user_id)
        return jsonify({'status': 'success'})
    except Exception as e:
        conn.rollback()
        logger.error('[Push] Token save error: %s', e)
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        try: cursor.close()
        except Exception: pass
        conn.close()


# ── POST /api/push-test  (demo / presentation use) ────────────
@push_bp.route('/push-test', methods=['POST'])
def push_test():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    row = query_one('SELECT token FROM push_tokens WHERE user_id = %s', (user_id,))
    if not row:
        return jsonify({'status': 'error', 'message': 'No push token registered for this user'}), 404

    ok = send_fcm(
        row['token'],
        title='SmartExpense 🔔',
        body='Push notifications are working! You\'re all set.',
    )
    return jsonify({'status': 'success' if ok else 'error'})


# ── POST /api/budgets/notify ───────────────────────────────────
@push_bp.route('/budgets/notify', methods=['POST'])
def check_and_notify():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    row = query_one('SELECT token FROM push_tokens WHERE user_id = %s', (user_id,))
    if not row:
        return jsonify({'status': 'ok', 'message': 'No push token registered'})

    token   = row['token']
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
            body  = f"You've spent ₱{spent:,.0f} — {pct:.0f}% of your ₱{limit:,.0f} limit!"
            if send_fcm(token, title, body): pushed += 1
        elif pct >= 70:
            title = f'Budget Warning: {category}'
            body  = f"You've used {pct:.0f}% of your ₱{limit:,.0f} monthly budget."
            if send_fcm(token, title, body): pushed += 1

    return jsonify({'status': 'success', 'pushed': pushed})
