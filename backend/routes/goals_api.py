import json
from flask import Blueprint, jsonify, request, session
from models.db import query_all, query_one, execute

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
    target = float(data.get('targetAmount', 0))
    saved  = float(data.get('savedAmount', 0))
    deadline      = data.get('deadline') or None
    contributions = json.dumps(data.get('contributions', []))
    if not name or target <= 0:
        return jsonify({'status': 'error', 'message': 'Invalid goal'}), 400
    goal_id = execute(
        "INSERT INTO goals (user_id, name, icon, target_amount, saved_amount, deadline, contributions) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (uid, name, icon, target, saved, deadline, contributions)
    )
    return jsonify({'status': 'success', 'id': goal_id})


@goals_api_bp.route('/goals/<int:goal_id>', methods=['PUT'])
def update_goal(goal_id):
    uid = _uid()
    if not uid:
        return jsonify({'status': 'error'}), 401
    data  = request.get_json() or {}
    saved = float(data.get('savedAmount', 0))
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
