"""An alert is a code plus parameters, and the sentence is made when it is shown, in the language of whoever reads it.

`message` stays: new rows keep the English sentence in it (so a page or an email that only knows `message` still works) and old
rows keep what they had. A row with no code is shown by its message.
"""
import re
from pathlib import Path

import pytest

from alerts.alert_text import CODES, STAGE_NAMES, TEXTS, render_alert
from alerts.code_backfill import code_for
from alerts.disease import raise_disease_alert
from alerts.models import AlertLog
from alerts.serializers import AlertLogSerializer
from alerts.sse_view import _payload
from alerts.utils import SafeRange, check_room_alerts, humidity_problem, temperature_problem
from batches.placement import place_batch
from farms.models import RearingRoom
from sensors.devices import mark_offline_devices, record_device_reading
from tests.factories import AlertLogFactory, BatchFactory, FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db

LANGUAGES = ['en', 'fr', 'rw']

EXAMPLE = {
    'temperature_low': {'value': 19.5, 'min': 22.0},
    'temperature_high': {'value': 31.0, 'max': 28.0},
    'humidity_low': {'value': 60.0, 'min': 70.0},
    'humidity_high': {'value': 92.0, 'max': 85.0},
    'disease_suspected': {'disease': 'Grasserie', 'confidence': 87},
    'stage_changed': {'stage': 'LARVA'},
    'device_offline': {'device': 'DHT22-7', 'device_id': 'abc', 'minutes': 30},
}


def room_with_batch(stage='LARVA'):
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='Room A')
    batch = BatchFactory(farm=farm, stage=stage)
    place_batch(batch, room)
    return room, batch


# ── the sentences ───────────────────────────────────────────────────────────────────────────

def test_every_code_has_an_example_and_a_text_in_each_language():
    assert set(EXAMPLE) == set(CODES) == set(TEXTS)
    for code in CODES:
        assert set(TEXTS[code]) == set(LANGUAGES), code


@pytest.mark.parametrize('lang', LANGUAGES)
@pytest.mark.parametrize('code', sorted(EXAMPLE))
def test_every_code_renders_in_every_language_with_its_values_and_nothing_left_over(code, lang):
    text = render_alert(code, EXAMPLE[code], lang)
    assert text and '{' not in text and '}' not in text
    for name, value in EXAMPLE[code].items():
        if name in ('device_id', 'stage'):
            continue
        assert str(value) in text, (name, text)


@pytest.mark.parametrize('lang', LANGUAGES)
def test_a_stage_is_named_in_the_language_of_the_reader(lang):
    text = render_alert('stage_changed', {'stage': 'COCOON'}, lang)
    assert STAGE_NAMES['COCOON'][lang] in text
    assert 'COCOON' not in text


def test_the_three_languages_are_different_texts():
    for code in CODES:
        texts = {render_alert(code, EXAMPLE[code], lang) for lang in LANGUAGES}
        assert len(texts) == 3, code


def test_english_is_the_short_wording():
    safe = SafeRange()
    assert render_alert('temperature_low', {'value': 19.5, 'min': 22.0}) == 'Temperature too low: 19.5 °C (min 22.0 °C). Check heating.'
    assert render_alert('temperature_high', {'value': 31.0, 'max': 28.0}) == 'Temperature too high: 31.0 °C (max 28.0 °C). Improve ventilation.'
    assert render_alert('humidity_low', {'value': 60.0, 'min': 70.0}) == 'Humidity too low: 60.0% (min 70.0%). Add moisture.'
    assert render_alert('humidity_high', {'value': 92.0, 'max': 85.0}) == 'Humidity too high: 92.0% (max 85.0%). Improve air flow.'
    assert temperature_problem(19.5, safe) == render_alert('temperature_low', {'value': 19.5, 'min': 22.0})
    assert humidity_problem(92.0, safe) == render_alert('humidity_high', {'value': 92.0, 'max': 85.0})
    assert temperature_problem(25.0, safe) is None and humidity_problem(78.0, safe) is None


def test_an_unknown_code_gives_the_stored_message_and_an_unknown_language_gives_english():
    assert render_alert('no_such_code', {}, 'fr', fallback='Stored words.') == 'Stored words.'
    assert render_alert(None, {}, 'fr', fallback='Stored words.') == 'Stored words.'
    assert render_alert('stage_changed', {'stage': 'LARVA'}, 'sw') == render_alert('stage_changed', {'stage': 'LARVA'}, 'en')


def test_a_missing_value_leaves_its_place_visible_rather_than_failing():
    assert '{min}' in render_alert('temperature_low', {'value': 19.5}, 'en')


def test_an_unknown_stage_is_shown_as_it_came():
    assert 'MYSTERY' in render_alert('stage_changed', {'stage': 'MYSTERY'}, 'fr')


