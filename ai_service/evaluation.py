"""Counting how the check does on photos it was not trained on. No model is needed here, only scores.

Photos in the course dataset are named after the photo they came from: `Healthy_12.jpg` is the photo, and
`Healthy_12_aug3.jpg` and `Healthy_12_resized.jpg` are copies of it. A fair test uses one file per photo, and none of
those photos may be in the training folder, or the model is marked on work it has already seen.
"""
import math
import os
import re

import numpy as np
from decision import SILKWORM_RESULTS, decide

ANSWERS = ("Grasserie", "Healthy", "NotSilkworm", "Uncertain")

_COPY = re.compile(r"_(aug\d+|resized)$")
_HASH = re.compile(r"\.rf\.[0-9a-f]+$")


def origin_of(filename: str) -> str:
    """The name of the photo a file is, or is a copy of."""
    stem = os.path.splitext(filename)[0]
    return _HASH.sub("", _COPY.sub("", stem))


def _rank(filename: str) -> int:
    """0 for the photo itself, 1 for a resized copy, 2 for an augmented one. The photo is the best to test on."""
    stem = os.path.splitext(filename)[0]
    found = _COPY.search(stem)
    if not found:
        return 0
    return 1 if found.group(1) == "resized" else 2


def originals(filenames: list[str]) -> list[str]:
    """One file per photo, the photo itself when there is one, in a steady order."""
    best: dict[str, str] = {}
    for name in sorted(filenames):
        key = origin_of(name)
        if key not in best or _rank(name) < _rank(best[key]):
            best[key] = name
    return sorted(best.values())


def not_in(training_filenames: list[str], filenames: list[str]) -> list[str]:
    """The files whose photo is not among the training files."""
    seen = {origin_of(name) for name in training_filenames}
    return [name for name in filenames if origin_of(name) not in seen]


def wilson(successes: int, total: int, z: float = 1.96) -> tuple[float, float] | None:
    """A 95% interval around a share. Wide when there are few photos, which is the honest thing to show."""
    if total == 0:
        return None
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    spread = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return max(0.0, centre - spread), min(1.0, centre + spread)


def _share(part: int, whole: int) -> float | None:
    return part / whole if whole else None


def tally(records: list[dict], class_names: list[str], limit: float) -> dict:
    """
    Count what the check says for each photo. A record is {"file", "true" (the folder), "scores"}.

    Silkworm photos are scored on recall, precision and coverage. Leaf photos are not silkworms, so the check is right
    to refuse them, and the count says how many it refused.
    """
    silkworm = {name: {"photos": 0, **{answer: 0 for answer in ANSWERS}} for name in SILKWORM_RESULTS.values()}
    leaf_folders: dict[str, dict] = {}
    leaf_called = {"Grasserie": 0, "Healthy": 0}
    mistakes = []

    for record in records:
        said, confidence = decide(np.array(record["scores"]), class_names, limit)
        folder = record["true"]
        if folder in SILKWORM_RESULTS:
            true = SILKWORM_RESULTS[folder]
            silkworm[true]["photos"] += 1
            silkworm[true][said] += 1
            wrong = said not in (true, "Uncertain")
        else:
            row = leaf_folders.setdefault(folder, {"photos": 0, "refused": 0})
            row["photos"] += 1
            if said in ("NotSilkworm", "Uncertain"):
                row["refused"] += 1
            else:
                leaf_called[said] += 1
            wrong = said in leaf_called
        if wrong:
            mistakes.append({"file": record["file"], "true": folder, "said": said, "confidence": round(confidence, 4)})

    for name, row in silkworm.items():
        row["recall"] = _share(row[name], row["photos"])
        row["recallInterval"] = wilson(row[name], row["photos"])
        called = sum(other[name] for other in silkworm.values())
        row["precision"] = _share(row[name], called)
        p, r = row["precision"], row["recall"]
        row["f1"] = 2 * p * r / (p + r) if p is not None and r is not None and p + r > 0 else None

    photos = sum(row["photos"] for row in silkworm.values())
    correct = sum(row[name] for name, row in silkworm.items())
    answered = sum(row["Grasserie"] + row["Healthy"] for row in silkworm.values())
    silkworm["photos"] = photos
    silkworm["answered"] = answered
    silkworm["coverage"] = _share(answered, photos)
    silkworm["accuracyOfAnswered"] = _share(correct, answered)
    silkworm["accuracyOfAll"] = _share(correct, photos)
    silkworm["accuracyOfAllInterval"] = wilson(correct, photos)

    leaf_photos = sum(row["photos"] for row in leaf_folders.values())
    refused = sum(row["refused"] for row in leaf_folders.values())
    leaves = {
        "photos": leaf_photos,
        "refused": refused,
        "refusedShare": _share(refused, leaf_photos),
        "refusedInterval": wilson(refused, leaf_photos),
        "calledGrasserie": leaf_called["Grasserie"],
        "calledHealthy": leaf_called["Healthy"],
        "byFolder": leaf_folders,
    }
    return {"limit": limit, "silkworm": silkworm, "leaves": leaves, "mistakes": mistakes}


def sweep(records: list[dict], class_names: list[str], limits: list[float]) -> list[dict]:
    """The same photos with other limits, to see what a higher or lower limit costs."""
    rows = []
    for limit in limits:
        found = tally(records, class_names, limit)
        rows.append({
            "limit": limit,
            "coverage": found["silkworm"]["coverage"],
            "accuracyOfAnswered": found["silkworm"]["accuracyOfAnswered"],
            "accuracyOfAll": found["silkworm"]["accuracyOfAll"],
            "leafRefusedShare": found["leaves"]["refusedShare"],
        })
    return rows


PICTURES = (".jpg", ".jpeg", ".png", ".webp")


def gather(test_dir: str, train_dir: str | None = None) -> tuple[dict[str, list[str]], dict[str, dict]]:
    """
    The photos to test on, per class folder: one file per photo, and none seen in the training folder.

    The summary says, per folder, how many files there were, how many photos, how many were left out for being in
    training, and whether a training folder of that name was there to compare with.
    """
    files: dict[str, list[str]] = {}
    summary: dict[str, dict] = {}
    for folder in sorted(os.listdir(test_dir)):
        path = os.path.join(test_dir, folder)
        if not os.path.isdir(path):
            continue
        names = [n for n in os.listdir(path) if n.lower().endswith(PICTURES)]
        photos = originals(names)
        train_path = os.path.join(train_dir, folder) if train_dir else None
        compared = bool(train_path and os.path.isdir(train_path))
        kept = not_in(os.listdir(train_path), photos) if compared else photos
        files[folder] = kept
        summary[folder] = {
            "files": len(names), "photos": len(photos), "inTraining": len(photos) - len(kept),
            "kept": len(kept), "comparedWithTraining": compared,
        }
    return files, summary
