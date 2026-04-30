# db.py — MySQL connection + helper functions

import logging
import mysql.connector
from config import Config

logger = logging.getLogger(__name__)

def get_connection():
    """Returns a live MySQL connection."""
    try:
        kwargs = dict(
            host     = Config.DB_HOST,
            user     = Config.DB_USER,
            password = Config.DB_PASSWORD,
            database = Config.DB_NAME,
        )
        if Config.DB_PORT:
            kwargs['port'] = int(Config.DB_PORT)
        if Config.DB_SSL:
            kwargs['ssl_disabled'] = False
        conn = mysql.connector.connect(**kwargs)
        return conn
    except mysql.connector.Error as err:
        logger.error("[DB CONNECTION ERROR] host=%s db=%s error=%s", Config.DB_HOST, Config.DB_NAME, err)
        return None


def query_all(sql, params=None):
    conn = get_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchall()
    except mysql.connector.Error as err:
        logger.error("[QUERY ERROR] %s", err)
        return []
    finally:
        cursor.close()
        conn.close()


def query_one(sql, params=None):
    conn = get_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchone()
    except mysql.connector.Error as err:
        logger.error("[QUERY ERROR] %s", err)
        return None
    finally:
        cursor.close()
        conn.close()


def execute(sql, params=None):
    """Run INSERT / UPDATE / DELETE. Returns lastrowid for INSERT, else None."""
    conn = get_connection()
    if not conn:
        return None
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
        cursor.close()
        conn.close()