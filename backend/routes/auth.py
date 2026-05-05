import logging
from flask import Blueprint, render_template, redirect, url_for, request, flash, session, jsonify
from models.user import create_user, get_user_by_email, get_user_by_id, check_password
from models.db import execute
from security.jwt_auth import generate_token
from functools import wraps

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

# -----------------------------
# LOGIN REQUIRED DECORATOR
# -----------------------------
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access SmartExpense AI Pro.', 'info')
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
        password = request.form.get('password', '')

        user = get_user_by_email(email)

        if user and check_password(user, password):
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
@auth_bp.route('/api/auth/status')
def auth_status():
    if 'user_id' in session:
        return jsonify({
            'logged_in':  True,
            'user_id':    session.get('user_id'),
            'user_name':  session.get('user_name', ''),
            'user_email': session.get('user_email', ''),
            'token':      session.get('jwt', '')
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

        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'error')
            return render_template('auth/register.html')

        if get_user_by_email(email):
            flash('An account with that email already exists.', 'error')
            return render_template('auth/register.html')

        user_id = create_user(name, email, password)
        if user_id:
            session['user_id']    = user_id
            session['user_name']  = name
            session['user_email'] = email
            session['jwt']        = generate_token(user_id, name)
            session.permanent     = True
            flash(f'Welcome, {name}! Your account has been created.', 'success')
            return redirect(url_for('index'))
        else:
            logger.error("create_user returned None for email=%s — check DB connection and credentials", email)
            flash('Something went wrong. Please try again.', 'error')

    return render_template('auth/register.html')


# -----------------------------
# UPDATE MONTHLY INCOME
# -----------------------------
@auth_bp.route('/api/user/income', methods=['POST'])
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
# DELETE ACCOUNT
# -----------------------------
@auth_bp.route('/api/user/delete', methods=['DELETE'])
def delete_account():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401
    execute("DELETE FROM expenses WHERE user_id = %s", (user_id,))
    execute("DELETE FROM budgets  WHERE user_id = %s", (user_id,))
    execute("DELETE FROM users    WHERE id = %s",      (user_id,))
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