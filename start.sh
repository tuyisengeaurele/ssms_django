#!/usr/bin/env bash
# Starts the API on Render, Railway or any host that gives it a PORT.
# Every step is safe to repeat: migrate and createcachetable skip what already exists.
# The cache table holds sign in lockout, code challenges and stream tickets. Rate limit counts are in memory.
set -e

# A missing MFA_ENCRYPTION_KEY stops the deploy here, so the copy that is running keeps serving.
python manage.py check --deploy --fail-level ERROR
python manage.py migrate --noinput
python manage.py createcachetable
python manage.py collectstatic --noinput

# ASGI, because the live alert stream is an async view that must not hold a worker.
# With several workers, one that has served 1000 requests exits and is replaced, which keeps memory flat. With one
# worker there is no supervisor to replace it, so the same exit would stop the whole service until the host restarted
# it, a minute of "The server is waking up" after every 1000 requests.
WORKERS="${WEB_CONCURRENCY:-2}"
RECYCLE=()
if [ "$WORKERS" -gt 1 ]; then
  RECYCLE=(--limit-max-requests 1000)
fi

exec uvicorn ssms_django.asgi:application --host 0.0.0.0 --port "${PORT:-8000}" --workers "$WORKERS"   --proxy-headers --forwarded-allow-ips '*' "${RECYCLE[@]}"
