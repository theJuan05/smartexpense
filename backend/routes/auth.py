import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from flask import Blueprint, render_template, redirect, url_for, request, flash, session, jsonify
from models.user import create_user, get_user_by_email, get_user_by_token, verify_user, check_password
from models.db import execute, query_one
from security.jwt_auth import generate_token
from config import Config
from functools import wraps

SPECIAL_CHARS = re.compile(r'[!@#$%^&*()_+\-=\[\]{};\':\"\\|,.<>\/?]')

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

# -----------------------------
# LOGIN REQUIRED DECORATOR
# -----------------------------
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access SmartExpense.', 'info')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated


# -----------------------------
# LOGIN
# -----------------------------
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))

    if request.method == 'POST':
        email    = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '').strip()

        logger.info('[Login] attempt email=%r pw_len=%d ua=%s',
                    email, len(password), request.headers.get('User-Agent', '')[:80])

        user = get_user_by_email(email)
        logger.info('[Login] user_found=%s is_verified=%s', bool(user), user.get('is_verified') if user else 'n/a')

        if user and check_password(user, password):
            if not user.get('is_verified'):
                flash('Please verify your email before logging in. Check your inbox for the confirmation link.', 'error')
                return render_template('auth/login.html')
            session['user_id']    = user['id']
            session['user_name']  = user['name']
            session['user_email'] = user['email']
            session['jwt']        = generate_token(user['id'], user['name'])
            session.permanent     = True
            return redirect(url_for('index'))

        flash('Invalid email or password. Please try again.', 'error')

    return render_template('auth/login.html')


# -----------------------------
# AUTH STATUS (for login page JS)
# -----------------------------
@auth_bp.route('/api/v1/auth/status')
def auth_status():
    if 'user_id' in session:
        from models.user import get_user_by_id
        user = get_user_by_id(session['user_id'])
        return jsonify({
            'logged_in':      True,
            'user_id':        session.get('user_id'),
            'user_name':      session.get('user_name', ''),
            'user_email':     session.get('user_email', ''),
            'token':          session.get('jwt', ''),
            'monthly_income': float(user['monthly_income']) if user and user.get('monthly_income') else 0
        })
    return jsonify({'logged_in': False})


# -----------------------------
# REGISTER
# -----------------------------
@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if 'user_id' in session:
        return redirect(url_for('index'))

    if request.method == 'POST':
        name     = request.form.get('name', '').strip()
        email    = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm  = request.form.get('confirm_password', '')

        if not name or not email or not password:
            flash('All fields are required.', 'error')
            return render_template('auth/register.html')

        if password != confirm:
            flash('Passwords do not match.', 'error')
            return render_template('auth/register.html')

        if len(password) < 8:
            flash('Password must be at least 8 characters.', 'error')
            return render_template('auth/register.html')

        if not SPECIAL_CHARS.search(password):
            flash('Password must contain at least one special character (e.g. !@#$%).', 'error')
            return render_template('auth/register.html')

        if get_user_by_email(email):
            flash('An account with that email already exists.', 'error')
            return render_template('auth/register.html')

        token   = secrets.token_urlsafe(32)
        user_id = create_user(name, email, password, token)
        if user_id:
            verify_url = f"{Config.APP_URL}/verify-email/{token}"
            import threading
            from routes.email_alert import send_verification_email
            def _send():
                try:
                    send_verification_email(email, name, verify_url)
                except Exception as e:
                    logger.error("Verification email failed for %s: %s", email, e)
            threading.Thread(target=_send, daemon=True).start()
            flash(f'Account created! Check {email} for a verification link before logging in.', 'info')
            return redirect(url_for('auth.login'))
        else:
            logger.error("create_user returned None for email=%s — check DB connection and credentials", email)
            flash('Something went wrong. Please try again.', 'error')

    return render_template('auth/register.html')


# -----------------------------
# VERIFY EMAIL
# -----------------------------
@auth_bp.route('/verify-email/<token>')
def verify_email(token):
    user = get_user_by_token(token)
    if not user:
        flash('Invalid or expired verification link.', 'error')
        return redirect(url_for('auth.login'))
    verify_user(user['id'])
    flash('Email verified! You can now log in.', 'success')
    return redirect(url_for('auth.login'))


# -----------------------------
# FORGOT PASSWORD
# -----------------------------
@auth_bp.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        user  = get_user_by_email(email)
        if user:
            token   = secrets.token_urlsafe(32)
            expires = datetime.now(timezone.utc) + timedelta(hours=1)
            execute(
                "UPDATE users SET password_reset_token = %s, password_reset_expires = %s WHERE id = %s",
                (token, expires, user['id'])
            )
            reset_url = f"{Config.APP_URL}/reset-password/{token}"
            import threading
            from routes.email_alert import send_reset_email
            def _send():
                try:
                    send_reset_email(user['email'], user['name'], reset_url)
                except Exception as e:
                    logger.error("Reset email failed for %s: %s", email, e)
            threading.Thread(target=_send, daemon=True).start()
        # Same message regardless — prevents email enumeration
        flash('If that email has an account, a reset link has been sent. Check your inbox.', 'info')
        return redirect(url_for('auth.forgot_password'))
    return render_template('auth/forgot-password.html')