# ── what is stored ──────────────────────────────────────────────────────────────────────────

def test_an_air_problem_stores_the_code_the_values_and_the_english_sentence():
    room, _ = room_with_batch('LARVA')
    check_room_alerts(room.pk, 19.5, 92.0)
    low = AlertLog.objects.get(room=room, type='TEMPERATURE')
    assert low.code == 'temperature_low'
    assert low.params == {'value': 19.5, 'min': 22.0}
    assert low.message == render_alert('temperature_low', low.params)
    high = AlertLog.objects.get(room=room, type='HUMIDITY')
    assert (high.code, high.params) == ('humidity_high', {'value': 92.0, 'max': 85.0})


def test_a_disease_alert_stores_the_disease_and_the_confidence():
    owner = UserFactory()
    batch = BatchFactory(farm=FarmFactory(owner=owner))
    alert = raise_disease_alert(batch, 'Grasserie', 0.874, checked_by=owner)
    assert alert.code == 'disease_suspected'
    assert alert.params == {'disease': 'Grasserie', 'confidence': 87}
    assert alert.message == render_alert('disease_suspected', alert.params)


def test_a_stage_change_stores_the_stage_code(auth_client):
    owner = UserFactory()
    batch = BatchFactory(farm=FarmFactory(owner=owner), stage='EGG')
    assert auth_client(owner).patch(f'/api/batches/{batch.pk}/stage', {'stage': 'LARVA'}, format='json').status_code == 200
    alert = AlertLog.objects.get(batch=batch, type='STAGE_CHANGE')
    assert (alert.code, alert.params) == ('stage_changed', {'stage': 'LARVA'})
    assert 'Larva' in alert.message


def test_an_offline_device_stores_its_name_its_id_and_the_minutes(settings):
    settings.DEVICE_OFFLINE_MINUTES = 30
    room, _ = room_with_batch()
    device = IoTDeviceFactory(farm=room.farm, room=room, status='online', last_seen=None)
    mark_offline_devices()
    alert = AlertLog.objects.get(room=room, type='SYSTEM')
    assert alert.code == 'device_offline'
    assert alert.params == {'device': device.name, 'device_id': device.pk, 'minutes': 30}
    assert alert.message == render_alert('device_offline', alert.params)


def test_hearing_from_a_renamed_device_still_ends_its_outage(settings):
    settings.DEVICE_OFFLINE_MINUTES = 30
    room, _ = room_with_batch()
    device = IoTDeviceFactory(farm=room.farm, room=room, status='online', last_seen=None)
    mark_offline_devices()
    type(device).objects.filter(pk=device.pk).update(name='Renamed sensor')
    device.refresh_from_db()
    record_device_reading(device, room, 25.0, 78.0)
    assert AlertLog.objects.get(room=room, type='SYSTEM').resolved_at is not None


def test_an_outage_that_was_stored_before_codes_is_still_ended_by_its_device():
    room, _ = room_with_batch()
    device = IoTDeviceFactory(farm=room.farm, room=room, status='offline')
    old = AlertLog.objects.create(
        room=room, type='SYSTEM', message=f'Device {device.name} has not sent data for 30 minutes. Check its power and connection.',
    )
    record_device_reading(device, room, 25.0, 78.0)
    old.refresh_from_db()
    assert old.resolved_at is not None


def test_a_second_quiet_spell_does_not_open_a_second_alert_for_the_same_outage(settings):
    settings.DEVICE_OFFLINE_MINUTES = 30
    room, _ = room_with_batch()
    IoTDeviceFactory(farm=room.farm, room=room, status='online', last_seen=None)
    mark_offline_devices()
    mark_offline_devices()
    assert AlertLog.objects.filter(room=room, type='SYSTEM').count() == 1


# ── what is sent ────────────────────────────────────────────────────────────────────────────

def test_the_list_answer_carries_the_code_and_the_parameters():
    alert = AlertLogFactory(code='stage_changed', params={'stage': 'PUPA'}, message='Batch stage updated to Pupa.')
    data = AlertLogSerializer(alert).data
    assert data['code'] == 'stage_changed'
    assert data['params'] == {'stage': 'PUPA'}
    assert data['message'] == 'Batch stage updated to Pupa.'


def test_an_old_alert_has_no_code_and_still_has_its_message():
    alert = AlertLogFactory(message='Temperature too low: 21.0 C')
    data = AlertLogSerializer(alert).data
    assert data['code'] is None and data['params'] == {}
    assert data['message'] == 'Temperature too low: 21.0 C'


def test_the_stream_payload_carries_the_code_and_the_parameters():
    alert = AlertLogFactory(code='humidity_low', params={'value': 60.0, 'min': 70.0}, message='Humidity too low')
    payload = _payload(alert)
    assert payload['code'] == 'humidity_low'
    assert payload['params'] == {'value': 60.0, 'min': 70.0}
    assert payload['message'] == 'Humidity too low'


