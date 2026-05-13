# SmartExpense AI Pro — Project Summary

## Overview

SmartExpense AI Pro is a mobile-first personal finance Progressive Web App (PWA) built for the Philippine market. It combines expense tracking with AI-powered features including automatic categorization, receipt OCR, anomaly detection, spending predictions, and personalized financial advice.

**Stack:** Flask (Python) backend · Vanilla JS frontend · MySQL database · IndexedDB for offline storage · Service Worker / PWA

---

## Project Structure

```
smartexpense/
├── backend/
│   ├── app.py               # Flask app init & route registration
│   ├── config.py            # Environment configuration
│   ├── requirements.txt     # Python dependencies
│   ├── models/              # DB connection pooling & user CRUD
│   ├── routes/              # API blueprints (10 modules)
│   ├── security/            # JWT auth & AES-256-GCM encryption
│   ├── ml/                  # TF-IDF + Logistic Regression classifier
│   ├── static/              # Frontend assets (JS, CSS, icons, manifest)
│   └── templates/           # HTML templates (Jinja2)
├── PRODUCT.md               # Product requirements & brand guidelines
├── DESIGN.md / DESIGN.json  # Design specs & tokens
└── summary.md               # This file
```

---

## API Endpoints

All API routes are versioned under `/api/v1/`.

### Authentication (`routes/auth.py`)

| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/login` | User login with email/password |
| GET/POST | `/register` | Registration with email verification |
| GET | `/verify-email/<token>` | Confirm account via emailed token |
| GET | `/logout` | Clear session |
| GET | `/api/v1/auth/status` | Check auth status & get JWT token |
| POST | `/api/v1/user/income` | Update monthly income |
| DELETE | `/api/v1/user/delete` | Delete account & all data |

### Expenses (`routes/expenses.py`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/expenses` | Get all expenses (latest 100); AES-256 decrypted |
| POST | `/api/v1/expenses` | Add expense; title & notes AES-256 encrypted |
| DELETE | `/api/v1/expenses/<id>` | Delete single expense |
| DELETE | `/api/v1/expenses` | Clear all expenses |
| GET | `/api/v1/categories` | List all categories with icons & colors |

### Budgets (`routes/budgets.py`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/budgets` | List all budgets with category info |
| POST | `/api/v1/budgets` | Create or update budget (upsert) |
| DELETE | `/api/v1/budgets/<id>` | Delete specific budget |
| DELETE | `/api/v1/budgets` | Clear all budgets |
| GET | `/api/v1/budgets/summary` | Budgets with actual spending; status: ok / warning / danger |
| POST | `/api/v1/budgets/notify` | Send push alerts for budgets at 70%+ or 90%+ |

### AI Categorization (`routes/ai.py`)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/ai/categorize` | Categorize a single expense title (TF-IDF + Logistic Regression; keyword fallback < 40% confidence) |
| POST | `/api/v1/ai/categorize-batch` | Batch categorize up to 50 titles |

**Supported categories:** Food & Dining · Transportation · Utilities & Bills · Shopping · Healthcare · Entertainment · Education · Housing & Rent · Savings · Others

### Anomaly Detection (`routes/anomaly.py`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/anomaly/detect` | Detect anomalies in expenses from the last N days (default 90) |
| POST | `/api/v1/anomaly/check-single` | Pre-save check: is this new expense anomalous? |

Detection methods: statistical outliers (Z-score > 2.5), category spikes, duplicates (same title + amount within 3 days), daily spending spikes (2–3× average), budget overruns. Returns results with severity: `high` / `medium` / `low`.

### Spending Analysis & Predictions (`routes/analysis.py`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/analysis/predict` | End-of-month forecast based on 3-month history; includes risk assessment & budget comparison |
| GET | `/api/v1/analysis/forecast-chart` | Daily spending + projected line for current month (chart data) |
| GET | `/api/v1/analysis/category-trend` | Category spending breakdown for last 3 months |

### Financial Advice (`routes/advice.py`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/advice` | Personalized advice list + health score (0–100); topics: savings rate, budget adherence, top categories, emergency fund, weekly tips |

Health score labels: Excellent · Good · Fair · Poor · Critical. Advice items prioritized by urgency: danger → warning → info.

### Receipt OCR (`routes/receipt_ocr.py`)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/receipt/upload-receipt` | Upload receipt image; Google Gemini 2.5 Flash extracts store, total, date, category |

### Push Notifications (`routes/push.py`)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/push-token` | Register / update FCM device token |
| POST | `/api/v1/push-test` | Send test push notification |

### Email Alerts (`routes/email_alert.py`)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/pin-alert` | Email alert after 3 failed PIN attempts (Brevo SMTP) |

### App Shell (app.py)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Dashboard (logged in) or landing page |
| GET | `/privacy` | Privacy policy |
| GET | `/service-worker.js` | Service Worker (no-cache headers) |
| GET | `/firebase-messaging-sw.js` | Firebase messaging SW |
| GET | `/api/ping` | Health check |

---

## Frontend JavaScript Modules

Located in `backend/static/js/`:

