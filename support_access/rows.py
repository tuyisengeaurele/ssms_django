"""The two shapes of a support request that leave the server: what the admin sees and what the person sees.

Keys are snake_case here. The renderer sends them as camelCase, as the rest of the API does.
The person is never told more than the request holds: no ids of other people, no tokens.
"""
from .models import REQUEST_WAIT, SupportAccess


def admin_row(access: SupportAccess) -> dict:
    return {
        'id': access.id,
        'status': access.status,
        'reason': access.reason,
        'minutes': access.minutes,
        'requested_mode': access.requested_mode,
        'granted_mode': access.granted_mode,
        'person': {'id': access.person_id, 'name': access.person_name},
        'requested_at': access.requested_at,
        'decided_at': access.decided_at,
        'started_at': access.started_at,
        'ends_at': access.ends_at,
        'ended_by': access.ended_by,
        'ended_reason': access.ended_reason,
    }


def person_row(access: SupportAccess) -> dict:
    return {
        'id': access.id,
        'status': access.status,
        'reason': access.reason,
        'minutes': access.minutes,
        'requested_mode': access.requested_mode,
        'granted_mode': access.granted_mode,
        'admin': {'name': access.admin_name},
        'requested_at': access.requested_at,
        # When the question stops waiting for an answer.
        'expires_at': access.requested_at + REQUEST_WAIT,
        'started_at': access.started_at,
        'ends_at': access.ends_at,
        'ended_by': access.ended_by,
        'ended_reason': access.ended_reason,
    }
