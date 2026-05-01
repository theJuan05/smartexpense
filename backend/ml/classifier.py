# classifier.py — TF-IDF + Logistic Regression text classifier

import os
import logging
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import joblib

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.pkl')

_pipeline = None


def _train():
    from .train_data import TRAINING_DATA

    texts  = [t for t, _ in TRAINING_DATA]
    labels = [l for _, l in TRAINING_DATA]

    pipeline = Pipeline([
        # Character n-grams handle Filipino/English mixed text,
        # brand names, and typos better than word-level tokens
        ('tfidf', TfidfVectorizer(
            analyzer='char_wb',
            ngram_range=(2, 4),
            max_features=8000,
            lowercase=True,
            sublinear_tf=True,
        )),
        ('clf', LogisticRegression(
            max_iter=1000,
            C=5.0,
            solver='lbfgs',
            multi_class='auto',
        )),
    ])

    pipeline.fit(texts, labels)
    joblib.dump(pipeline, MODEL_PATH)
    logger.info('[ML] Classifier trained and saved to %s', MODEL_PATH)
    return pipeline


def get_classifier():
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    if os.path.exists(MODEL_PATH):
        try:
            _pipeline = joblib.load(MODEL_PATH)
            logger.info('[ML] Classifier loaded from cache')
        except Exception as e:
            logger.warning('[ML] Cache load failed (%s) — retraining', e)
            _pipeline = _train()
    else:
        logger.info('[ML] No saved model found — training now')
        _pipeline = _train()

    return _pipeline


def predict(title: str) -> dict:
    """Return best category and confidence (0–1) for a given expense title."""
    if not title or not title.strip():
        return {'category': 'Others', 'confidence': 0.0}

    clf   = get_classifier()
    proba = clf.predict_proba([title])[0]
    idx   = proba.argmax()

    return {
        'category'  : clf.classes_[idx],
        'confidence': round(float(proba[idx]), 2),
    }
