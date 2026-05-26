import json
import logging
from flask import Blueprint, jsonify, request, session, Response

logger = logging.getLogger(__name__)

backup_bp = Blueprint('backup', __name__)


@backup_bp.route('/backup/download')
def download_backup():
    """Download the current user's data as a JSON backup file."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    from utils.backup import export_user_data
    data = export_user_data(user_id)
    payload = json.dumps(data, ensure_ascii=False, indent=2)

    return Response(
        payload,
        mimetype='application/json',
        headers={
            'Content-Disposition': f'attachment; filename="smartexpense_backup_{user_id}.json"'
        }
    )


@backup_bp.route('/backup/restore', methods=['POST'])
def restore_backup():
    """Restore user data from an uploaded JSON backup."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    try:
        backup = request.get_json()
        if not backup or 'data' not in backup:
            return jsonify({'status': 'error', 'message': 'Invalid backup file'}), 400

        if str(backup.get('user_id')) != str(user_id):
            return jsonify({'status': 'error', 'message': 'Backup belongs to a different account'}), 403

        from utils.backup import restore_user_data
        counts = restore_user_data(user_id, backup)

        from models.db import execute
        execute(
            "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (%s, %s, %s, %s)",
            (user_id, 'backup_restore',
             f"restored {counts['expenses']} expenses, {counts['budgets']} budgets, {counts['goals']} goals",
             request.remote_addr)
        )

        return jsonify({'status': 'success', 'restored': counts})

    except Exception as e:
        logger.error('[Backup Restore] user_id=%s error=%s', user_id, e)
        return jsonify({'status': 'error', 'message': 'Restore failed'}), 500


@backup_bp.route('/backup/trigger', methods=['POST'])
def trigger_backup():
    """Manually trigger a server-side backup right now."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    from flask import current_app
    from utils.backup import run_server_backup
    import threading
    threading.Thread(target=run_server_backup, args=[current_app._get_current_object()], daemon=True).start()
    return jsonify({'status': 'success', 'message': 'Backup started — check /api/v1/backup/history in a few seconds'})


@backup_bp.route('/backup/history')
def backup_history():
    """List available server-side backup files (for demo/admin purposes)."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Not authenticated'}), 401

    import os
    from utils.backup import BACKUP_DIR

    if not os.path.isdir(BACKUP_DIR):
        return jsonify({'status': 'success', 'backups': []})

    files = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith('backup_') and f.endswith('.json')],
        reverse=True
    )
    result = []
    for f in files:
        path = os.path.join(BACKUP_DIR, f)
        size = os.path.getsize(path)
        result.append({'filename': f, 'size_bytes': size})

    return jsonify({'status': 'success', 'backups': result})
