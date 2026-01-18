FROM python:3.12-slim

WORKDIR /app

# Environment variables for Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY main.py /app/main.py
COPY src/ /app/src/

# Create data directory for SQLite
RUN mkdir -p /data /var/log/ai-trader && \
    chmod 755 /data /var/log/ai-trader

# Persist SQLite secrets/token store if you mount /data
ENV BOT_SQLITE_PATH=/data/bot_data.sqlite

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=5)" || exit 1

EXPOSE 8000

# Use production-grade server with multiple workers
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WORKERS:-4} --log-level info"]
