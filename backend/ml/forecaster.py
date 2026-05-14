# forecaster.py — Linear Regression spending forecaster (scikit-learn)
# Trains on the user's monthly spending history to predict next month's total.

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib
import os

FORECASTER_PATH = os.path.join(os.path.dirname(__file__), 'forecaster.pkl')


def train_and_predict(monthly_totals: list[float]) -> dict:
    """
    Given a list of monthly spending totals (oldest → newest),
    trains a Linear Regression and returns the predicted next-month total
    plus model metrics.

    Returns None if fewer than 2 data points.
    """
    n = len(monthly_totals)
    if n < 2:
        return None

    X = np.arange(n).reshape(-1, 1).astype(float)
    y = np.array(monthly_totals, dtype=float)

    model = Pipeline([
        ('scaler', StandardScaler()),
        ('lr', LinearRegression()),
    ])
    model.fit(X, y)

    # Persist so the .pkl file exists for submission
    joblib.dump(model, FORECASTER_PATH)

    # Predict next month (index n)
    next_X = np.array([[float(n)]])
    predicted = float(model.predict(next_X)[0])
    predicted = max(0.0, predicted)

    # R² score — how well the trend fits (0–1)
    r2 = float(model.score(X, y))

    # Trend direction based on regression slope
    lr = model.named_steps['lr']
    sc = model.named_steps['scaler']
    # Slope in original units: coef / scale
    slope = float(lr.coef_[0]) / float(sc.scale_[0])

    return {
        'predicted':  round(predicted, 2),
        'r2_score':   round(max(0.0, r2), 3),
        'slope':      round(slope, 2),
        'n_months':   n,
        'trend':      'up' if slope > 50 else 'down' if slope < -50 else 'stable',
    }
