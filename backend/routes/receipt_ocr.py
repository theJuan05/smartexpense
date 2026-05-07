import os
import json
from flask import Blueprint, request, jsonify
from google import genai
from google.genai import types

receipt_bp = Blueprint('receipt', __name__)

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
client = genai.Client(api_key=GEMINI_API_KEY)

PROMPT = (
    'Extract from this receipt: store name, total amount due, date, and spending category. '
    'Category must be one of: Food & Dining, Transportation, Utilities & Bills, Shopping, '
    'Healthcare, Entertainment, Education, Housing & Rent, Savings. '
    'Reply with ONLY this JSON, no extra text: '
    '{"store":"string","total":float,"date":"YYYY-MM-DD","category":"string"}'
)

# Disable thinking — not needed for OCR, cuts latency significantly
_CONFIG = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_budget=0),
    max_output_tokens=128,
)

@receipt_bp.route('/upload-receipt', methods=['POST'])
def upload_receipt():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        image_bytes = file.read()

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                PROMPT
            ],
            config=_CONFIG,
        )

        raw_text = response.text.strip()
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        data = json.loads(raw_text)
        return jsonify(data)

    except Exception as e:
        print(f"Receipt OCR error: {str(e)}")
        return jsonify({"error": "Failed to process receipt", "details": str(e)}), 500
