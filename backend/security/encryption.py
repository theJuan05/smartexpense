"""
AES-256 encryption via Fernet (AES-128-CBC + HMAC-SHA256).
Key is derived from Config.SECRET_KEY using SHA-256 so no
separate key file is needed.
"""

import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from config import Config


def _fernet() -> Fernet:
    raw_key = hashlib.sha256(Config.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw_key))


def encrypt(text: str) -> str:
    """Encrypt a plaintext string and return a URL-safe ciphertext string."""
    if not text:
        return text
    return _fernet().encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a ciphertext string.  Returns the original string unchanged
    if it was not encrypted (handles rows stored before encryption was added)."""
    if not token:
        return token
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return token
