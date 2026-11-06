"""What an admin acting as a person may do. Anything not written down here is refused.

The check runs in the authentication step, before any view, so a view cannot forget it and a new endpoint is refused
until somebody decides. It reads the `resource` and the action each view already names for the permission table
(`core/permissions_table.py`), so there is no second list of routes to keep in step.

Two modes. View only is every read. Edit is every read, plus the writes in EDIT_PAIRS. Nothing is ever deleted, and
a few things are refused even to look at.
"""

VIEW_ONLY = 'support_view_only'
BLOCKED = 'support_blocked'

SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')

# The only writes edit mode allows. Deleting is not on the list. Publishing a harvest lot link (`harvests.share`) is not
# either. Adding a pair is one line here, and the walk in tests/test_support_rules.py will say so until it is decided.
EDIT_PAIRS = frozenset({
    ('farms', 'create'), ('farms', 'update'),
    ('rooms', 'create'), ('rooms', 'update'),
    ('batches', 'create'), ('batches', 'update'), ('batches', 'move_room'), ('batches', 'advance_stage'),
    ('mortality', 'create'),
    ('harvests', 'create'),
    ('detections', 'create'), ('detections', 'feedback'),
    ('readings', 'create'),
    ('devices', 'create'), ('devices', 'update'),
    ('alerts', 'mark_read'), ('alerts', 'mark_all_read'),
    ('alert_acknowledgements', 'create'),
    ('alert_comments', 'create'),
})

# POSTs that change nothing the person owns, so view only may use them: looking a place up, and the activity ping.
SAFE_POSTS = frozenset({('locations', 'locate'), ('account', 'ping')})

# Refused in both modes, even to look at. The devices list would show the person's other sign ins, and the live alert
# stream cannot be used here (its ticket call is a write, and the stream is not one of the views listed).
REFUSED_PAIRS = frozenset({('account', 'sessions'), ('alerts', 'stream_ticket'), ('alerts', 'stream'), ('harvests', 'share')})
REFUSED_RESOURCES = frozenset({
    'support_access', 'second_factor', 'admin_users', 'system_health', 'audit_log', 'logs', 'contacts', 'reports',
})


def decide(resource: str | None, action: str | None, method: str, mode: str) -> str | None:
    """None when the request may go on, otherwise the code to refuse it with."""
    if resource is None or action is None or resource in REFUSED_RESOURCES or (resource, action) in REFUSED_PAIRS:
        return BLOCKED
    pair = (resource, action)
    if method.upper() in SAFE_METHODS or pair in SAFE_POSTS:
        return None
    if mode != 'edit':
        return VIEW_ONLY
    return None if pair in EDIT_PAIRS else BLOCKED
