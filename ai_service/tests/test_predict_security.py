import importlib
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

SECRET = 'a-long-shared-secret-for-tests'


def picture(fmt='PNG', size=(8, 8)):
    buffer = io.BytesIO()
    Image.new('RGB', size, (20, 120, 60)).save(buffer, fmt)
    return buffer.getvalue()


def load_app(monkeypatch, *, secret=SECRET, insecure=None):
    """Import main fresh, with the environment a deployment would give it."""
    for name, value in (('AI_SERVICE_SECRET', secret), ('AI_ALLOW_INSECURE', insecure)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    import main

    return importlib.reload(main)


@pytest.fixture
def app(monkeypatch):
    module = load_app(monkeypatch)
    monkeypatch.setattr(module, 'run_model', lambda arr: np.array([0.05, 0.05, 0.8, 0.05, 0.05]))
    return module


@pytest.fixture
def client(app):
    return TestClient(app.app)


def predict(client, data, *, secret=SECRET, content_type='image/png', name='worm.png'):
    headers = {'X-Internal-Secret': secret} if secret is not None else {}
    return client.post('/predict', files={'file': (name, data, content_type)}, headers=headers)


# ── who may call ────────────────────────────────────────────────────────────────────────────

def test_a_call_without_the_secret_is_refused(client):
    assert predict(client, picture(), secret=None).status_code == 401


def test_a_call_with_the_wrong_secret_is_refused(client):
    assert predict(client, picture(), secret='guess').status_code == 401


def test_a_call_with_the_right_secret_works(client):
    response = predict(client, picture())
    assert response.status_code == 200
    body = response.json()
    assert body['result'] == 'Healthy'
    assert body['confidence'] == 0.8
    assert set(body['allScores']) == {'Flacherie', 'Grasserie', 'Healthy', 'Muscardine', 'Pebrine'}


def test_the_service_will_not_start_without_a_secret(monkeypatch):
    with pytest.raises(RuntimeError, match='AI_SERVICE_SECRET'):
        load_app(monkeypatch, secret=None)


def test_local_development_can_switch_the_secret_off_on_purpose(monkeypatch):
    module = load_app(monkeypatch, secret=None, insecure='1')
    monkeypatch.setattr(module, 'run_model', lambda arr: np.array([0.0, 0.0, 1.0, 0.0, 0.0]))
    assert predict(TestClient(module.app), picture(), secret=None).status_code == 200


def test_health_needs_no_secret(client):
    assert client.get('/health').status_code == 200


# ── what it accepts ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('fmt', ['PNG', 'JPEG', 'WEBP'])
def test_real_photos_are_accepted_whatever_the_declared_type(client, fmt):
    assert predict(client, picture(fmt), content_type='application/octet-stream').status_code == 200


def test_a_body_over_5_megabytes_is_refused(client):
    assert predict(client, picture() + b'\0' * (5 * 1024 * 1024)).status_code == 413


def test_bytes_that_are_not_a_picture_are_a_400_even_if_labelled_png(client):
    response = predict(client, b'this is just text', content_type='image/png')
    assert response.status_code == 400


def test_a_gif_is_not_an_allowed_format(client):
    assert predict(client, picture('GIF'), content_type='image/gif').status_code == 400


def test_a_huge_picture_is_refused(client):
    assert predict(client, picture('PNG', size=(6000, 6000))).status_code == 400


def test_errors_never_echo_what_went_wrong_inside(client):
    body = predict(client, b'garbage bytes that Pillow chokes on').text
    assert 'cannot identify' not in body.lower()
    assert 'Traceback' not in body
    assert 'PIL' not in body


# ── CORS ────────────────────────────────────────────────────────────────────────────────────

def test_no_cors_headers_are_sent(client):
    response = client.get('/health', headers={'Origin': 'http://evil.example'})
    assert 'access-control-allow-origin' not in {k.lower() for k in response.headers}
    preflight = client.options(
        '/predict', headers={'Origin': 'http://evil.example', 'Access-Control-Request-Method': 'POST'},
    )
    assert 'access-control-allow-origin' not in {k.lower() for k in preflight.headers}


# ── the picture is prepared the way the model expects ──────────────────────────────────────

def test_preprocess_returns_one_224_square_float_image(app):
    arr = app.preprocess(Image.new('RGB', (40, 30), (255, 0, 0)))
    assert arr.shape == (1, 224, 224, 3)
    assert arr.dtype == np.float32


def test_preprocess_matches_tensorflow(app):
    tf = pytest.importorskip('tensorflow')
    image = Image.fromarray(np.random.default_rng(1).integers(0, 255, (224, 224, 3), dtype=np.uint8))
    expected = tf.keras.applications.resnet50.preprocess_input(np.array(image, dtype=np.float32))
    assert np.allclose(app.preprocess(image)[0], expected, atol=1e-3)
