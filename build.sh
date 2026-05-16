#!/usr/bin/env bash
# build.sh — Render build command
# Runs once on every deploy before the web service starts.
set -e   # exit immediately on any error

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

echo "==> Running database migrations..."
python manage.py migrate --noinput

echo "==> Build complete."
