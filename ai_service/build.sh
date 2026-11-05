#!/usr/bin/env bash
# Build for the disease check service on Render.
# The model is 107 MB and lives in Git LFS, which Render does not fetch, so the build downloads it from MODEL_URL
# and refuses it unless it matches MODEL_SHA256. The service checks the same fingerprint again when it starts.
set -euo pipefail

: "${MODEL_URL:?Set MODEL_URL in the Render dashboard}"
: "${MODEL_SHA256:?Set MODEL_SHA256 in the Render dashboard}"

echo "==> Installing Python dependencies..."
pip install -r ai_service/requirements.txt

echo "==> Downloading the model..."
curl --fail --location --retry 3 --silent --show-error "$MODEL_URL" --output sericulture_resnet50_model.keras

echo "==> Checking the model fingerprint..."
echo "${MODEL_SHA256}  sericulture_resnet50_model.keras" | sha256sum --check -

echo "==> Build complete."
