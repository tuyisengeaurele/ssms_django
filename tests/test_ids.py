import importlib
import random
import re

import pytest

from core.ids import new_id

MODELS_MODULES = [
    'alerts.models', 'batches.models', 'cooperatives.models', 'farms.models',
    'harvest.models', 'sensors.models', 'users.models',
]


def test_new_id_format():
    value = new_id()
    assert re.fullmatch(r'c[0-9a-f]+[a-z0-9]{16}', value)
    assert len(value) <= 36


def test_new_id_is_unique_across_ten_thousand_calls():
    assert len({new_id() for _ in range(10_000)}) == 10_000


def test_new_id_does_not_use_the_random_module(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError('random was used')

    monkeypatch.setattr(random, 'choices', boom)
    monkeypatch.setattr(random, 'choice', boom)
    monkeypatch.setattr(random, 'random', boom)
    assert new_id()


@pytest.mark.parametrize('module', MODELS_MODULES)
def test_every_models_module_still_exposes_generate_id_for_migrations(module):
    models = importlib.import_module(module)
    assert models._generate_id is new_id


def test_device_key_uses_secrets(monkeypatch):
    from sensors.views import _gen_device_key

    def boom(*args, **kwargs):
        raise AssertionError('random was used')

    monkeypatch.setattr(random, 'choices', boom)
    key = _gen_device_key()
    assert key.startswith('ssms-')
    assert len(key) - len('ssms-') >= 20
    assert key != _gen_device_key()
