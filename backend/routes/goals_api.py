import json
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one, execute, get_connection

goals_api_bp = Blueprint('goals_api', __name__)


def _uid():
    return session.get('user_id')


@goals_api_bp.route('/goals', methods=['GET'])
def get_goals():
    uid = _uid()
    if not uid:
        return jsonify({'status': 'error'}), 401
    rows = query_all(
        "SELECT id, name, icon, target_amount, saved_amount, deadline, contributions, created_at "
        "FROM goals WHERE user_id = %s ORDER BY created_at ASC", (uid,)
    )
    result = []
    for g in rows:
        result.append({
            'id':            g['id'],
            'name':          g['name'],
            'icon':          g['icon'] or '🎯',
            'targetAmount':  float(g['target_amount']),
            'savedAmount':   float(g['saved_amount']),
            'deadline':      g['deadline'].isoformat() if g['deadline'] else None,
            'contributions': json.loads(g['contributions']) if g['contributions'] else [],
            'createdAt':     g['created_at'].isoformat() if g['created_at'] else None,
        })
    return jsonify(result)


@goals_api_bp.route('/goals', methods=['POST'])
def create_goal():
    uid = _uid()
    if not uid:
        return jsonify({'status': 'error'}), 401
    data   = request.get_json() or {}
    name   = str(data.get('name', '')).strip()
    icon   = str(data.get('icon', '🎯'))
    target = float(data.get('targetAmount', 0) or 0)
    deadline = data.get('deadline') or None

    if not name or target <= 0:
        return jsonify({'status': 'error', 'message': 'Invalid goal'}), 400

    # Validate deadline format if provided
    if deadline:
        try:
            datetime.strptime(deadline, '%Y-%m-%d')
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid deadline format'}), 400

    # savedAmount always starts at 0 — client value is ignored
    goal_id = execute(
        "INSERT INTO goals (user_id, name, icon, target_amount, saved_amount, deadline, contributions) "
        "VALUES (%s, %s, %s, %s, 0, %s, '[]')",
        (uid, name, icon, target, deadline)
    )
    if not goal_id:
        return jsonify({'status': 'error', 'message': 'Failed to save goal'}), 500
    return jsonify({'status': 'success', 'id': goal_id})


@goals_api_bp.route('/goals/<int:goal_id>/fund', methods=['POST'])
def fund_goal(goal_id):
    """Atomic fund — adds a delta amount instead of setting an absolute value."""
    uid = _uid()
    if not uid:
        return jsonify({'status': 'error'}), 401

    data = request.get_json() or {}
    try:
        amount = float(data.get('amount', 0) or 0)
        if amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'status': 'error', 'message': 'Invalid amount'}), 400

    contribution = {
        'amount': amount,
        'date':   data.get('date') or datetime.now(timezone.utc).isoformat(),
    }

    conn = get_connection()
    if not conn:
        return jsonify({'status': 'error', 'message': 'DB unavailable'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT saved_amount, contributions FROM goals WHERE id = %s AND user_id = %s FOR UPDATE",
            (goal_id, uid)
        )
        goal = cursor.fetchone()
        if not goal:
            return jsonify({'status': 'error', 'message': 'Goal not found'}), 404

        new_saved    = float(goal['saved_amount']) + amount
        contribs     = json.loads(goal['contributions']) if goal['contributions'] else []
        contribs.append(contribution)

        cursor.execute(
            "UPDATE goals SET saved_amount = %s, contributions = %s WHERE id = %s AND user_id = %s",
            (new_saved, json.dumps(contribs), goal_id, uid)
        )
        conn.commit()
        return jsonify({'status': 'success', 'savedAmount': round(new_saved, 2)})
    except Exception as e:
        conn.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        conn.close()


@goals_api_bp.route('/goals/<int:goal_id>', methods=['PUT'])
def update_goal(goal_id):
    uid = _uid()
    if not uid:
        return jsonify({'status': 'error'}), 401
    data  = request.get_json() or {}
    try:
        saved = float(data.get('savedAmount', 0) or 0)
        if saved < 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'status': 'error', 'message': 'Invalid savedAmount'}), 400
    contributions = json.dumps(data.get('contributions', []))
    execute(
        "UPDATE goals SET saved_amount = %s, contributions = %s WHERE id = %s AND user_id = %s",
        (saved, contributions, goal_id, uid)
    )
    return jsonify({'status': 'success'})


@goals_api_bp.route('/goals/<int:goal_id>', methods=['DELETE'])
def delete_goal(goal_id):
    uid = _uid()
    if not uid:
        return jsonify({'status': 'error'}), 401
    execute("DELETE FROM goals WHERE id = %s AND user_id = %s", (goal_id, uid))
    return jsonify({'status': 'success'})


@goals_api_bp.route('/goals', methods=['DELETE'])
def delete_all_goals():
    uid = _uid()
    if not uid:
        return jsonify({'status': 'error'}), 401
    execute("DELETE FROM goals WHERE user_id = %s", (uid,))
    return jsonify({'status': 'success'})
