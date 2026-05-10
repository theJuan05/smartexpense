"""
AES-256-GCM encryption for sensitive data at rest.

Key derivation: SHA-256 of SECRET_KEY → 32-byte (256-bit) key.
Ciphertext format: 'v2:<base64(12-byte nonce + ciphertext + 16-byte GCM tag)>'

Backward-compatible decrypt handles:
  1. v2: prefix  → AES-256-GCM (current)
  2. No prefix   → legacy Fernet/AES-128 (old rows)
  3. Anything else → return as plaintext (pre-encryption rows)
"""

import os
import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import Config


def _key() -> bytes:
    """Derive a 256-bit (32-byte) key from SECRET_KEY using SHA-256."""
    return hashlib.sha256(Config.SECRET_KEY.encode('utf-8')).digest()


def encrypt(plaintext: str) -> str:
    """
    Encrypt plaintext with AES-256-GCM.
    Returns a 'v2:<base64>' string safe to store in any TEXT column.
    Returns the original string unchanged if it is empty/None.
    """
    if not plaintext:
        return plaintext

    nonce      = os.urandom(12)                                   # 96-bit nonce
    ciphertext = AESGCM(_key()).encrypt(nonce, plaintext.encode('utf-8'), None)
    payload    = base64.urlsafe_b64encode(nonce + ciphertext).decode('ascii')
    return f'v2:{payload}'


def decrypt(token: str) -> str:
    """
    Decrypt a value returned from the database.
    Handles AES-256-GCM (v2:), legacy Fernet, and unencrypted plaintext.
    """
    if not token:
        return token

    # ── AES-256-GCM (current format) ──────────────────────────
    if token.startswith('v2:'):
        try:
            raw        = base64.urlsafe_b64decode(token[3:])
            nonce      = raw[:12]
            ciphertext = raw[12:]
            return AESGCM(_key()).decrypt(nonce, ciphertext, None).decode('utf-8')
        except Exception:
            return token   # corrupted — return as-is

    # ── Legacy Fernet / AES-128 (old rows) ────────────────────
    try:
        from cryptography.fernet import Fernet, InvalidToken
        fernet_key = base64.urlsafe_b64encode(_key())   # same 32-byte key, b64-wrapped
        return Fernet(fernet_key).decrypt(token.encode()).decode('utf-8')
    except Exception:
        pass

    # ── Plaintext (rows stored before encryption was added) ───
    return token
