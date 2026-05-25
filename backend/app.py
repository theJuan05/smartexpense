import os
import logging
from datetime import timedelta
from flask import Flask, jsonify, render_template, send_from_directory, make_response, session
from flask_cors import CORS
from config import Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s'
)

# Blueprints
from routes.auth import auth_bp
from routes.email_alert import email_alert_bp
from routes.expenses import expenses_bp
from routes.analysis import analysis_bp
from routes.budgets import budgets_bp
from routes.ai import ai_bp
from routes.anomaly import anomaly_bp
from routes.advice import advice_bp
from routes.receipt_ocr import receipt_bp
from routes.push import push_bp
from routes.goals_api import goals_api_bp
from routes.backup import backup_bp

# -----------------------------
# APP SETUP
# -----------------------------
base_dir = os.path.abspath(os.path.dirname(__file__))
frontend_dir = os.path.join(base_dir, '..', 'frontend')

app = Flask(
    __name__,
    static_folder=os.path.join(frontend_dir, "static"),
    template_folder=os.path.join(frontend_dir, "templates")
)

app.config.from_object(Config)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
_allowed_origin = Config.APP_URL.rstrip('/')
CORS(app, resources={r"/api/*": {"origins": [_allowed_origin, "http://localhost:5000"]}}, supports_credentials=True)

# ── Prometheus metrics (exposes /metrics for Grafana dashboard) ─
try:
    from prometheus_flask_exporter import PrometheusMetrics
    PrometheusMetrics(app, default_labels={'app': 'smartexpense'})
except ImportError:
    pass  # Optional — app runs fine without it

# -----------------------------
# REGISTER BLUEPRINTS
# -----------------------------
app.register_blueprint(auth_bp)
app.register_blueprint(email_alert_bp)
app.register_blueprint(expenses_bp, url_prefix='/api/v1')
app.register_blueprint(analysis_bp, url_prefix='/api/v1')
app.register_blueprint(budgets_bp,  url_prefix='/api/v1')
app.register_blueprint(ai_bp,       url_prefix='/api/v1')
app.register_blueprint(anomaly_bp,  url_prefix='/api/v1')
app.register_blueprint(advice_bp,   url_prefix='/api/v1')
app.register_blueprint(receipt_bp,  url_prefix='/api/v1/receipt')
app.register_blueprint(push_bp,     url_prefix='/api/v1')
app.register_blueprint(goals_api_bp, url_prefix='/api/v1')
app.register_blueprint(backup_bp,   url_prefix='/api/v1')

# -----------------------------
# SECURITY HEADERS
# -----------------------------
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options']        = 'DENY'
    response.headers['X-XSS-Protection']       = '1; mode=block'
    response.headers['Referrer-Policy']        = 'strict-origin-when-cross-origin'
    return response

# -----------------------------
# FRONTEND ROUTES
# -----------------------------
@app.route('/')
def index():
    if 'user_id' in session:
        return render_template("index.html")
    return render_template("landing.html")

@app.route('/privacy')
def privacy():
    return render_template("privacy.html")

# -----------------------------
# API UTILITIES
# -----------------------------
@app.route('/service-worker.js')
def service_worker():
    response = make_response(
        send_from_directory(app.static_folder, 'service-worker.js')
    )
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Service-Worker-Allowed'] = '/'
    return response


@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({
        "status": "ok",
        "message": "SmartExpense backend is running!"
    })

@app.route('/firebase-messaging-sw.js')
def serve_firebase_sw():
    response = make_response(
        send_from_directory(os.path.join(app.static_folder, 'js'), 'firebase-messaging-sw.js')
    )
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


# Ensure DB schema is up to date, then warm up the ML classifier
with app.app_context():
    try:
        from models.db import ensure_schema
        ensure_schema()
    except Exception as e:
        logging.warning('[Schema] ensure_schema failed: %s', e)
    try:
        from ml.classifier import get_classifier
        get_classifier()
    except Exception as e:
        logging.warning('[ML] Classifier warm-up failed: %s', e)

# Start background scheduler (daily budget reminders)
# Gunicorn: use --preload so this runs once in the master process, not per worker
try:
    from scheduler import start_scheduler
    start_scheduler(app)
except Exception as e:
    logging.warning('[Scheduler] Failed to start: %s', e)

if __name__ == '__main__':
    print("=" * 50)
    print("  SmartExpense - Flask Backend")
    print("  Running at: http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000, use_reloader=True, reloader_type='stat')