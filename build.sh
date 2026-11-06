#!/usr/bin/env bash
# build.sh: Render and Railway build command.
# Installs the packages, then sets up the database and the static files once, so that a service waking from sleep
# only has to start the server. A build that fails here leaves the copy that is running in place.
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"
rm -f .setup_done

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

# A host that does not give the build its DATABASE_URL does the same four steps in start.sh instead.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "==> Setting up the database and the static files..."
  python manage.py check --deploy --fail-level ERROR
  python manage.py migrate --noinput
  python manage.py createcachetable
  python manage.py collectstatic --noinput
  touch .setup_done
fi

echo "==> Build complete."