# -----------------------------
# RESET PASSWORD
# -----------------------------
@auth_bp.route('/reset-password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    user = query_one(
        "SELECT * FROM users WHERE password_reset_token = %s AND password_reset_expires > %s",
        (token, datetime.now(timezone.utc))
    )
    if not user:
        flash('This reset link is invalid or has expired.', 'error')
        return redirect(url_for('auth.forgot_password'))

    if request.method == 'POST':
        new_pw  = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')

        if len(new_pw) < 8:
            flash('Password must be at least 8 characters.', 'error')
            return render_template('auth/reset-password.html', token=token)
        if not SPECIAL_CHARS.search(new_pw):
            flash('Password must contain at least one special character (e.g. !@#$%).', 'error')
            return render_template('auth/reset-password.html', token=token)
        if new_pw != confirm:
            flash('Passwords do not match.', 'error')
            return render_template('auth/reset-password.html', token=token)

        from werkzeug.security import generate_password_hash
        execute(
            "UPDATE users SET password_hash = %s, password_reset_token = NULL, password_reset_expires = NULL WHERE id = %s",
            (generate_password_hash(new_pw), user['id'])
        )
        flash('Password updated! You can now sign in with your new password.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('auth/reset-password.html', token=token)


# -----------------------------
# CHANGE PASSWORD
# -----------------------------
@auth_bp.route('/api/v1/user/change-password', methods=['POST'])
def change_password():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    data        = request.get_json() or {}
    current_pw  = data.get('current_password', '')
    new_pw      = data.get('new_password', '')
    confirm_pw  = data.get('confirm_password', '')

    from models.user import get_user_by_id
    user = get_user_by_id(user_id)
    if not user or not check_password(user, current_pw):
        return jsonify({'status': 'error', 'message': 'Current password is incorrect'}), 400

    if len(new_pw) < 8:
        return jsonify({'status': 'error', 'message': 'Password must be at least 8 characters'}), 400

    if not SPECIAL_CHARS.search(new_pw):
        return jsonify({'status': 'error', 'message': 'Password must contain at least one special character (e.g. !@#$%)'}), 400

    if new_pw != confirm_pw:
        return jsonify({'status': 'error', 'message': 'Passwords do not match'}), 400

    from werkzeug.security import generate_password_hash
    execute("UPDATE users SET password_hash = %s WHERE id = %s",
            (generate_password_hash(new_pw), user_id))

    return jsonify({'status': 'success'})


# -----------------------------
# UPDATE MONTHLY INCOME
# -----------------------------
@auth_bp.route('/api/v1/user/income', methods=['POST'])
def update_income():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    data = request.get_json() or {}
    try:
        income = float(data.get('monthly_income', 0))
        if income < 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'status': 'error', 'message': 'Invalid amount'}), 400
    execute("UPDATE users SET monthly_income = %s WHERE id = %s", (income, user_id))
    return jsonify({'status': 'success'})


# -----------------------------
# PROFILE PICTURE
# -----------------------------
@auth_bp.route('/api/v1/user/profile-pic', methods=['GET'])
def get_profile_pic():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    row = query_one("SELECT profile_pic FROM users WHERE id = %s", (user_id,))
    return jsonify({'pic': row['profile_pic'] if row else None})


@auth_bp.route('/api/v1/user/profile-pic', methods=['POST'])
def save_profile_pic():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    data = request.get_json() or {}
    pic  = data.get('pic') or None
    if pic and not pic.startswith('data:image/'):
        return jsonify({'status': 'error', 'message': 'Invalid image format'}), 400
    if pic and len(pic) > 7 * 1024 * 1024:
        return jsonify({'status': 'error', 'message': 'Image too large'}), 400
    execute("UPDATE users SET profile_pic = %s WHERE id = %s", (pic, user_id))
    return jsonify({'status': 'success'})


# -----------------------------
# DELETE ACCOUNT
# -----------------------------
@auth_bp.route('/api/v1/user/delete', methods=['DELETE'])
def delete_account():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    execute("DELETE FROM expenses    WHERE user_id = %s", (user_id,))
    execute("DELETE FROM budgets     WHERE user_id = %s", (user_id,))
    execute("DELETE FROM goals       WHERE user_id = %s", (user_id,))
    execute("DELETE FROM push_tokens WHERE user_id = %s", (user_id,))
    execute("DELETE FROM users       WHERE id = %s",      (user_id,))
    session.clear()
    return jsonify({'status': 'success'})


# -----------------------------
# LOGOUT
# -----------------------------
@auth_bp.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'info')
    return redirect(url_for('auth.login'))