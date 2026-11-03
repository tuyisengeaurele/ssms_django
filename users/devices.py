"""A short, honest name for the browser a person signed in from.

Only what the browser says is used. Chrome hides the real phone model in its agent text (it shows the letter K),
so a model appears only when the page asked the browser for it. Everything the page sends is untrusted text.
"""
import hashlib
import re
from dataclasses import dataclass

from ua_parser import parse

MODEL_LIMIT = 40
INSTALLED_NAME = 'SSMS app'
UNKNOWN = 'Unknown device'
# Names the parser gives for a computer or a phone it could not name. They say nothing about the device.
NOT_A_MODEL = {'', 'k', 'mac', 'other', 'generic smartphone', 'generic feature phone', 'generic tablet', 'spider'}
OS_NAMES = {'Mac OS X': 'macOS', 'Chrome OS': 'ChromeOS'}
TAGS = re.compile(r'<[^>]*>')
PLAIN = re.compile(r'[^A-Za-z0-9 .+_()-]')


@dataclass(frozen=True)
class DeviceInfo:
    label: str
    browser: str
    os: str
    is_installed_app: bool
    model: str = ''


def _clean(text) -> str:
    if not isinstance(text, str):
        return ''
    return ' '.join(PLAIN.sub('', TAGS.sub('', text)).split())[:MODEL_LIMIT].strip()


def _browser(family: str | None) -> str:
    if not family or family == 'Other':
        return ''
    return re.sub(r'\bMobile\b', '', family).replace('  ', ' ').strip()


def _usable_model(name) -> str:
    cleaned = _clean(name)
    return '' if cleaned.lower() in NOT_A_MODEL or len(cleaned) < 2 else cleaned


def describe_device(user_agent, hints) -> DeviceInfo:
    hints = hints if isinstance(hints, dict) else {}
    try:
        parsed = parse(user_agent) if isinstance(user_agent, str) and user_agent else None
    except Exception:
        parsed = None
    browser = _browser(parsed.user_agent.family) if parsed and parsed.user_agent else ''
    os_family = parsed.os.family if parsed and parsed.os and parsed.os.family != 'Other' else ''
    os_name = OS_NAMES.get(os_family, os_family) or _clean(hints.get('platform'))
    device = parsed.device if parsed and parsed.device else None
    model = _usable_model(hints.get('model')) or (_usable_model(device.model or device.family) if device else '')
    installed = hints.get('installed') is True

    if not browser and not os_name and not installed:
        return DeviceInfo(UNKNOWN, '', '', False)
    where = model or os_name or 'this device'
    label = f'{INSTALLED_NAME if installed else browser or "Browser"} on {where}'
    return DeviceInfo(label[:80], browser, os_name, installed, model)


def fingerprint(info: DeviceInfo) -> str:
    """The same browser on the same system gives the same value. Used to tell a new device from a known one."""
    return hashlib.sha256(f'{info.browser}|{info.os}|{info.model}|{info.is_installed_app}'.encode()).hexdigest()[:16]
