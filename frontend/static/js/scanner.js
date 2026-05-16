// ── RECEIPT SCANNER — Gemini 3 AI Integration ──────────────────────────

// ── IMAGE OPTIMIZATION ────────────────────────────────────────
// Function to resize and compress the image before uploading to speed up processing
async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 800; // receipts are narrow — 800px is plenty for OCR
        let width = img.width;
        let height = img.height;
        const scale = Math.min(MAX_DIM / width, MAX_DIM / height, 1);
        width  = Math.round(width  * scale);
        height = Math.round(height * scale);

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.65);
      };
    };
  });
}

// ── OFFLINE BANNER ────────────────────────────────────────────
function updateScannerOfflineState() {
  const banner     = document.getElementById('scanner-offline-banner');
  const fileLabel  = document.querySelector('label[for="scanner-file"]');
  const fileInput  = document.getElementById('scanner-file');
  const processBtn = document.getElementById('btn-scan-process');

  const offline = !navigator.onLine;

  if (banner)    banner.style.display   = offline ? 'flex' : 'none';
  if (fileLabel) fileLabel.style.opacity = offline ? '0.45' : '1';
  if (fileInput) fileInput.disabled      = offline;

  // Only re-enable process btn if a file is already selected
  if (processBtn && offline) processBtn.disabled = true;
  if (processBtn && !offline && fileInput && fileInput.files[0]) {
    processBtn.disabled = false;
  }
}

// ── MODAL OPEN / CLOSE ────────────────────────────────────────
function openScannerModal() {
  const modal = document.getElementById('scanner-modal');
  if (!modal) return;
  modal.classList.add('active');
  resetScannerUI();
  updateScannerOfflineState();
}

function closeScannerModal() {
  const modal = document.getElementById('scanner-modal');
  if (modal) modal.classList.remove('active');
  resetScannerUI();
}

function resetScannerUI() {
  const preview = document.getElementById('scanner-preview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  
  const result = document.getElementById('scanner-result');
  if (result) result.innerHTML = '';
  
  const fileInput = document.getElementById('scanner-file');
  if (fileInput) fileInput.value = '';
  
  const processBtn = document.getElementById('btn-scan-process');
  if (processBtn) processBtn.disabled = true;
  
  const progress = document.getElementById('scanner-progress');
  if (progress) progress.style.display = 'none';
  
  const progressBar = document.getElementById('scanner-progress-bar');
  if (progressBar) progressBar.style.width = '0%';
}

// ── PROCESS IMAGE WITH GEMINI ─────────────────────────────────────────────
async function processReceiptImage() {
  const fileInput = document.getElementById('scanner-file');
  if (!fileInput || !fileInput.files[0]) return;
  const file = fileInput.files[0];

  const progressEl  = document.getElementById('scanner-progress');
  const progressBar = document.getElementById('scanner-progress-bar');
  const progressTxt = document.getElementById('scanner-progress-text');
  const resultEl    = document.getElementById('scanner-result');
  const btn         = document.getElementById('btn-scan-process');

  btn.disabled             = true;
  progressEl.style.display = 'block';
  progressTxt.textContent  = 'Optimizing & Sending...';
  progressBar.style.width  = '20%';

  try {
    // STEP 1: Compress the image first (Speed Boost!)
    const compressedBlob = await compressImage(file);
    progressBar.style.width = '40%';
    progressTxt.textContent = 'Gemini AI is analyzing...';

    const formData = new FormData();
    formData.append('file', compressedBlob, 'receipt.jpg');

    // STEP 2: Send to your Flask backend
    const response = await fetch('/api/v1/receipt/upload-receipt', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || 'AI processing failed');
    }
    
    const data = await response.json();
    
    progressBar.style.width = '100%';
    progressTxt.textContent = '✅ Analysis Complete!';

    // Encode strings to prevent special characters from breaking the HTML button
    const safeStore = encodeURIComponent(data.store || 'Unknown');
    const safeCat = encodeURIComponent(data.category || 'Others');

    resultEl.innerHTML = `
      <div class="scan-result-box" style="padding: 15px; background: rgba(0,0,0,0.03); border-radius: 10px; margin-top: 10px;">
        <h3 style="margin-bottom: 10px; font-size: 1rem;">✨ AI Extracted Details</h3>
        <div class="scan-field" style="display:flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">🏪 Store:</span>
          <strong>${data.store || 'Unknown'}</strong>
        </div>
        <div class="scan-field" style="display:flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">💰 Amount:</span>
          <strong>₱${data.total || '0.00'}</strong>
        </div>
        <div class="scan-field" style="display:flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: var(--text-muted);">🏷️ Category:</span>
          <strong>${data.category}</strong>
        </div>
        <div class="scan-field" style="display:flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: var(--text-muted);">📅 Date:</span>
          <strong>${data.date || 'Today'}</strong>
        </div>
        
        <div style="display:flex; gap:8px; margin-top:4px;">
          <button class="btn btn-secondary"
                  style="flex:1; padding:12px;"
                  onclick="applyScannedData('${safeStore}', '${data.total}', '${safeCat}', '${data.date}')">
            Edit First
          </button>
          <button class="btn btn-primary"
                  style="flex:1; padding:12px; font-weight:bold;"
                  onclick="applyAndSave('${safeStore}', '${data.total}', '${safeCat}', '${data.date}')">
            Save Now
          </button>
        </div>
      </div>
    `;

  } catch (err) {
    console.error(err);
    progressEl.style.display = 'none';
    btn.disabled = false;
    resultEl.innerHTML = `<div class="scan-error" style="color: red; text-align: center;">❌ AI Error: ${err.message}</div>`;
  }
}

