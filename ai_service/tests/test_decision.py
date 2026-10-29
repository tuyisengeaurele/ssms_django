"""The rule that turns the model's five scores into an answer, on its own so the service and the evaluation share it."""
import numpy as np
import pytest

from decision import DEFAULT_UNCERTAIN_BELOW, SILKWORM_RESULTS, decide, read_limit

CLASSES = ['disease_free', 'grasserie_silkworms', 'healthy_silkworms', 'leaf_rust', 'leaf_spot']


def test_the_two_names_of_a_silkworm():
    assert SILKWORM_RESULTS == {'grasserie_silkworms': 'Grasserie', 'healthy_silkworms': 'Healthy'}


def test_the_most_likely_silkworm_class_is_the_answer():
    assert decide(np.array([0.01, 0.9, 0.05, 0.02, 0.02]), CLASSES, 0.6) == ('Grasserie', 0.9)
    assert decide(np.array([0.01, 0.02, 0.9, 0.05, 0.02]), CLASSES, 0.6) == ('Healthy', 0.9)


@pytest.mark.parametrize('leaf', [0, 3, 4])
def test_a_leaf_class_means_not_a_silkworm(leaf):
    scores = np.full(5, 0.01)
    scores[leaf] = 0.96
    assert decide(scores, CLASSES, 0.6)[0] == 'NotSilkworm'


def test_under_the_limit_is_uncertain_and_on_it_is_answered():
    assert decide(np.array([0.1, 0.59, 0.31, 0.0, 0.0]), CLASSES, 0.6)[0] == 'Uncertain'
    assert decide(np.array([0.1, 0.6, 0.3, 0.0, 0.0]), CLASSES, 0.6)[0] == 'Grasserie'


def test_the_default_limit_is_a_starting_value():
    assert DEFAULT_UNCERTAIN_BELOW == 0.60


@pytest.mark.parametrize('raw, expected', [('0.8', 0.8), ('', 0.6), ('abc', 0.6), ('0', 0.6), ('1', 0.6), ('1.5', 0.6), ('-1', 0.6)])
def test_the_limit_from_the_environment(raw, expected):
    assert read_limit(raw) == expected
