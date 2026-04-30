"""
JWT token generation and verification.
Tokens are signed with HS256 using Config.JWT_SECRET_KEY and expire in 30 days.
"""

from functools import wraps
from datetime import datetime, timedelta, timezone

import jwt
from flask import request, jsonify
from config import Config


def generate_token(user_id: int, user_name: str) -> str:
    payload = {
        'user_id':   user_id,
        'user_name': user_name,
        'iat':       datetime.now(timezone.utc),
        'exp':       datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm='HS256')


def verify_token(token: str):
    """Return the decoded payload dict, or None if invalid/expired."""
    try:
        return jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def jwt_required(f):
    """Decorator: protect an API route with a Bearer JWT token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.removeprefix('Bearer ').strip()
        if not token:
            return jsonify({'error': 'Authorization token required'}), 401
        payload = verify_token(token)
        if payload is None:
            return jsonify({'error': 'Invalid or expired token'}), 401
        request.jwt_user = payload
        return f(*args, **kwargs)
    return decorated
