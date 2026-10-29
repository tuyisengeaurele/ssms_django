"""The check is about silkworms. It answers Grasserie or Healthy, and says so plainly when the photo is not a clear silkworm.

The model has five outputs, in the alphabetical order of the folders it was trained on. Three of them are mulberry leaves.
"""
import json
import os

import numpy as np
import pytest
from fastapi.testclient import TestClient

from tests.test_predict_security import SECRET, load_app, picture, predict

REPO_CLASSES = os.path.join(os.path.dirname(__file__), '..', '..', 'sericulture_resnet50_model.classes.json')


def scores(**by_index):
    """Five scores that sum to one, with the given index set and the rest shared equally."""
    given = {int(k[1:]): v for k, v in by_index.items()}
    rest = (1 - sum(given.values())) / (5 - len(given))
    return np.array([given.get(i, rest) for i in range(5)])


@pytest.fixture
def ask(monkeypatch):
    """Send a picture to the service with the model answering `output`, and return the answer."""
    module = load_app(monkeypatch)

    def go(output):
        monkeypatch.setattr(module, 'run_model', lambda arr: output)
        return predict(TestClient(module.app), picture())

    return go


# ── the class order is the model's, saved next to it ────────────────────────────────────────

def test_the_saved_class_order_is_what_the_model_was_trained_on():
    with open(REPO_CLASSES, encoding='utf-8') as handle:
        saved = json.load(handle)['classes']
    assert saved == ['disease_free', 'grasserie_silkworms', 'healthy_silkworms', 'leaf_rust', 'leaf_spot']


def test_the_service_reads_the_class_order_from_that_file(monkeypatch, tmp_path):
    """A model with the silkworm classes the other way round is read the other way round."""
    swapped = tmp_path / 'classes.json'
    swapped.write_text(json.dumps({'classes': ['healthy_silkworms', 'grasserie_silkworms']}), encoding='utf-8')
    monkeypatch.setenv('CLASSES_PATH', str(swapped))
    module = load_app(monkeypatch)
    monkeypatch.setattr(module, 'run_model', lambda arr: np.array([0.9, 0.1]))
    assert predict(TestClient(module.app), picture()).json()['result'] == 'Healthy'


def test_the_service_will_not_start_without_the_class_file(monkeypatch, tmp_path):
    monkeypatch.setenv('CLASSES_PATH', str(tmp_path / 'missing.json'))
    with pytest.raises(RuntimeError, match='class'):
        load_app(monkeypatch)


def test_a_model_with_a_different_number_of_outputs_is_not_trusted(ask):
    response = ask(np.array([0.5, 0.5]))
    assert response.status_code == 503
    assert response.json() == {'detail': 'The check is not available right now.'}


# ── the two answers about a silkworm ────────────────────────────────────────────────────────

def test_a_clear_healthy_silkworm_is_healthy(ask):
    body = ask(scores(i2=0.92)).json()
    assert body['result'] == 'Healthy'
    assert body['confidence'] == 0.92


def test_a_clear_grasserie_silkworm_is_grasserie(ask):
    body = ask(scores(i1=0.88)).json()
    assert body['result'] == 'Grasserie'
    assert body['confidence'] == 0.88


def test_only_the_two_silkworm_scores_are_reported(ask):
    body = ask(scores(i2=0.8, i1=0.1)).json()
    assert body['allScores'] == {'Grasserie': 0.1, 'Healthy': 0.8}


# ── a photo that is not a silkworm ──────────────────────────────────────────────────────────

@pytest.mark.parametrize('leaf', [0, 3, 4])
def test_a_photo_the_model_takes_for_a_leaf_is_not_a_silkworm(ask, leaf):
    body = ask(scores(**{f'i{leaf}': 0.95})).json()
    assert body['result'] == 'NotSilkworm'
    assert body['confidence'] == 0.95


def test_the_answer_for_a_leaf_does_not_name_a_leaf_disease(ask):
    text = json.dumps(ask(scores(i3=0.95)).json()).lower()
    assert 'rust' not in text and 'spot' not in text and 'leaf' not in text


# ── a photo the model is not sure about ─────────────────────────────────────────────────────

def test_a_low_top_score_is_uncertain_even_when_it_is_a_silkworm(ask):
    body = ask(scores(i1=0.45, i2=0.40)).json()
    assert body['result'] == 'Uncertain'
    assert body['confidence'] == 0.45


def test_a_low_top_score_on_a_leaf_is_uncertain_too(ask):
    assert ask(scores(i3=0.5, i1=0.3)).json()['result'] == 'Uncertain'


def test_a_score_exactly_on_the_limit_is_answered(ask):
    assert ask(scores(i1=0.60, i2=0.20)).json()['result'] == 'Grasserie'


def test_just_under_the_limit_is_uncertain(ask):
    assert ask(scores(i1=0.59, i2=0.21)).json()['result'] == 'Uncertain'


def test_the_limit_can_be_set_in_the_environment(monkeypatch):
    monkeypatch.setenv('UNCERTAIN_BELOW', '0.9')
    module = load_app(monkeypatch)
    monkeypatch.setattr(module, 'run_model', lambda arr: scores(i2=0.85))
    assert predict(TestClient(module.app), picture()).json()['result'] == 'Uncertain'


@pytest.mark.parametrize('bad', ['', 'abc', '0', '1.5', '-1'])
def test_a_limit_that_makes_no_sense_falls_back_to_the_default(monkeypatch, bad):
    monkeypatch.setenv('UNCERTAIN_BELOW', bad)
    module = load_app(monkeypatch)
    assert module.UNCERTAIN_BELOW == 0.60


def test_health_lists_the_two_results_a_silkworm_can_get(monkeypatch):
    module = load_app(monkeypatch)
    body = TestClient(module.app).get('/health').json()
    assert body['status'] == 'ok'
    assert body['classes'] == ['Grasserie', 'Healthy']


def test_the_secret_is_still_needed(monkeypatch):
    module = load_app(monkeypatch)
    assert predict(TestClient(module.app), picture(), secret=None).status_code == 401
    assert SECRET