def test_the_stream_payload_of_an_old_alert_has_a_null_code():
    payload = _payload(AlertLogFactory(message='Old words'))
    assert payload['code'] is None and payload['params'] == {}


# ── old rows ────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('message, expected', [
    ('Temperature too low: 19.5 °C (safe min is 22.0 °C). Check heating.', ('temperature_low', {'value': 19.5, 'min': 22.0})),
    ('Temperature too high: 31 °C (safe max is 28 °C). Improve ventilation.', ('temperature_high', {'value': 31.0, 'max': 28.0})),
    ('Humidity too low: 60.0% (safe min is 70.0%). Add moisture.', ('humidity_low', {'value': 60.0, 'min': 70.0})),
    ('Humidity too high: 92.0% (safe max is 85.0%). Improve air circulation.', ('humidity_high', {'value': 92.0, 'max': 85.0})),
    (
        'Grasserie suspected in this batch (87% confidence). Check the batch and ask your supervisor to take a look.',
        ('disease_suspected', {'disease': 'Grasserie', 'confidence': 87}),
    ),
    ('Batch stage updated to LARVA.', ('stage_changed', {'stage': 'LARVA'})),
    # How the first versions wrote them: no degree sign, and a disease sentence that stopped after the confidence.
    ('Temperature too low: 20.3 C (safe min is 22.0 C). Check heating.', ('temperature_low', {'value': 20.3, 'min': 22.0})),
    ('Temperature too high: 28.1 C (safe max is 28.0 C). Improve ventilation.', ('temperature_high', {'value': 28.1, 'max': 28.0})),
    ('Flacherie suspected in this batch (78% confidence).', ('disease_suspected', {'disease': 'Flacherie', 'confidence': 78})),
    (
        'Device DHT22 north has not sent data for 30 minutes. Check its power and connection.',
        ('device_offline', {'device': 'DHT22 north', 'minutes': 30}),
    ),
])
def test_an_old_message_is_matched_to_its_code_and_values(message, expected):
    assert code_for(message) == expected


@pytest.mark.parametrize('message', ['', 'Something else happened.', 'Temperature too low: 21.0 C', 'Flacherie suspected'])
def test_a_message_nobody_recognises_is_left_alone(message):
    assert code_for(message) is None


def test_the_backfill_codes_old_rows_and_leaves_the_rest(django_db_blocker):
    from django.apps import apps

    from alerts.code_backfill import backfill

    known = AlertLogFactory(message='Batch stage updated to PUPA.', type='STAGE_CHANGE')
    unknown = AlertLogFactory(message='Flacherie suspected', type='DISEASE')
    already = AlertLogFactory(message='kept', code='humidity_low', params={'value': 1, 'min': 2})
    backfill(apps)
    known.refresh_from_db(), unknown.refresh_from_db(), already.refresh_from_db()
    assert (known.code, known.params) == ('stage_changed', {'stage': 'PUPA'})
    assert unknown.code is None and unknown.params == {}
    assert (already.code, already.params) == ('humidity_low', {'value': 1, 'min': 2})
    backfill(apps)   # safe to run again
    known.refresh_from_db()
    assert known.code == 'stage_changed'


# ── the web has the same words ──────────────────────────────────────────────────────────────

PAGES = Path(__file__).resolve().parents[1] / 'frontend' / 'src' / 'i18n' / 'pages.ts'
WEB_KEY = {
    'temperature_low': 'alcTemperatureLow', 'temperature_high': 'alcTemperatureHigh',
    'humidity_low': 'alcHumidityLow', 'humidity_high': 'alcHumidityHigh',
    'disease_suspected': 'alcDiseaseSuspected', 'stage_changed': 'alcStageChanged', 'device_offline': 'alcDeviceOffline',
}
_STRING = r'"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\''


def web_texts(key: str) -> dict:
    source = PAGES.read_text(encoding='utf-8')
    found = re.search(rf'^\s*{key}: k\(\s*(?:{_STRING})\s*,\s*(?:{_STRING})\s*,\s*(?:{_STRING})\s*\)', source, re.MULTILINE)
    assert found, f'{key} is missing from pages.ts'
    parts = found.groups()
    texts = [parts[i] if parts[i] is not None else parts[i + 1] for i in (0, 2, 4)]
    return dict(zip(LANGUAGES, (t.replace("\\'", "'").replace('\\"', '"') for t in texts)))


@pytest.mark.parametrize('code', sorted(WEB_KEY))
def test_the_web_says_the_same_words_as_the_server(code):
    assert set(WEB_KEY) == set(CODES)
    assert web_texts(WEB_KEY[code]) == TEXTS[code]
