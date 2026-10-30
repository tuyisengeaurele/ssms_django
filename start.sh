#!/usr/bin/env bash
# Starts the API on Render, Railway or any host that gives it a PORT.
# Every step is safe to repeat: migrate and createcachetable skip what already exists.
set -e

python manage.py migrate --noinput
python manage.py createcachetable
python manage.py collectstatic --noinput

# ASGI, because the live alert stream is an async view that must not hold a worker.
# A worker that has served 1000 requests exits and is replaced, which keeps memory flat.
exec uvicorn ssms_django.asgi:application --host 0.0.0.0 --port "${PORT:-8000}" --workers 2 \
  --proxy-headers --forwarded-allow-ips '*' --limit-max-requests 1000
