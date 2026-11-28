#!/usr/bin/env bash
# Render startup script
# 1. Run any pending Alembic migrations against DIRECT_URL
# 2. Start the FastAPI server on the PORT Render injects

set -e

echo "=== Running Alembic migrations ==="
alembic upgrade head

echo "=== Starting FastAPI server ==="
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers 1
