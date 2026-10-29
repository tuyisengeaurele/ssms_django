# Model card: the silkworm disease check

## What it is

A ResNet50 image classifier (ImageNet weights, a 512 unit layer on top, 224 by 224 input), trained in a course
project and saved as `sericulture_resnet50_model.keras`. The training script is `rsn_train_sericulture_model.py`.
The model file has this SHA-256: `a32120a9f4b716cb77d0948fd3925451d7f717c0cbe7c624d0e99594a00f1088`.

The model has five outputs, in this order (saved in `sericulture_resnet50_model.classes.json`):
`disease_free`, `grasserie_silkworms`, `healthy_silkworms`, `leaf_rust`, `leaf_spot`.

## What the check says

SSMS is about silkworms, so the service uses only the two silkworm outputs and turns the rest into a plain answer.

| Answer | When |
|--------|------|
| Grasserie | The highest score is `grasserie_silkworms` and it is at least 0.60. |
| Healthy | The highest score is `healthy_silkworms` and it is at least 0.60. |
| Not a silkworm | The highest score is one of the three leaf outputs and it is at least 0.60. |
| Uncertain | The highest score is under 0.60. |

Not a silkworm and Uncertain are not saved and raise no alert. Only Grasserie raises an alert. The limit 0.60 was a
starting value. The test below does not give a reason to change it (see "Other limits").

The check was trained on grasserie and healthy silkworms only. It cannot find flacherie, muscardine, pebrine or any
other disease. The two leaf diseases it learned (`leaf_rust`, `leaf_spot`) are not used by the app yet.

## Training data

A course dataset kept in `AIforPestandDiseases/new_dataset` on the owner's computer. It is not in this repository.
Counting the folder on 29 October 2026:

| Folder | Files | Different photos |
|--------|------:|-----------------:|
| `grasserie_silkworms` | 6458 | 1168 |
| `healthy_silkworms` | 16743 | 2752 |
| `leaf_rust` | 2100 | 420 |
| `leaf_spot` | 640 | 128 |

A file is a photo, a resized copy of it, or an augmented copy of it (`_resized`, `_aug1`, and so on). So the files
are many more than the photos. The `disease_free` folder the model also learned is no longer in that dataset.

## What the course reported, and why it is not enough

The course report gives a weighted F1 of 0.99 on 7664 validation photos. Those photos were a random 20% of the same
pool of files the model trained on, so a copy of a training photo could be in it. The training script also saves the
best model by its accuracy on that same validation set. That number says the model learned its training pool. It does not say how
it does on a new photo.

## A test on photos the model has not seen

`docs/model-evaluation.json` holds the raw numbers. Made on 29 October 2026 with `ai_service/evaluate.py`.

**How the photos were chosen.** From the course `test` folder, one file per photo (the photo itself, never a copy).
A photo was left out when the same photo appears anywhere in `new_dataset`: 128 of 722 Grasserie photos and
235 of 332 Healthy photos. That is a strict rule, because part of `new_dataset` was never used for training. What is left:

| Folder | Photos tested |
|--------|--------------:|
| Grasserie silkworms | 594 |
| Healthy silkworms | 97 |
| Leaves (`disease_free` 44, `leaf_rust` 49, `leaf_spot` 17) | 110 |

The 44 `disease_free` photos could not be compared with a training folder, because that folder is gone.

**Results on silkworm photos.** The check was judged the way the service answers, with the limit 0.60. The interval
is a 95% Wilson interval.

| | Photos | Said right | Recall | Precision | F1 |
|---|---:|---:|---:|---:|---:|
| Grasserie | 594 | 589 | 99.2% (98.0 to 99.6) | 100.0% | 99.6% |
| Healthy | 97 | 97 | 100.0% (96.2 to 100.0) | 96.0% | 98.0% |

- 691 silkworm photos. The check answered 690 of them (99.9%). It was right on 99.4% of the answered ones, and on
  99.3% of all of them (98.3 to 99.7).
- Of the 594 Grasserie photos, 589 were called Grasserie, 4 were called Healthy and 1 got Uncertain.
- No Healthy photo was called Grasserie.

**The 4 mistakes** were all Grasserie photos called Healthy, three of them with a high score (0.77, 0.98, 0.97,
0.64). A disease called healthy raises no alert, which is the worse direction to be wrong in. The four photos are
numbered 1260, 1262, 1264 and 1274, which suggests they are close to each other in the dataset.

**Results on leaf photos.** All 110 were refused (Not a silkworm or Uncertain), none were called Grasserie or Healthy
(95% interval 96.6% to 100%).

## Other limits

The same 691 silkworm photos and 110 leaf photos with other limits:

| Limit | Silkworm photos answered | Right when answered | Right of all | Leaves refused |
|------:|-------------------------:|--------------------:|-------------:|---------------:|
| 0.50 | 100.0% | 99.3% | 99.3% | 100.0% |
| 0.60 | 99.9% | 99.4% | 99.3% | 100.0% |
| 0.70 | 99.6% | 99.6% | 99.1% | 100.0% |
| 0.80 | 99.4% | 99.7% | 99.1% | 100.0% |
| 0.90 | 98.7% | 99.7% | 98.4% | 100.0% |
| 0.95 | 98.4% | 99.7% | 98.1% | 100.0% |

On these photos the limit changes little, so there is no reason to move it. Photos from farms will be harder than
these, and the limit should be looked at again when there are farmer answers to compare with.

## What this test does not show

- **Photos from Rwandan farms.** The test photos appear to come from the same dataset as the training photos (the
  same photos turn up in both folders). Light, camera,
  trays and worms on a farm will differ. The result above is the best case.
- **Photos that are not silkworms or leaves.** The only non-silkworm photos tested are mulberry leaves. A hand, a
  tray with no worms or a cocoon could be called Grasserie or Healthy with a high score. This was not tested.
- **How many independent photos there are.** Photos of the same worms or the same tray can look alike, so 691 photos
  are worth less than 691 separate cases. The intervals above do not account for that.
- **Other diseases.** The model never saw them.
- **Small groups.** Only 97 Healthy photos were left after the strict rule, so Healthy numbers are the least firm.

## How the check keeps learning about itself

After each result a farmer can say whether it was right, and what it was if not. Those answers are stored with the
check. They are the first honest record of how the check does on real farm photos, and they should replace this
page's numbers as the main evidence once there are enough of them.

## Rerunning the test

With TensorFlow installed, from the `ai_service` folder:

```
python evaluate.py --test <test folder> --train <new_dataset folder> --out ../docs/model-evaluation.json
```

The test folder holds one folder per class, named as in `sericulture_resnet50_model.classes.json`. The counting
code is in `ai_service/evaluation.py` and has its own tests.
