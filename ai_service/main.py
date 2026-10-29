"""
SSMS Disease Detection AI Service
Loads the trained ResNet50 sericulture model and serves predictions via HTTP.

The check is about silkworms. It answers Grasserie or Healthy. When the photo is not a clear silkworm it says
so with NotSilkworm (the model takes it for a mulberry leaf) or Uncertain (the model is not sure enough).

Only the SSMS backend should call this service. It is not meant to be reached from a browser, so it
sends no CORS headers and refuses every request that does not carry the shared secret.

Run:  AI_SERVICE_SECRET=<long random text> uvicorn main:app --host 0.0.0.0 --port 8001 --reload
For local development only you can skip the secret with AI_ALLOW_INSECURE=1.
"""

import hashlib
import hmac
import io
import json
import os

import numpy as np
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from PIL import Image

from decision import DEFAULT_UNCERTAIN_BELOW, SILKWORM_RESULTS, decide, read_limit  # noqa: F401

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Absolute path to the .keras model (one level up from this file)
MODEL_PATH = os.environ.get(
    "MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "sericulture_resnet50_model.keras"),
)

# Optional. When set, the model file must hash to this value or the service will not load it.
MODEL_SHA256 = os.environ.get("MODEL_SHA256", "").strip().lower()

# The model's outputs in order: the folders it was trained on, alphabetical because Keras numbers them that way.
# The list is saved next to the model so the order never has to be guessed again.
CLASSES_PATH = os.environ.get("CLASSES_PATH", os.path.splitext(MODEL_PATH)[0] + ".classes.json")


def load_classes(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8") as handle:
            names = json.load(handle)["classes"]
        if not names or not all(isinstance(name, str) for name in names):
            raise ValueError("empty or not text")
        return names
    except Exception:
        raise RuntimeError(f"The class list next to the model could not be read: {path}") from None


CLASS_NAMES: list[str] = load_classes(CLASSES_PATH)
UNCERTAIN_BELOW = read_limit(os.environ.get("UNCERTAIN_BELOW", ""))

SECRET = os.environ.get("AI_SERVICE_SECRET", "")
ALLOW_INSECURE = os.environ.get("AI_ALLOW_INSECURE") == "1"

if not SECRET and not ALLOW_INSECURE:
    raise RuntimeError(
        "AI_SERVICE_SECRET is not set. Set it to a long random text, the same value the backend uses. "
        "For local development only, AI_ALLOW_INSECURE=1 switches the check off."
    )

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 25_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# A tiny file that unpacks into a gigantic picture can use all the memory. Pillow refuses those.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# ResNet50 "caffe" preprocessing: RGB to BGR, then subtract the mean of each channel. No scaling.
_MEAN_BGR = np.array([103.939, 116.779, 123.68], dtype=np.float32)

NOT_A_PHOTO = "That file could not be read as a photo."

# ─────────────────────────────────────────────────────────────────────────────
# Lazy-loaded model
# ─────────────────────────────────────────────────────────────────────────────

_model = None


def _check_model_file(path: str) -> None:
    if not MODEL_SHA256:
        return
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    if not hmac.compare_digest(digest.hexdigest(), MODEL_SHA256):
        raise RuntimeError("The model file does not match MODEL_SHA256, so it was not loaded.")


def get_model():
    global _model
    if _model is None:
        import tensorflow as tf  # imported lazily so startup is fast

        path = os.path.abspath(MODEL_PATH)
        _check_model_file(path)
        print(f"[AI] Loading model from: {path}")
        _model = tf.keras.models.load_model(path, safe_mode=True)
        print(f"[AI] Model loaded, output classes: {_model.output_shape[-1]}")
        if _model.output_shape[-1] != len(CLASS_NAMES):
            _model = None
            raise RuntimeError("The model and its class list do not have the same number of classes.")
    return _model


def run_model(arr: np.ndarray) -> np.ndarray:
    """Class probabilities for one prepared image, shape (num_classes,)."""
    return get_model().predict(arr, verbose=0)[0]


def preprocess(image: Image.Image) -> np.ndarray:
    """Turn a picture into the (1, 224, 224, 3) array the model expects."""
    resized = image.convert("RGB").resize((224, 224))
    arr = np.asarray(resized, dtype=np.float32)[..., ::-1] - _MEAN_BGR
    return np.expand_dims(arr, axis=0)


# ─────────────────────────────────────────────────────────────────────────────
# Guards
# ─────────────────────────────────────────────────────────────────────────────

def require_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    if ALLOW_INSECURE and not SECRET:
        return
    if not x_internal_secret or not hmac.compare_digest(x_internal_secret, SECRET):
        raise HTTPException(status_code=401, detail="Not allowed.")


def limit_body(request: Request) -> None:
    """Turn away an oversize upload before the body is read."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BYTES + 64 * 1024:
        raise HTTPException(status_code=413, detail="That photo is too large.")


def read_photo(data: bytes) -> Image.Image:
    """Decode the bytes as a picture, judging by the contents and never by the declared type."""
    try:
        image = Image.open(io.BytesIO(data))
        found = image.format
        width, height = image.size
        image.verify()
        if found not in ALLOWED_FORMATS or width * height > MAX_PIXELS:
            raise ValueError("not an allowed picture")
        image = Image.open(io.BytesIO(data))  # verify() leaves the first handle unusable
        image.load()
        return image
    except Exception:
        # Say nothing about why. The detail belongs in a log, not in the answer.
        raise HTTPException(status_code=400, detail=NOT_A_PHOTO) from None


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SSMS Disease Detection API",
    description="ResNet50 sericulture disease classifier",
    version="1.1.0",
)
# No CORS middleware on purpose: browsers never call this service.


@app.get("/health")
def health():
    return {"status": "ok", "classes": [SILKWORM_RESULTS[n] for n in CLASS_NAMES if n in SILKWORM_RESULTS]}


@app.post("/predict", dependencies=[Depends(require_secret), Depends(limit_body)])
async def predict(file: UploadFile = File(...)):
    """
    Accept a photo and say what the model sees.

    Response:
        result      - Grasserie, Healthy, NotSilkworm or Uncertain
        confidence  - float 0-1, the model's highest score
        allScores   - the Grasserie and Healthy scores. They need not add up to one.
    """
    contents = await file.read(MAX_BYTES + 1)
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="That photo is too large.")

    arr = preprocess(read_photo(contents))
    scores = run_model(arr)
    if len(scores) != len(CLASS_NAMES):
        raise HTTPException(status_code=503, detail="The check is not available right now.")

    result, confidence = decide(scores, CLASS_NAMES, UNCERTAIN_BELOW)

    return {
        "result": result,
        "confidence": round(confidence, 4),
        "allScores": {
            SILKWORM_RESULTS[name]: round(float(scores[i]), 4)
            for i, name in enumerate(CLASS_NAMES)
            if name in SILKWORM_RESULTS
        },
    }