// ── APPLY TO FORM ──────────────────────────────────────────────────────────
function applyScannedData(encodedStore, total, encodedCategory, date) {
  const storeVal = decodeURIComponent(encodedStore);
  const catVal = decodeURIComponent(encodedCategory);

  const titleField = document.getElementById('exp-title');
  const amountField = document.getElementById('exp-amount');
  const catSelect = document.getElementById('exp-category');
  const dateField = document.getElementById('exp-date');
  const hintBox = document.getElementById('ai-category-hint');

  // 1. Fill Title
  if (titleField) titleField.value = storeVal;

  // 2. Fill Amount (Clean commas for numeric input)
  if (amountField) {
      amountField.value = String(total).replace(/,/g, '');
  }
  
  // 3. Fill Category with Fuzzy Matching
  if (catSelect) {
    catSelect.value = catVal; // Try direct match first

    if (!catSelect.value) {
      // Handle "and" vs "&" differences
      const normalizedAI = catVal.toLowerCase().replace('and', '&').trim();
      for (let opt of catSelect.options) {
        const normalizedOpt = opt.value.toLowerCase().replace('and', '&').trim();
        if (normalizedOpt === normalizedAI || opt.text.toLowerCase().includes(normalizedAI)) {
          catSelect.value = opt.value;
          break;
        }
      }
    }
    // Fallback if still not found
    if (!catSelect.value) catSelect.value = "Others";
  }

  // 4. Fill Date — always use today so the daily chart picks it up;
  //    the receipt's printed date is shown as a hint below the field.
  if (dateField) {
    dateField.value = new Date().toISOString().split('T')[0];
  }

  // 5. Update UI Hint
  if (hintBox) {
      hintBox.style.display = 'block';
      const receiptDate = date ? ` &nbsp;·&nbsp; Receipt date: <strong>${date}</strong>` : '';
      hintBox.innerHTML = `✨ Gemini suggested <strong>${catVal}</strong> based on the receipt.${receiptDate}`;
  }

  // 6. Trigger local ML Prediction (Predict.js)
  if (window.getAIRecommendation) {
      window.getAIRecommendation();
  }

  closeScannerModal();
  if (typeof showToast === 'function') showToast('✅ Data imported from receipt!');
}

// ── APPLY + SAVE IN ONE TAP ───────────────────────────────────
async function applyAndSave(encodedStore, total, encodedCategory, date) {
  applyScannedData(encodedStore, total, encodedCategory, date);
  if (typeof handleAddExpense === 'function') await handleAddExpense();
}

// ── EVENT LISTENERS ───────────────────────────────────────────
window.addEventListener('load', () => {
  const scanBtn = document.getElementById('btn-scan-receipt');
  if (scanBtn) scanBtn.addEventListener('click', openScannerModal);

  const closeBtn = document.getElementById('btn-close-scanner');
  if (closeBtn) closeBtn.addEventListener('click', closeScannerModal);

  const processBtn = document.getElementById('btn-scan-process');
  if (processBtn) processBtn.addEventListener('click', processReceiptImage);

  const fileInput = document.getElementById('scanner-file');
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;

      const preview = document.getElementById('scanner-preview');
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';

      // Only enable process button if online
      const processBtn = document.getElementById('btn-scan-process');
      if (processBtn) processBtn.disabled = !navigator.onLine;

      // Clear previous results
      const resultEl = document.getElementById('scanner-result');
      if (resultEl) resultEl.innerHTML = '';
    });
  }

  // React to connectivity changes while modal is open
  window.addEventListener('online',  () => {
    const modal = document.getElementById('scanner-modal');
    if (modal?.classList.contains('active')) updateScannerOfflineState();
  });
  window.addEventListener('offline', () => {
    const modal = document.getElementById('scanner-modal');
    if (modal?.classList.contains('active')) updateScannerOfflineState();
  });
});