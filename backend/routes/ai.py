# ai.py — ML-powered expense categorization (TF-IDF + Logistic Regression)

from flask import Blueprint, jsonify, request
from ml.classifier import predict as ml_predict
import re

ai_bp = Blueprint('ai', __name__)

# ── Keyword fallback (used when ML confidence is low) ──────
KEYWORD_MAP = {
    'Food & Dining'    : ['jollibee','mcdo','mcdonald','kfc','burger','pizza','food',
                          'meal','lunch','dinner','breakfast','snack','coffee','starbucks',
                          'cafe','restaurant','grocery','groceries','supermarket','palengke',
                          'market','grab food','foodpanda','mang inasal','chowking',
                          'greenwich','shakeys','bonchon','siomai','dimsum','ramen',
                          'pasta','bread','bakery','ulam','inihaw','bbq','milk tea'],
    'Transportation'   : ['grab','angkas','taxi','jeep','jeepney','bus','mrt','lrt',
                          'train','fare','transport','commute','ride','gas','gasoline',
                          'petrol','fuel','parking','toll','expressway','nlex','slex',
                          'skyway','car wash','oil change','lto','tricycle','pedicab',
                          'ferry','airline','cebu pacific','pal flight'],
    'Utilities & Bills': ['meralco','electric','maynilad','manila water','internet',
                          'wifi','globe','smart','pldt','converge','phone bill','load',
                          'prepaid','postpaid','netflix','spotify','disney','subscription',
                          'lpg','gasul','association dues','hoa','cable','utility'],
    'Shopping'         : ['shopee','lazada','zalora','shein','tiktok shop','sm','ayala',
                          'robinsons','mall','clothes','clothing','shoes','bag',
                          'gadget','laptop','phone','tablet','earphones','appliance',
                          'furniture','decor','h&m','uniqlo','penshoppe','bench','nike',
                          'adidas'],
    'Healthcare'       : ['hospital','clinic','doctor','dentist','medicine','pharmacy',
                          'watsons','mercury','generika','rose pharmacy','laboratory',
                          'xray','x-ray','ultrasound','checkup','prescription','vitamins',
                          'supplement','health','eyeglasses','contact lens','hmo',
                          'philhealth','vaccine'],
    'Entertainment'    : ['movie','cinema','imax','concert','show','event','ticket',
                          'karaoke','videoke','bar','club','gimik','game','gaming','steam',
                          'playstation','xbox','beach','resort','hotel','vacation','travel',
                          'tour','airbnb','enkanto','enchanted kingdom'],
    'Education'        : ['tuition','school','university','college','book','notebook',
                          'supplies','course','training','seminar','workshop','tutorial',
                          'review','review center','uniform','allowance','project',
                          'udemy','coursera','skillshare','ielts'],
    'Savings'          : ['savings','save','deposit','bank','invest','stock','crypto',
                          'mutual fund','uitf','insurance','sss','pagibig','pag-ibig',
                          'philhealth','emergency fund','retirement','mp2','bdo','bpi'],
    'Housing & Rent'   : ['rent','condo','apartment','house','housing','landlord',
                          'amortization','mortgage','pag-ibig loan','repair','renovation',
                          'plumber','electrician','aircon','cleaning','laundry',
                          'association dues','hoa','boarding'],
}

MIN_ML_CONFIDENCE = 0.40   # fall back to keywords below this threshold


def _keyword_score(text: str) -> dict:
    """Return {category: score} from keyword matching."""
    normalized = re.sub(r'[^a-z0-9\s]', ' ', text.lower()).strip()
    words  = normalized.split()
    scores = {}

    for cat, keywords in KEYWORD_MAP.items():
        score = 0
        for kw in keywords:
            kw_norm = kw.lower()
            if kw_norm in normalized:
                score += len(kw_norm.split()) * 2
            else:
                for w in kw_norm.split():
                    if w in words and len(w) > 2:
                        score += 1
        if score > 0:
            scores[cat] = score

    return scores


def categorize(title: str) -> dict:
    """
    1. Try ML classifier first.
    2. If confidence < MIN_ML_CONFIDENCE, use keyword fallback.
    3. If keywords also fail, return Others.
    """
    try:
        ml_result = ml_predict(title)
    except Exception:
        ml_result = {'category': 'Others', 'confidence': 0.0}

    if ml_result['confidence'] >= MIN_ML_CONFIDENCE:
        return ml_result

    # Keyword fallback
    scores = _keyword_score(title)
    if scores:
        best = max(scores, key=scores.get)
        return {
            'category'  : best,
            'confidence': round(min(scores[best] / 10.0, 0.99), 2),
        }

    return {'category': 'Others', 'confidence': 0.0}


# ── POST /api/ai/categorize ────────────────────────────────
@ai_bp.route('/ai/categorize', methods=['POST'])
def categorize_expense():
    data  = request.get_json()
    title = data.get('title', '') if data else ''

    if not title:
        return jsonify({'status': 'error', 'message': 'No title provided'}), 400

    result = categorize(title)
    return jsonify({
        'status'    : 'success',
        'title'     : title,
        'category'  : result['category'],
        'confidence': result['confidence'],
    })


# ── POST /api/ai/categorize-batch ─────────────────────────
@ai_bp.route('/ai/categorize-batch', methods=['POST'])
def categorize_batch():
    data   = request.get_json()
    titles = data.get('titles', []) if data else []

    if not titles or not isinstance(titles, list):
        return jsonify({'status': 'error', 'message': 'Provide a list of titles'}), 400

    results = []
    for title in titles[:50]:
        r = categorize(title)
        results.append({
            'title'     : title,
            'category'  : r['category'],
            'confidence': r['confidence'],
        })

    return jsonify({'status': 'success', 'data': results})
