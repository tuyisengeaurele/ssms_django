"""Giving the alerts that were stored as a sentence a code and values, by the shape of the sentence.

Run once by a migration and safe to run again. A sentence nobody recognises is left alone: it is still shown by its message.
"""
import re

_NUMBER = r'(?P<{}>\d+(?:\.\d+)?)'


def _air(kind: str, word: str, side: str, unit: str, advice: str) -> str:
    return rf'^{kind} too {word}: {_NUMBER.format("value")} {unit} \(safe {side} is {_NUMBER.format(side)} {unit}\)\. {advice}\.$'


# Written as the old messages were: a space before the degree sign, none before the percent sign. The first versions had no
# degree sign at all ("21.0 C").
_DEGREES = r'(?:°C|C)'

PATTERNS = [
    ('temperature_low', re.compile(_air('Temperature', 'low', 'min', _DEGREES, 'Check heating'))),
    ('temperature_high', re.compile(_air('Temperature', 'high', 'max', _DEGREES, 'Improve ventilation'))),
    ('humidity_low', re.compile(rf'^Humidity too low: {_NUMBER.format("value")}% \(safe min is {_NUMBER.format("min")}%\)\. Add moisture\.$')),
    ('humidity_high', re.compile(rf'^Humidity too high: {_NUMBER.format("value")}% \(safe max is {_NUMBER.format("max")}%\)\. Improve air circulation\.$')),
    # The first versions stopped after the confidence, with no advice after it.
    ('disease_suspected', re.compile(r'^(?P<disease>.+?) suspected in this batch \((?P<confidence>\d+)% confidence\)\.(?: |$)')),
    ('stage_changed', re.compile(r'^Batch stage updated to (?P<stage>[A-Z]+)\.$')),
    ('device_offline', re.compile(r'^Device (?P<device>.+) has not sent data for (?P<minutes>\d+) minutes\. Check its power and connection\.$')),
]
_WHOLE_NUMBERS = {'confidence', 'minutes'}
_DECIMALS = {'value', 'min', 'max'}


def code_for(message: str):
    """(code, params) for an old sentence, or None."""
    for code, pattern in PATTERNS:
        found = pattern.match(message or '')
        if found:
            params = {
                # A device called "7" is still text, so only the named values are numbers.
                name: int(text) if name in _WHOLE_NUMBERS else float(text) if name in _DECIMALS else text
                for name, text in found.groupdict().items()
            }
            return code, params
    return None


def backfill(apps) -> None:
    AlertLog = apps.get_model('alerts', 'AlertLog')
    for alert_id, message in AlertLog.objects.filter(code__isnull=True).values_list('id', 'message').iterator():
        found = code_for(message)
        if found:
            AlertLog.objects.filter(pk=alert_id, code__isnull=True).update(code=found[0], params=found[1])
