# ── Stage 1: Build ────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# System deps needed by cryptography, Pillow, mysql-connector
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    pkg-config \
    default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir google-auth google-auth-httplib2


# ── Stage 2: Runtime ──────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Minimal runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source
COPY backend/  ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 5000

# 4 Gunicorn workers; --preload so APScheduler runs once in master
CMD ["gunicorn", "--workers", "4", "--bind", "0.0.0.0:5000", "--preload", "--timeout", "120", "app:app"]
