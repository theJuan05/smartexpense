# db.py — MySQL connection + helper functions

import logging
import mysql.connector
from mysql.connector import pooling
from config import Config

logger = logging.getLogger(__name__)

_pool = None

def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    try:
        kwargs = dict(
            pool_name    = 'smartexpense_pool',
            pool_size    = 5,
            host         = Config.DB_HOST,
            user         = Config.DB_USER,
            password     = Config.DB_PASSWORD,
            database     = Config.DB_NAME,
            connection_timeout = 10,
            charset      = 'utf8mb4',
            use_unicode  = True,
        )
        if Config.DB_PORT:
            kwargs['port'] = int(Config.DB_PORT)
        if Config.DB_SSL:
            kwargs['ssl_disabled'] = False
        _pool = pooling.MySQLConnectionPool(**kwargs)
        logger.info("[DB POOL] Created pool (size=5) to %s/%s", Config.DB_HOST, Config.DB_NAME)
    except mysql.connector.Error as err:
        logger.error("[DB POOL ERROR] %s", err)
    return _pool

def get_connection():
    """Returns a pooled MySQL connection."""
    pool = _get_pool()
    if pool is None:
        return None
    try:
        return pool.get_connection()
    except mysql.connector.Error as err:
        logger.error("[DB CONNECTION ERROR] %s", err)
        return None


def query_all(sql, params=None):
    conn = get_connection()
    if not conn:
        return []
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchall()
    except mysql.connector.Error as err:
        logger.error("[QUERY ERROR] %s", err)
        return []
    finally:
        if cursor:
            cursor.close()
        conn.close()


def query_one(sql, params=None):
    conn = get_connection()
    if not conn:
        return None
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchone()
    except mysql.connector.Error as err:
        logger.error("[QUERY ERROR] %s", err)
        return None
    finally:
        if cursor:
            cursor.close()
        conn.close()


def execute(sql, params=None):
    """Run INSERT / UPDATE / DELETE. Returns lastrowid for INSERT, else None."""
    conn = get_connection()
    if not conn:
        return None
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params or ())
        conn.commit()
        return cursor.lastrowid
    except mysql.connector.Error as err:
        logger.error("[EXECUTE ERROR] %s", err)
        conn.rollback()
        return None
    finally:
        if cursor:
            cursor.close()
        conn.close()


def ensure_schema():
    """Add any columns or tables that may be missing from older deployments."""
    col = query_one("SHOW COLUMNS FROM users LIKE 'monthly_income'")
    if not col:
        execute("ALTER TABLE users ADD COLUMN monthly_income DECIMAL(15,2) DEFAULT 0")
        logger.info("[DB SCHEMA] Added monthly_income column to users table")

    # If goals table exists with wrong schema (missing 'name' column), drop and recreate
    goals_exists = query_one("SHOW TABLES LIKE 'goals'")
    if goals_exists:
        wrong_schema = not query_one("SHOW COLUMNS FROM goals LIKE 'name'")
        if wrong_schema:
            execute("DROP TABLE goals")
            logger.info("[DB SCHEMA] Dropped goals table with wrong schema — will recreate")

    execute("""
        CREATE TABLE IF NOT EXISTS goals (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            user_id       INT NOT NULL,
            name          VARCHAR(255) NOT NULL,
            icon          VARCHAR(20) DEFAULT '',
            target_amount DECIMAL(15,2) NOT NULL,
            saved_amount  DECIMAL(15,2) DEFAULT 0,
            deadline      DATE NULL,
            contributions MEDIUMTEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    logger.info("[DB SCHEMA] goals table ensured")

    col = query_one("SHOW COLUMNS FROM users LIKE 'profile_pic'")
    if not col:
        execute("ALTER TABLE users ADD COLUMN profile_pic MEDIUMTEXT")
        logger.info("[DB SCHEMA] Added profile_pic column to users table")

    col = query_one("SHOW COLUMNS FROM users LIKE 'password_reset_token'")
    if not col:
        execute("ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(100) NULL")
        execute("ALTER TABLE users ADD COLUMN password_reset_expires DATETIME NULL")
        logger.info("[DB SCHEMA] Added password reset columns to users table")