from flask import Blueprint, request, jsonify, session
from models.user import get_user_by_id
from config import Config
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


def send_verification_email(to_email, name, verify_url):
    import requests as _requests
    html = f"""
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#6c4fff,#3b37b8);padding:2rem;text-align:center;color:white;">
        <h1 style="margin:0;font-size:1.5rem;">Verify your email</h1>
        <p style="margin:0.5rem 0 0;opacity:0.85;">SmartExpense</p>
      </div>
      <div style="background:#fff;padding:2rem;">
        <p style="color:#333;">Hi <strong>{name}</strong>,</p>
        <p style="color:#555;">Thanks for signing up! Click the button below to verify your email address and activate your account.</p>
        <div style="text-align:center;margin:1.75rem 0;">
          <a href="{verify_url}" style="background:#6c4fff;color:white;padding:0.85rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;">
            Verify Email Address
          </a>
        </div>
        <p style="color:#888;font-size:0.85rem;">Or copy this link into your browser:</p>
        <p style="color:#6c4fff;font-size:0.82rem;word-break:break-all;">{verify_url}</p>
        <p style="color:#aaa;font-size:0.78rem;margin-top:1.5rem;text-align:center;">If you did not create an account, you can ignore this email.</p>
        <p style="color:#bbb;font-size:0.78rem;text-align:center;">SmartExpense — Email Verification</p>
      </div>
    </div>
    """
    resp = _requests.post(
        'https://api.brevo.com/v3/smtp/email',
        headers={
            'api-key': Config.BREVO_API_KEY,
            'Content-Type': 'application/json'
        },
        json={
            'sender': {'email': Config.GMAIL_USER, 'name': 'SmartExpense'},
            'to': [{'email': to_email, 'name': name}],
            'subject': 'Verify your SmartExpense account',
            'htmlContent': html
        },
        timeout=15
    )
    if resp.status_code >= 400:
        raise Exception(f'Brevo error {resp.status_code}: {resp.text}')

email_alert_bp = Blueprint('email_alert', __name__)


@email_alert_bp.route('/api/v1/pin-alert', methods=['POST'])
def pin_alert():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401

    data   = request.get_json() or {}
    device = data.get('device', 'Unknown device')

    user = get_user_by_id(session['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    try:
        _send_alert_email(user['name'], user['email'], device)
        return jsonify({'sent': True})
    except Exception as e:
        print(f'[PIN Alert] Email error: {e}')
        return jsonify({'sent': False, 'error': str(e)}), 500


def _send_alert_email(name, to_email, device):
    now = datetime.now().strftime('%B %d, %Y at %I:%M %p')

    html = f"""
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#6c63ff,#3b37b8);padding:2rem;text-align:center;color:white;">
        <h1 style="margin:0;font-size:1.5rem;">⚠️ Suspicious Login Attempt</h1>
        <p style="margin:0.5rem 0 0;opacity:0.85;">SmartExpense</p>
      </div>
      <div style="background:#fff;padding:2rem;">
        <p style="color:#333;">Hi <strong>{name}</strong>,</p>
        <p style="color:#555;">Someone entered the <strong>wrong PIN 3 times</strong> on your account. Your account has been locked for 5 minutes.</p>
        <div style="background:#f5f5ff;border-radius:12px;padding:1.25rem;margin:1.5rem 0;">
          <p style="margin:0.4rem 0;color:#444;">📅 <strong>Time:</strong> {now}</p>
          <p style="margin:0.4rem 0;color:#444;">📱 <strong>Device:</strong> {device}</p>
          <p style="margin:0.4rem 0;color:#444;">🔢 <strong>Failed Attempts:</strong> 3 of 3</p>
          <p style="margin:0.4rem 0;color:#444;">⏱️ <strong>Status:</strong> Locked for 5 minutes</p>
        </div>
        <p style="color:#555;">If this was you, ignore this email — your account unlocks automatically after 5 minutes.</p>
        <p style="color:#555;">If this <strong>wasn't you</strong>, reset your PIN immediately:</p>
        <div style="text-align:center;margin:1.5rem 0;">
          <a href="{Config.APP_URL}" style="background:#e53e3e;color:white;padding:0.85rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;">
            No, Reset My PIN Now
          </a>
        </div>
        <p style="color:#bbb;font-size:0.78rem;text-align:center;margin-top:1.5rem;">SmartExpense — Automated Security Alert</p>
      </div>
    </div>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = '⚠️ SmartExpense — Suspicious PIN Attempt'
    msg['From']    = Config.GMAIL_USER
    msg['To']      = to_email
    msg.attach(MIMEText(html, 'html'))

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
        smtp.login(Config.GMAIL_USER, Config.GMAIL_APP_PASSWORD)
        smtp.sendmail(Config.GMAIL_USER, to_email, msg.as_string())
