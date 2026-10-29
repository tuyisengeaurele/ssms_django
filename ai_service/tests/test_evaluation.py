"""The numbers in the model card come from this code, so it is tested like any other.

Photos in the course dataset are named after the photo they came from: `Healthy_12.jpg` is the photo, and
`Healthy_12_aug3.jpg` and `Healthy_12_resized.jpg` are copies of it. Roboflow also adds `.rf.<hash>` to a name.
A fair test uses one file per photo, and none of those photos may be in the training folder.
"""
import numpy as np
import pytest
from decision import decide
from evaluation import not_in, origin_of, originals, sweep, tally, wilson

CLASSES = ['disease_free', 'grasserie_silkworms', 'healthy_silkworms', 'leaf_rust', 'leaf_spot']


def scores(**by_index):
    given = {int(k[1:]): v for k, v in by_index.items()}
    rest = (1 - sum(given.values())) / (5 - len(given))
    return [given.get(i, rest) for i in range(5)]


# ── which photo a file is a copy of ─────────────────────────────────────────────────────────

@pytest.mark.parametrize('name, expected', [
    ('Healthy_12.jpg', 'Healthy_12'),
    ('Healthy_12_aug3.jpg', 'Healthy_12'),
    ('Healthy_12_resized.jpg', 'Healthy_12'),
    ('Grasserie-334-_jpg.rf.26181b5c665fe11b2d25f52946adbe64_aug2.jpg', 'Grasserie-334-_jpg'),
    ('Grasserie-334-_jpg.rf.408732c0d80d7bcdd0efc735a3455339_resized.jpg', 'Grasserie-334-_jpg'),
    ('IMG_1237.JPG', 'IMG_1237'),
    ('IMG_1237_aug1.JPG', 'IMG_1237'),
])
def test_a_copy_has_the_name_of_its_photo(name, expected):
    assert origin_of(name) == expected


def test_one_file_is_kept_per_photo_and_it_is_the_photo_itself():
    names = ['a_aug1.jpg', 'a.jpg', 'a_resized.jpg', 'b_resized.jpg', 'b_aug2.jpg', 'c_aug1.jpg']
    assert originals(names) == ['a.jpg', 'b_resized.jpg', 'c_aug1.jpg']


def test_the_files_are_kept_in_a_steady_order():
    assert originals(['z.jpg', 'a.jpg', 'm.jpg']) == ['a.jpg', 'm.jpg', 'z.jpg']


def test_a_photo_that_is_also_in_the_training_folder_is_left_out():
    training = ['Healthy_12_resized.jpg', 'Healthy_12_aug1.jpg', 'Healthy_13_aug1.jpg']
    test = ['Healthy_12.jpg', 'Healthy_13.jpg', 'Healthy_14.jpg']
    assert not_in(training, test) == ['Healthy_14.jpg']


def test_nothing_is_left_out_when_there_is_no_training_folder_to_compare_with():
    assert not_in([], ['a.jpg', 'b.jpg']) == ['a.jpg', 'b.jpg']


# ── the interval around a share ─────────────────────────────────────────────────────────────

def test_the_interval_of_half_of_a_hundred():
    low, high = wilson(50, 100)
    assert round(low, 3) == 0.404 and round(high, 3) == 0.596


def test_the_interval_is_wide_when_there_are_few_photos():
    low, high = wilson(9, 10)
    assert high - low > 0.3


def test_the_interval_stays_between_zero_and_one():
    assert wilson(10, 10)[1] <= 1.0 and wilson(0, 10)[0] >= 0.0


def test_there_is_no_interval_without_photos():
    assert wilson(0, 0) is None


# ── the tally ───────────────────────────────────────────────────────────────────────────────

def record(true, **by_index):
    return {'file': f'{true}.jpg', 'true': true, 'scores': scores(**by_index)}


