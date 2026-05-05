# models/user.py

from werkzeug.security import generate_password_hash, check_password_hash
from models.db import query_one, execute

def create_user(name, email, password, verification_token=None):
    hashed = generate_password_hash(password)
    return execute(
        "INSERT INTO users (name, email, password_hash, verification_token, is_verified) VALUES (%s, %s, %s, %s, 0)",
        (name, email, hashed, verification_token)
    )

def get_user_by_email(email):
    return query_one("SELECT * FROM users WHERE email = %s", (email,))

def get_user_by_id(user_id):
    return query_one("SELECT * FROM users WHERE id = %s", (user_id,))

def get_user_by_token(token):
    return query_one("SELECT * FROM users WHERE verification_token = %s", (token,))

def verify_user(user_id):
    execute("UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = %s", (user_id,))

def check_password(user, raw_password):
    return check_password_hash(user['password_hash'], raw_password)