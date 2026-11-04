"""What a change did to each field, for the audit log.

Only fields that changed are listed, with the old and the new value. A field that looks like a secret is never written
down, only the fact that it changed. Long text is cut and values JSON cannot hold are written as text, so building an
entry can never fail on what a person typed.
"""
import re
from datetime import date, datetime

HIDDEN = '[hidden]'
LONGEST = 200

# A name that suggests the value is a secret. Checked on the field name, so it holds for any model.
SECRET = re.compile(r'pass(word|phrase)?|token|secret|api_?key|authoriz|cookie|credential|^refresh$|^key$', re.IGNORECASE)


def snapshot(instance, fields) -> dict:
    """The named fields of an object, taken before it is changed."""
    return {name: getattr(instance, name, None) for name in fields}


def _plain(value):
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value if len(value) <= LONGEST else value[:LONGEST] + '…'
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    pk = getattr(value, 'pk', None)
    if pk is not None:
        return _plain(str(pk))
    return _plain(str(value))


def build_changes(before: dict, after: dict) -> dict:
    changes = {}
    for field in sorted(set(before) | set(after)):
        old, new = before.get(field), after.get(field)
        if type(old) is type(new) and old == new:
            continue
        if SECRET.search(field):
            changes[field] = {'from': HIDDEN, 'to': HIDDEN}
        else:
            changes[field] = {'from': _plain(old), 'to': _plain(new)}
    return changes
