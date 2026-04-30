import os
import json
from flask import Blueprint, request, jsonify
from google import genai
from google.genai import types

# Initialize the Blueprint
receipt_bp = Blueprint('receipt', __name__)

# Use environment variable instead of hardcoded key
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
client = genai.Client(api_key=GEMINI_API_KEY)

@receipt_bp.route('/upload-receipt', methods=['POST'])
def upload_receipt():
    # 1. Check if file exists in request
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # 2. Read image bytes
        image_bytes = file.read()

        # 3. Build the prompt with STRICT JSON instructions
        prompt = """
        Analyze this receipt. Extract the Store Name, Total Amount, Date, and Category.
        The category MUST be one of: Food & Dining, Transportation, Utilities & Bills, Shopping, Healthcare, Entertainment, Education, Housing & Rent, Savings.
        Return ONLY valid JSON in this format:
        {"store": "string", "total": float, "date": "YYYY-MM-DD", "category": "string"}
        """

        # 4. Call Gemini Flash
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
                prompt
            ]
        )

        # 5. Clean and parse the response
        raw_text = response.text.strip()
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        data = json.loads(raw_text)
        
        return jsonify(data)

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({"error": "Failed to process receipt", "details": str(e)}), 500