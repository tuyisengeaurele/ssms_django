"""The rule that turns the model's scores into an answer.

It lives on its own so the service and the evaluation script use the same rule. The numbers in the model card are
then about what the service really says.
"""
import numpy as np

# What a silkworm can be called. Every other output of the model is a mulberry leaf, so not a silkworm.
SILKWORM_RESULTS = {"grasserie_silkworms": "Grasserie", "healthy_silkworms": "Healthy"}

# Below this score the model is not sure enough to name anything. A starting value, not a measured one.
DEFAULT_UNCERTAIN_BELOW = 0.60


def read_limit(raw: str) -> float:
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_UNCERTAIN_BELOW
    return value if 0 < value < 1 else DEFAULT_UNCERTAIN_BELOW


def decide(scores: np.ndarray, class_names: list[str], limit: float) -> tuple[str, float]:
    """What the check says for these scores, and the highest score. Grasserie, Healthy, NotSilkworm or Uncertain."""
    top = int(np.argmax(scores))
    confidence = float(scores[top])
    if confidence < limit:
        return "Uncertain", confidence
    return SILKWORM_RESULTS.get(class_names[top], "NotSilkworm"), confidence
