import os
import logging
from datetime import timedelta
from flask import Flask, jsonify, render_template
from flask_cors import CORS
from config import Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s'
)

# Blueprints
from routes.auth import auth_bp, login_required
from routes.email_alert import email_alert_bp
from routes.expenses import expenses_bp
from routes.analysis import analysis_bp
from routes.budgets import budgets_bp
from routes.ai import ai_bp
from routes.anomaly import anomaly_bp
from routes.advice import advice_bp
from routes.receipt_ocr import receipt_bp

# -----------------------------
# APP SETUP
# -----------------------------
base_dir = os.path.abspath(os.path.dirname(__file__))

app = Flask(
    __name__,
    static_folder=os.path.join(base_dir, "static"),
    template_folder=os.path.join(base_dir, "templates")
)

app.config.from_object(Config)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# -----------------------------
# REGISTER BLUEPRINTS
# -----------------------------
app.register_blueprint(auth_bp)
app.register_blueprint(email_alert_bp)
app.register_blueprint(expenses_bp, url_prefix='/api')
app.register_blueprint(analysis_bp, url_prefix='/api')
app.register_blueprint(budgets_bp, url_prefix='/api')
app.register_blueprint(ai_bp, url_prefix='/api')
app.register_blueprint(anomaly_bp, url_prefix='/api')
app.register_blueprint(advice_bp, url_prefix='/api')
app.register_blueprint(receipt_bp, url_prefix='/api/receipt')

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
# FRONTEND ROUTE — protected
# -----------------------------
@app.route('/')
@login_required                                        # ← blocks access if not logged in
def index():
    return render_template("index.html")

# -----------------------------
# API UTILITIES
# -----------------------------
@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({
        "status": "ok",
        "message": "SmartExpense AI Pro backend is running!"
    })

# Warm up the ML classifier at startup so the first request isn't slow
with app.app_context():
    try:
        from ml.classifier import get_classifier
        get_classifier()
    except Exception as e:
        logging.warning('[ML] Classifier warm-up failed: %s', e)

if __name__ == '__main__':
    print("=" * 50)
    print("  SmartExpense AI Pro - Flask Backend")
    print("  Running at: http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)