"""
Score the check on photos it was not trained on, and write the numbers to a file.

    python evaluate.py --test <folder of class folders> --train <the training folder> --out ../docs/model-evaluation.json

The test folder holds one folder per class, named as in `sericulture_resnet50_model.classes.json`. With --train, any
photo whose original is also in the training folder is left out. Only one file per photo is used, never the
augmented copies. The check is judged the way the service would answer: the same preprocessing and the same rule.

It needs TensorFlow and the model, so it is not part of the service's tests. The counting is, in tests/test_evaluation.py.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import date

os.environ.setdefault("AI_ALLOW_INSECURE", "1")  # the service is not started here, only its pieces are used

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from evaluation import gather, sweep, tally  # noqa: E402

LIMITS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
BATCH = 16


def file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def score_all(test_dir: str, files: dict[str, list[str]]) -> list[dict]:
    model = main.get_model()
    # These are our own photos. The service refuses very large ones, the evaluation reads them all.
    Image.MAX_IMAGE_PIXELS = None
    records, batch, meta = [], [], []

    def flush():
        if not batch:
            return
        for (folder, name), scores in zip(meta, model.predict(np.concatenate(batch), verbose=0)):
            records.append({"file": f"{folder}/{name}", "true": folder, "scores": [float(s) for s in scores]})
        batch.clear()
        meta.clear()

    total = sum(len(v) for v in files.values())
    for folder, names in files.items():
        for name in names:
            with Image.open(os.path.join(test_dir, folder, name)) as picture:
                batch.append(main.preprocess(picture))
            meta.append((folder, name))
            if len(batch) == BATCH:
                flush()
                print(f"  {len(records)} of {total}", flush=True)
    flush()
    return records


def show(found: dict) -> None:
    pct = lambda v: "n/a" if v is None else f"{v * 100:.1f}%"  # noqa: E731
    silk = found["silkworm"]
    print(f"\nAt the limit {found['limit']}:")
    for name in ("Grasserie", "Healthy"):
        row = silk[name]
        print(f"  {name:10} photos {row['photos']:4}  recall {pct(row['recall'])}  precision {pct(row['precision'])}  f1 {pct(row['f1'])}")
    print(f"  Silkworm photos {silk['photos']}, answered {silk['answered']} ({pct(silk['coverage'])}), "
          f"right when answered {pct(silk['accuracyOfAnswered'])}, right of all {pct(silk['accuracyOfAll'])}")
    leaves = found["leaves"]
    print(f"  Leaf photos {leaves['photos']}, refused {leaves['refused']} ({pct(leaves['refusedShare'])}), "
          f"called Grasserie {leaves['calledGrasserie']}, called Healthy {leaves['calledHealthy']}")


def main_cli() -> int:
    parser = argparse.ArgumentParser(description="Score the disease check on photos it was not trained on.")
    parser.add_argument("--test", required=True, help="folder with one folder of photos per class")
    parser.add_argument("--train", help="the training folder, to leave out photos the model has seen")
    parser.add_argument("--out", required=True, help="where to write the numbers (JSON)")
    args = parser.parse_args()

    files, summary = gather(args.test, args.train)
    unknown = [folder for folder in files if folder not in main.CLASS_NAMES]
    if unknown:
        print(f"These folders are not classes of the model: {unknown}", file=sys.stderr)
        return 1
    for folder, row in summary.items():
        print(f"{folder}: {row['files']} files, {row['photos']} photos, {row['inTraining']} also in training, {row['kept']} tested")

    records = score_all(args.test, files)
    found = tally(records, main.CLASS_NAMES, main.UNCERTAIN_BELOW)
    show(found)

    report = {
        "date": date.today().isoformat(),
        "modelSha256": file_sha256(os.path.abspath(main.MODEL_PATH)),
        "classes": main.CLASS_NAMES,
        "limit": main.UNCERTAIN_BELOW,
        "photos": summary,
        "result": found,
        "otherLimits": sweep(records, main.CLASS_NAMES, LIMITS),
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(f"\nWritten to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main_cli())
