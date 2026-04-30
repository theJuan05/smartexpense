# db.py — MySQL connection + helper functions

import mysql.connector
from config import Config

def get_connection():
    """Returns a live MySQL connection."""
    try:
        conn = mysql.connector.connect(
            host     = Config.DB_HOST,
            user     = Config.DB_USER,
            password = Config.DB_PASSWORD,
            database = Config.DB_NAME
        )
        return conn
    except mysql.connector.Error as err:
        print(f"[DB ERROR] {err}")
        return None


def query_all(sql, params=None):
    """
    Run a SELECT and return all rows as a list of dicts.
    Example: query_all("SELECT * FROM expenses WHERE user_id = %s", (1,))
    """
    conn = get_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)  # dict = column names as keys
        cursor.execute(sql, params or ())
        return cursor.fetchall()
    except mysql.connector.Error as err:
        print(f"[QUERY ERROR] {err}")
        return []
    finally:
        cursor.close()
        conn.close()


def query_one(sql, params=None):
    """Run a SELECT and return a single row as a dict."""
    conn = get_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchone()
    except mysql.connector.Error as err:
        print(f"[QUERY ERROR] {err}")
        return None
    finally:
        cursor.close()
        conn.close()


def execute(sql, params=None):
    """
    Run INSERT / UPDATE / DELETE.
    Returns the last inserted row ID (for INSERT), or True on success.
    """
    conn = get_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params or ())
        conn.commit()
        return cursor.lastrowid
    except mysql.connector.Error as err:
        print(f"[EXECUTE ERROR] {err}")
        conn.rollback()
        return None
    finally:
        cursor.close()
        conn.close()