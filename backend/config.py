import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    DB_HOST     = os.getenv('DB_HOST', '127.0.0.1')
    DB_PORT     = os.getenv('DB_PORT', '')        # e.g. 3306 or Aiven's port
    DB_USER     = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_NAME     = os.getenv('DB_NAME', 'smartexpense')
    DB_SSL      = os.getenv('DB_SSL', 'false').lower() == 'true'

    SECRET_KEY     = os.getenv('SECRET_KEY') or 'change-me-in-production'
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY') or 'change-me-jwt-in-production'
    CORS_ORIGINS   = "*"

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{os.getenv('DB_USER', 'root')}:"
        f"{os.getenv('DB_PASSWORD', '')}@"
        f"{os.getenv('DB_HOST', '127.0.0.1')}/"
        f"{os.getenv('DB_NAME', 'smartexpense')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    GMAIL_USER         = os.getenv('GMAIL_USER')
    GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD')
    BREVO_API_KEY      = os.getenv('BREVO_API_KEY')
    APP_URL            = os.getenv('APP_URL', 'http://localhost:5000')

    FIREBASE_SERVER_KEY = os.getenv('FIREBASE_SERVER_KEY', '')