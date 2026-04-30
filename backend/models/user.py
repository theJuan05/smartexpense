# models/user.py

from werkzeug.security import generate_password_hash, check_password_hash
from models.db import query_one, execute

def create_user(name, email, password):
    hashed = generate_password_hash(password)
    return execute(
        "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
        (name, email, hashed)
    )

def get_user_by_email(email):
    return query_one("SELECT * FROM users WHERE email = %s", (email,))

def get_user_by_id(user_id):
    return query_one("SELECT * FROM users WHERE id = %s", (user_id,))

def check_password(user, raw_password):
    return check_password_hash(user['password_hash'], raw_password)  # ← fixed