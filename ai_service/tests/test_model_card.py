"""The model card quotes numbers. They must be the ones in the saved evaluation, or the card says something false."""
import json
import os

import pytest

DOCS = os.path.join(os.path.dirname(__file__), '..', '..', 'docs')


@pytest.fixture(scope='module')
def evaluation():
    with open(os.path.join(DOCS, 'model-evaluation.json'), encoding='utf-8') as handle:
        return json.load(handle)


@pytest.fixture(scope='module')
def card():
    with open(os.path.join(DOCS, 'model-card.md'), encoding='utf-8') as handle:
        return handle.read()


def pct(value):
    return f'{value * 100:.1f}%'


def test_the_card_names_the_model_file_that_was_tested(evaluation, card):
    assert evaluation['modelSha256'] in card


def test_the_evaluation_was_made_with_the_limit_the_card_describes(evaluation, card):
    assert evaluation['limit'] == 0.6
    assert 'at least 0.60' in card


def test_the_photo_counts_in_the_card_are_the_ones_tested(evaluation, card):
    found = evaluation['result']
    for number in (found['silkworm']['Grasserie']['photos'], found['silkworm']['Healthy']['photos'], found['leaves']['photos'], found['silkworm']['photos']):
        assert str(number) in card


def test_the_photos_left_out_for_being_in_training_are_the_ones_in_the_card(evaluation, card):
    photos = evaluation['photos']
    assert f"{photos['grasserie_silkworms']['inTraining']} of {photos['grasserie_silkworms']['photos']} Grasserie photos" in card
    assert f"{photos['healthy_silkworms']['inTraining']} of {photos['healthy_silkworms']['photos']} Healthy photos" in card


def test_the_silkworm_figures_in_the_card_are_the_measured_ones(evaluation, card):
    silk = evaluation['result']['silkworm']
    for name in ('Grasserie', 'Healthy'):
        row = silk[name]
        assert pct(row['recall']) in card and pct(row['precision']) in card and pct(row['f1']) in card
    assert pct(silk['coverage']) in card
    assert pct(silk['accuracyOfAnswered']) in card
    assert pct(silk['accuracyOfAll']) in card
    low, high = silk['accuracyOfAllInterval']
    assert f'{pct(low)[:-1]} to {pct(high)[:-1]}' in card


def test_the_mistakes_in_the_card_are_the_measured_ones(evaluation, card):
    mistakes = evaluation['result']['mistakes']
    assert len(mistakes) == 4
    assert all(m['true'] == 'grasserie_silkworms' and m['said'] == 'Healthy' for m in mistakes)
    assert 'The 4 mistakes' in card


def test_the_leaf_result_in_the_card_is_the_measured_one(evaluation, card):
    leaves = evaluation['result']['leaves']
    assert leaves['refused'] == leaves['photos'] == 110
    assert 'All 110 were refused' in card


def test_every_row_of_the_limit_table_is_the_measured_one(evaluation, card):
    for row in evaluation['otherLimits']:
        expected = f"| {row['limit']:.2f} | {pct(row['coverage'])} | {pct(row['accuracyOfAnswered'])} | {pct(row['accuracyOfAll'])} | {pct(row['leafRefusedShare'])} |"
        assert expected in card, expected
