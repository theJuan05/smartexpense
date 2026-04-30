import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    DB_HOST     = os.getenv('DB_HOST', '127.0.0.1')
    DB_USER     = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_NAME     = os.getenv('DB_NAME', 'smartexpense')

    SECRET_KEY     = os.getenv('SECRET_KEY')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')
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
    APP_URL            = os.getenv('APP_URL', 'http://localhost:5000')