def test_each_silkworm_photo_is_counted_under_what_the_check_said():
    records = [
        record('grasserie_silkworms', i1=0.9),
        record('grasserie_silkworms', i2=0.9),
        record('grasserie_silkworms', i1=0.4, i2=0.35),
        record('healthy_silkworms', i2=0.9),
    ]
    found = tally(records, CLASSES, 0.60)['silkworm']['Grasserie']
    assert (found['photos'], found['Grasserie'], found['Healthy'], found['Uncertain'], found['NotSilkworm']) == (3, 1, 1, 1, 0)


def test_recall_counts_a_photo_the_check_would_not_answer_as_missed():
    records = [record('grasserie_silkworms', i1=0.9), record('grasserie_silkworms', i1=0.4, i2=0.35)]
    assert tally(records, CLASSES, 0.60)['silkworm']['Grasserie']['recall'] == 0.5


def test_precision_is_about_the_answers_given():
    records = [record('grasserie_silkworms', i1=0.9), record('healthy_silkworms', i1=0.9), record('healthy_silkworms', i2=0.9)]
    result = tally(records, CLASSES, 0.60)['silkworm']
    assert result['Grasserie']['precision'] == 0.5
    assert result['Healthy']['precision'] == 1.0


def test_precision_is_none_when_the_check_never_gave_that_answer():
    result = tally([record('healthy_silkworms', i2=0.9)], CLASSES, 0.60)['silkworm']
    assert result['Grasserie']['precision'] is None


def test_coverage_and_accuracy_are_about_all_the_silkworm_photos():
    records = [
        record('grasserie_silkworms', i1=0.9),   # right
        record('healthy_silkworms', i1=0.9),     # wrong
        record('healthy_silkworms', i2=0.9),     # right
        record('healthy_silkworms', i2=0.3, i1=0.3),  # not answered
    ]
    result = tally(records, CLASSES, 0.60)['silkworm']
    assert result['photos'] == 4 and result['answered'] == 3
    assert result['coverage'] == 0.75
    assert round(result['accuracyOfAnswered'], 3) == round(2 / 3, 3)
    assert result['accuracyOfAll'] == 0.5


def test_a_leaf_photo_is_good_when_the_check_refuses_it():
    records = [record('leaf_rust', i3=0.95), record('leaf_spot', i4=0.9), record('disease_free', i1=0.9), record('leaf_rust', i2=0.9)]
    leaves = tally(records, CLASSES, 0.60)['leaves']
    assert leaves['photos'] == 4
    assert leaves['refused'] == 2
    assert leaves['calledGrasserie'] == 1 and leaves['calledHealthy'] == 1


def test_leaves_are_counted_by_folder():
    records = [record('leaf_rust', i3=0.95), record('leaf_rust', i2=0.9), record('leaf_spot', i4=0.9)]
    by_folder = tally(records, CLASSES, 0.60)['leaves']['byFolder']
    assert by_folder['leaf_rust'] == {'photos': 2, 'refused': 1}
    assert by_folder['leaf_spot'] == {'photos': 1, 'refused': 1}


def test_the_tally_uses_the_same_rule_as_the_service():
    """What the check would say for these scores, photo by photo, is what the tally counts."""
    cases = [scores(i1=0.9), scores(i2=0.9), scores(i3=0.9), scores(i1=0.4, i2=0.3)]
    records = [{'file': str(n), 'true': 'grasserie_silkworms', 'scores': s} for n, s in enumerate(cases)]
    found = tally(records, CLASSES, 0.60)['silkworm']['Grasserie']
    said = [decide(np.array(s), CLASSES, 0.60)[0] for s in cases]
    assert [found[a] for a in ('Grasserie', 'Healthy', 'NotSilkworm', 'Uncertain')] == [said.count(a) for a in ('Grasserie', 'Healthy', 'NotSilkworm', 'Uncertain')]


def test_the_mistakes_are_listed_so_they_can_be_looked_at():
    records = [record('grasserie_silkworms', i2=0.9), record('grasserie_silkworms', i1=0.9)]
    mistakes = tally(records, CLASSES, 0.60)['mistakes']
    assert [(m['true'], m['said']) for m in mistakes] == [('grasserie_silkworms', 'Healthy')]


