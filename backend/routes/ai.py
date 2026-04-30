# ai.py — AI-powered expense categorization

from flask import Blueprint, jsonify, request
import re

ai_bp = Blueprint('ai', __name__)

# ── Keyword Map ────────────────────────────────────────────
# Each category has a list of keywords/patterns
# The more specific the keyword, the higher the match score

CATEGORY_KEYWORDS = {
    'Food & Dining': [
        'jollibee', 'mcdo', 'mcdonald', 'kfc', 'burger', 'pizza',
        'food', 'meal', 'lunch', 'dinner', 'breakfast', 'snack',
        'coffee', 'starbucks', 'cafe', 'restaurant', 'eat', 'mang inasal',
        'chowking', 'greenwich', 'shakeys', 'minutes', 'milk tea',
        'grocery', 'groceries', 'supermarket', 'palengke', 'market',
        'cook', 'rice', 'ulam', 'delivery', 'grab food', 'foodpanda',
        'max', 'yellow cab', 'bonchon', 'chicken', 'bbq', 'inihaw',
        'siomai', 'dimsum', 'ramen', 'pasta', 'bread', 'bakery',
    ],
    'Transportation': [
        'grab', 'angkas', 'taxi', 'uber', 'jeep', 'jeepney',
        'bus', 'mrt', 'lrt', 'train', 'fare', 'transport',
        'commute', 'ride', 'gas', 'gasoline', 'petrol', 'fuel',
        'parking', 'toll', 'expressway', 'nlex', 'slex', 'skyway',
        'car', 'vehicle', 'motorcycle', 'motor', 'tricycle',
        'pedicab', 'uv express', 'fx', 'p2p',
    ],
    'Utilities & Bills': [
        'meralco', 'electric', 'electricity', 'light bill',
        'water', 'maynilad', 'manila water', 'mwd',
        'internet', 'wifi', 'globe', 'smart', 'pldt', 'converge',
        'phone bill', 'mobile', 'load', 'prepaid', 'postpaid',
        'cable', 'tv', 'netflix', 'spotify', 'subscription',
        'rent', 'association', 'dues', 'maintenance',
        'gas bill', 'lpg', 'petron', 'shell',
        'bill', 'utility', 'utilities',
    ],
    'Shopping': [
        'shopee', 'lazada', 'zalora', 'shein', 'tiktok shop',
        'sm', 'ayala', 'robinsons', 'mall', 'department store',
        'clothes', 'clothing', 'shoes', 'bag', 'accessory',
        'gadget', 'laptop', 'phone', 'tablet', 'earphones',
        'appliance', 'ref', 'refrigerator', 'washing machine',
        'furniture', 'decor', 'home', 'kitchen',
        'bought', 'purchase', 'order', 'delivery',
    ],
    'Healthcare': [
        'hospital', 'clinic', 'doctor', 'physician', 'dentist',
        'medicine', 'drug', 'pharmacy', 'watsons', 'rose pharmacy',
        'mercury', 'generika', 'medic', 'medical',
        'laboratory', 'lab test', 'xray', 'x-ray', 'ultrasound',
        'checkup', 'consultation', 'prescription',
        'vitamins', 'supplement', 'health',
        'optika', 'eyeglasses', 'contact lens',
    ],
    'Entertainment': [
        'netflix', 'disney', 'hbo', 'amazon prime', 'youtube',
        'movie', 'cinema', 'sm cinema', 'ayala cinemas', 'imax',
        'concert', 'show', 'event', 'ticket',
        'game', 'gaming', 'steam', 'playstation', 'xbox',
        'karaoke', 'videoke', 'bar', 'club', 'gimik',
        'travel', 'hotel', 'resort', 'beach', 'vacation',
        'fun', 'leisure', 'hobby',
    ],
    'Education': [
        'tuition', 'school', 'university', 'college',
        'book', 'books', 'notebook', 'supplies', 'school supply',
        'course', 'training', 'seminar', 'workshop',
        'tutorial', 'review', 'review center',
        'uniform', 'allowance', 'project',
        'udemy', 'coursera', 'skillshare',
    ],
    'Savings': [
        'savings', 'save', 'deposit', 'bank', 'invest',
        'stock', 'crypto', 'mutual fund', 'uitf',
        'insurance', 'sss', 'pagibig', 'pag-ibig', 'philhealth',
        'emergency fund', 'retirement', 'goal',
    ],
    'Housing & Rent': [
        'rent', 'condo', 'apartment', 'house', 'housing',
        'landlord', 'amortization', 'mortgage', 'pag-ibig loan',
        'repair', 'renovation', 'construction', 'plumber',
        'electrician', 'aircon', 'cleaning', 'laundry',
        'association dues', 'hoa',
    ],
}

# ── Helper: normalize text ─────────────────────────────────
def normalize(text):
    """Lowercase and remove special characters for matching."""
    return re.sub(r'[^a-z0-9\s]', ' ', text.lower()).strip()


# ── Core categorization logic ──────────────────────────────
def categorize(title):
    """
    Score each category based on keyword matches.
    Returns the best category and a confidence score (0–1).
    """
    if not title or not title.strip():
        return {'category': 'Others', 'confidence': 0.0}

    normalized = normalize(title)
    words      = normalized.split()
    scores     = {}

    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0

        for keyword in keywords:
            kw_normalized = normalize(keyword)

            # Exact full phrase match (highest score)
            if kw_normalized in normalized:
                # Longer keyword = more specific = higher score
                score += len(kw_normalized.split()) * 2

            # Individual word match
            else:
                kw_words = kw_normalized.split()
                for kw_word in kw_words:
                    if kw_word in words and len(kw_word) > 2:
                        score += 1

        if score > 0:
            scores[category] = score

    if not scores:
        return {'category': 'Others', 'confidence': 0.0}

    # Pick the highest scoring category
    best_category = max(scores, key=scores.get)
    best_score    = scores[best_category]

    # Normalize confidence to 0–1 range (cap at 1.0)
    confidence = min(best_score / 10.0, 1.0)

    return {
        'category'  : best_category,
        'confidence': round(confidence, 2)
    }


# ── API Route ──────────────────────────────────────────────
@ai_bp.route('/ai/categorize', methods=['POST'])
def categorize_expense():
    """
    POST /api/ai/categorize
    Body: { "title": "Meralco bill" }
    Returns: { "category": "Utilities & Bills", "confidence": 0.9 }
    """
    data  = request.get_json()
    title = data.get('title', '') if data else ''

    if not title:
        return jsonify({
            'status'  : 'error',
            'message' : 'No title provided'
        }), 400

    result = categorize(title)

    return jsonify({
        'status'    : 'success',
        'title'     : title,
        'category'  : result['category'],
        'confidence': result['confidence']
    })


# ── Batch categorize (for syncing old uncategorized expenses) ──
@ai_bp.route('/ai/categorize-batch', methods=['POST'])
def categorize_batch():
    """
    POST /api/ai/categorize-batch
    Body: { "titles": ["Meralco bill", "Grab ride", "Jollibee"] }
    Returns list of category suggestions.
    """
    data   = request.get_json()
    titles = data.get('titles', []) if data else []

    if not titles or not isinstance(titles, list):
        return jsonify({
            'status' : 'error',
            'message': 'Provide a list of titles'
        }), 400

    results = []
    for title in titles[:50]:   # limit to 50 at once
        result = categorize(title)
        results.append({
            'title'     : title,
            'category'  : result['category'],
            'confidence': result['confidence']
        })

    return jsonify({'status': 'success', 'data': results})