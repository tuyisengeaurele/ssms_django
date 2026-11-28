"""What the deployed service installs. This reads the pin, so an older library cannot come back unnoticed."""
import re
from pathlib import Path

REQUIREMENTS = (Path(__file__).parent.parent / 'requirements.txt').read_text(encoding='utf-8')


def pinned(name):
    found = re.search(rf'^{re.escape(name)}==([\d.]+)\s*$', REQUIREMENTS, re.MULTILINE)
    assert found, f'{name} should be pinned to one version'
    return tuple(int(part) for part in found.group(1).split('.'))


def test_the_upload_library_has_none_of_the_known_flaws():
    # 0.0.31 is the first release with every advisory against it fixed, as of November 2026.
    assert pinned('python-multipart') >= (0, 0, 31)


def test_the_web_layer_has_none_of_the_known_flaws():
    # 1.3.1 is the first release with every advisory against it fixed, as of November 2026. Pinned here although FastAPI
    # asks for it too: FastAPI alone would accept releases far older than that.
    assert pinned('starlette') >= (1, 3, 1)