def test_a_photo_the_check_would_not_answer_is_not_listed_as_a_mistake():
    mistakes = tally([record('grasserie_silkworms', i1=0.4, i2=0.35)], CLASSES, 0.60)['mistakes']
    assert mistakes == []


# ── trying other limits ─────────────────────────────────────────────────────────────────────

def test_a_higher_limit_answers_fewer_photos():
    records = [record('grasserie_silkworms', i1=0.95), record('grasserie_silkworms', i1=0.7, i2=0.2), record('grasserie_silkworms', i1=0.55, i2=0.4)]
    rows = sweep(records, CLASSES, [0.5, 0.6, 0.8, 0.9])
    assert [r['limit'] for r in rows] == [0.5, 0.6, 0.8, 0.9]
    assert [round(r['coverage'], 2) for r in rows] == [1.0, 0.67, 0.33, 0.33]


def test_each_row_of_the_sweep_says_how_leaves_were_treated():
    records = [record('grasserie_silkworms', i1=0.9), record('leaf_rust', i1=0.7, i3=0.2)]
    rows = sweep(records, CLASSES, [0.6, 0.8])
    assert [r['leafRefusedShare'] for r in rows] == [0.0, 1.0]


# ── gathering the photos from folders ───────────────────────────────────────────────────────

def make(folder, *names):
    folder.mkdir(parents=True, exist_ok=True)
    for name in names:
        (folder / name).write_bytes(b'x')


def test_the_test_photos_are_gathered_per_folder_without_copies(tmp_path):
    from evaluation import gather

    make(tmp_path / 'test' / 'healthy_silkworms', 'H1.jpg', 'H1_aug1.jpg', 'H2.jpg')
    make(tmp_path / 'test' / 'leaf_rust', 'L1.jpg', 'L1_aug1.jpg')
    files, summary = gather(str(tmp_path / 'test'))
    assert files == {'healthy_silkworms': ['H1.jpg', 'H2.jpg'], 'leaf_rust': ['L1.jpg']}
    assert summary['healthy_silkworms'] == {'files': 3, 'photos': 2, 'inTraining': 0, 'kept': 2, 'comparedWithTraining': False}


def test_photos_seen_in_training_are_left_out_and_counted(tmp_path):
    from evaluation import gather

    make(tmp_path / 'test' / 'healthy_silkworms', 'H1.jpg', 'H2.jpg', 'H3.jpg')
    make(tmp_path / 'train' / 'healthy_silkworms', 'H1_resized.jpg', 'H1_aug1.jpg', 'H2_aug4.jpg')
    files, summary = gather(str(tmp_path / 'test'), str(tmp_path / 'train'))
    assert files == {'healthy_silkworms': ['H3.jpg']}
    assert summary['healthy_silkworms'] == {'files': 3, 'photos': 3, 'inTraining': 2, 'kept': 1, 'comparedWithTraining': True}


def test_a_class_with_no_training_folder_is_kept_whole_and_said_to_be_unchecked(tmp_path):
    from evaluation import gather

    make(tmp_path / 'test' / 'disease_free', 'D1.jpg')
    make(tmp_path / 'train' / 'healthy_silkworms', 'H1.jpg')
    files, summary = gather(str(tmp_path / 'test'), str(tmp_path / 'train'))
    assert files == {'disease_free': ['D1.jpg']}
    assert summary['disease_free']['comparedWithTraining'] is False


def test_only_picture_files_are_gathered(tmp_path):
    from evaluation import gather

    make(tmp_path / 'test' / 'leaf_spot', 'a.jpg', 'notes.txt', 'b.PNG', 'Thumbs.db')
    files, _ = gather(str(tmp_path / 'test'))
    assert files == {'leaf_spot': ['a.jpg', 'b.PNG']}
