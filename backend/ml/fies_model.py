"""
fies_model.py — FIES (Family Income and Expenditure Survey) ML Model

Trains a Multi-Output Linear Regression on 41,544 Philippine household records
to predict monthly spending per category given a household's monthly income.

Dataset: PSA Family Income and Expenditure Survey (FIES)
Model:   MultiOutputRegressor(LinearRegression) via scikit-learn
Output:  fies_model.pkl + fies_national_averages.json
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.linear_model import LinearRegression
from sklearn.multioutput import MultiOutputRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

_DIR = os.path.dirname(__file__)
CSV_PATH   = os.path.join(_DIR, 'fies_data.csv')
MODEL_PATH = os.path.join(_DIR, 'fies_model.pkl')
AVG_PATH   = os.path.join(_DIR, 'fies_national_averages.json')

# Map app category names → FIES columns (annual figures)
CATEGORY_COLUMNS = {
    'Food & Dining':    ['Total Food Expenditure', 'Restaurant and hotels Expenditure'],
    'Housing & Rent':   ['Housing and water Expenditure'],
    'Healthcare':       ['Medical Care Expenditure'],
    'Transportation':   ['Transportation Expenditure'],
    'Utilities & Bills':['Communication Expenditure'],
    'Education':        ['Education Expenditure'],
    'Shopping':         ['Clothing, Footwear and Other Wear Expenditure',
                         'Miscellaneous Goods and Services Expenditure'],
}


def _load_and_preprocess():
    df = pd.read_csv(CSV_PATH)

    # Build monthly income feature (annual → monthly)
    df['monthly_income'] = df['Total Household Income'] / 12

    # Build monthly spending per category
    for cat, cols in CATEGORY_COLUMNS.items():
        df[cat] = df[cols].sum(axis=1) / 12

    # Drop rows with missing income or negative values
    df = df[df['monthly_income'] > 0].copy()
    for cat in CATEGORY_COLUMNS:
        df = df[df[cat] >= 0]

    return df


def train():
    """Train MultiOutput LinearRegression on FIES data and save model + averages."""
    df = _load_and_preprocess()

    X = df[['monthly_income']].values
    y = df[list(CATEGORY_COLUMNS.keys())].values

    model = Pipeline([
        ('scaler', StandardScaler()),
        ('mlr', MultiOutputRegressor(LinearRegression())),
    ])
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)

    # Compute national averages (median is more robust for skewed income data)
    averages = {
        cat: round(float(df[cat].median()), 2)
        for cat in CATEGORY_COLUMNS
    }
    averages['_national_median_income'] = round(float(df['monthly_income'].median()), 2)
    averages['_n_households'] = int(len(df))

    with open(AVG_PATH, 'w') as f:
        json.dump(averages, f, indent=2)

    return model, averages


def predict(monthly_income: float) -> dict:
    """
    Given a monthly income (PHP), return predicted monthly spending per category.
    Trains the model on first call if the .pkl doesn't exist yet.
    """
    if not os.path.exists(MODEL_PATH):
        train()

    model = joblib.load(MODEL_PATH)
    X = np.array([[monthly_income]])
    predicted = model.predict(X)[0]

    return {
        cat: max(0.0, round(float(val), 2))
        for cat, val in zip(CATEGORY_COLUMNS.keys(), predicted)
    }


def get_national_averages() -> dict:
    """Return pre-computed national median spending per category."""
    if not os.path.exists(AVG_PATH):
        train()
    with open(AVG_PATH) as f:
        return json.load(f)


if __name__ == '__main__':
    print('Training FIES model...')
    _, avgs = train()
    print('National monthly median spending:')
    for k, v in avgs.items():
        if not k.startswith('_'):
            print(f'  {k}: ₱{v:,.2f}')
    print(f"\nMedian monthly income: ₱{avgs['_national_median_income']:,.2f}")
    print(f"Households in dataset: {avgs['_n_households']:,}")
    print('Done. Model saved to fies_model.pkl')