| File | Responsibility |
|------|----------------|
| `app.js` | App init, tab routing, expense/budget add handlers, notification bell, stats refresh |
| `api.js` | Centralised HTTP client (`API.request`, `getExpenses`, `postExpense`, `categorize`, etc.) |
| `db.js` | IndexedDB layer — 7 stores: expenses, sync_queue, categories, budgets, settings, templates, goals |
| `charts.js` | Chart.js wrappers: category pie chart, daily spending line, forecast overlay |
| `pwa.js` | Install prompt, offline UI, service worker registration, background sync |
| `firebase.js` | Firebase app init & FCM messaging setup |
| `darkmode.js` | Light/dark theme toggle with system preference detection |
| `profile.js` | Settings page: profile, PIN, notifications, account deletion |
| `pinlock.js` | PIN lock overlay with failed-attempt counter |
| `scanner.js` | Receipt camera / file-upload UI → calls receipt OCR endpoint |
| `edit-expense.js` | Edit existing expense modal |
| `budget.js` | Budget create/edit/delete UI with progress bars |
| `goals.js` | Financial goal tracker UI |
| `templates.js` | Quick-add expense template management |
| `anomaly.js` | Render anomaly detection results |
| `advice.js` | Render financial advice cards & health score gauge |
| `predict.js` | Render spending prediction & forecast chart |
| `export.js` | Export expenses as CSV / PDF |
| `service-worker.js` | Offline app-shell caching & background sync queue |

---

## HTML Templates

Located in `backend/templates/`:

| Template | Purpose |
|----------|---------|
| `index.html` | Main app shell: sidebar (desktop), bottom nav (mobile), notification bell, dark mode toggle |
| `landing.html` | Public marketing page |
| `privacy.html` | Privacy policy |
| `auth/login.html` | Login form |
| `auth/register.html` | Registration form |
| `partials/dashboard.html` | Balance card, income setter, spending summary, recent transactions, charts |
| `partials/add.html` | Add expense form with AI categorize, anomaly pre-check, receipt scan |
| `partials/expense.html` | Expense list with search, filters, edit/delete |
| `partials/budget.html` | Budget management with progress indicators |
| `partials/goals.html` | Financial goals tracker |
| `partials/insights.html` | Trends, predictions, category breakdown |
| `partials/advice.html` | Advice cards & health score display |
| `partials/profile.html` | User settings, PIN, notifications, account |
| `partials/scanner.html` | Receipt camera interface |
| `partials/pin-overlay.html` | PIN lock screen overlay |

---

## Database Schema (MySQL)

| Table | Key Columns |
|-------|-------------|
| `users` | id, name, email, password_hash, verification_token, is_verified, monthly_income |
| `expenses` | id, user_id, category_id, title (encrypted), amount, expense_date, notes (encrypted), payment_method |
| `categories` | id, name, icon, color |
| `budgets` | id, user_id, category_id, amount_limit, period, start_date |
| `push_tokens` | id, user_id, token |

Sensitive fields (`title`, `notes`) are encrypted with AES-256-GCM before storage.

---

## Machine Learning (`ml/`)

- **Classifier:** TF-IDF vectorizer + Logistic Regression (`classifier.py`)
- **Training data:** Expense title examples per category in English, Filipino (Tagalog), mixed text, brand names, and common typos (`train_data.py`)
- **Inference flow:** `POST /api/v1/ai/categorize` → vectorize title → predict category → if confidence < 40%, fall back to keyword rules → return `{category, confidence}`

---

## Key Features Summary

| Feature | Technology |
|---------|-----------|
| Expense CRUD | Flask REST API · MySQL · AES-256-GCM encryption |
| Offline-first | IndexedDB · Service Worker · Background Sync |
| AI categorization | TF-IDF + Logistic Regression (scikit-learn) |
| Receipt OCR | Google Gemini 2.5 Flash |
| Anomaly detection | Z-score · duplicate detection · daily spike detection |
| Spending forecast | Daily-average projection · 3-month trend baseline |
| Financial advice | Rules engine → health score (0–100) |
| Budgets | Monthly limits · real-time % tracking · push alerts |
| Push notifications | Firebase Cloud Messaging (FCM v1) |
| Email notifications | Brevo SMTP (verification + PIN alert) |
| Authentication | JWT · Bcrypt · session cookies · email verification |
| Security | PIN lock · AES-256-GCM at rest · JWT in transit |
| PWA | Manifest · Service Worker · install prompt |
| Responsive UI | Mobile bottom nav · desktop sidebar · dark/light mode |

---

## Third-Party Integrations

| Service | Purpose |
|---------|---------|
| Google Gemini 2.5 Flash | Receipt OCR |
| Firebase Cloud Messaging | Push notifications |
| Brevo (Sendinblue) SMTP | Transactional email |
| Chart.js | Data visualizations |
| scikit-learn | ML categorization |

---

## Stats

- ~30 API endpoints across 10 Flask blueprints
- 22 JavaScript modules
- 15 HTML templates
- 5 database tables
- 5 security/ML/model support modules
