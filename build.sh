#!/usr/bin/env bash
# build.sh — Railway/Render build command
# Only installs dependencies at build time.
# migrate and collectstatic run at startup via Procfile, when DATABASE_URL is available.
set -e

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Build complete."
