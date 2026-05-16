"""
SSMS Disease Detection AI Service
Loads the trained ResNet50 sericulture model and serves predictions via HTTP.

Run:  uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""

import io
import os
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Absolute path to the .keras model (one level up from this file)
MODEL_PATH = os.environ.get(
    "MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "sericulture_resnet50_model.keras"),
)

# Class names MUST match the folder names used during training (alphabetical order).
# Keras flow_from_directory assigns indices alphabetically.
# Update this list to match your actual dataset class folders.
_default_classes = "Flacherie,Grasserie,Healthy,Muscardine,Pebrine"
CLASS_NAMES: list[str] = os.environ.get("CLASS_NAMES", _default_classes).split(",")

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

# ─────────────────────────────────────────────────────────────────────────────
# Lazy-loaded model
# ─────────────────────────────────────────────────────────────────────────────

_model = None


def get_model():
    global _model
    if _model is None:
        import tensorflow as tf  # imported lazily so startup is fast

        print(f"[AI] Loading model from: {MODEL_PATH}")
        _model = tf.keras.models.load_model(os.path.abspath(MODEL_PATH))
        print(f"[AI] Model loaded — output classes: {_model.output_shape[-1]}")
    return _model


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SSMS Disease Detection API",
    description="ResNet50 sericulture disease classifier",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "classes": CLASS_NAMES}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Accept an image file and return the predicted disease label + confidence.

    Response:
        result      - predicted class name
        confidence  - float 0-1 (probability of predicted class)
        allScores   - dict of {className: probability} for all classes
    """
    import tensorflow as tf

    # ── validate content type ──────────────────────────────────────────────
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Send JPEG or PNG.",
        )

    # ── read & preprocess ──────────────────────────────────────────────────
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        image = image.resize((224, 224))
        arr = np.array(image, dtype=np.float32)
        arr = tf.keras.applications.resnet50.preprocess_input(arr)
        arr = np.expand_dims(arr, axis=0)  # (1, 224, 224, 3)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not process image: {exc}")

    # ── run inference ──────────────────────────────────────────────────────
    model = get_model()
    preds = model.predict(arr, verbose=0)  # shape: (1, num_classes)
    scores = preds[0]

    predicted_idx = int(np.argmax(scores))
    confidence = float(scores[predicted_idx])
    result = (
        CLASS_NAMES[predicted_idx]
        if predicted_idx < len(CLASS_NAMES)
        else f"Class_{predicted_idx}"
    )

    all_scores = {
        (CLASS_NAMES[i] if i < len(CLASS_NAMES) else f"Class_{i}"): round(float(scores[i]), 4)
        for i in range(len(scores))
    }

    return {
        "result": result,
        "confidence": round(confidence, 4),
        "allScores": all_scores,
    }
