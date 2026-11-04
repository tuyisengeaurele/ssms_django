"""Who may do what, in one table.

A view names its `resource`, and `core.permissions.RolePermission` looks the method up here. A method means the obvious
action (GET read, POST create, PATCH and PUT update, DELETE delete) unless the view names another in `actions`.

This table is only about roles. Which records a role may see is `core.access`: a farmer reaches their own farms, a
supervisor the farms of their cooperative, an admin every farm. A role this table allows can still get "not found" for a
record outside its reach.

`tests/security/test_permission_walk.py` finds every view under /api and fails when one has no entry here, or when the
endpoint and this table disagree.
"""

FARMER = 'FARMER'
SUPERVISOR = 'SUPERVISOR'
ADMIN = 'ADMIN'
ROLES = (FARMER, SUPERVISOR, ADMIN)

ALL = frozenset(ROLES)
FARMER_OR_ADMIN = frozenset({FARMER, ADMIN})
STAFF = frozenset({SUPERVISOR, ADMIN})
ADMIN_ONLY = frozenset({ADMIN})
FARMER_ONLY = frozenset({FARMER})

PERMISSIONS: dict[str, dict[str, frozenset]] = {
    # The person's own account and sign ins. Everyone, and only their own.
    'account': {
        'read': ALL, 'update': ALL, 'delete': ALL, 'ping': ALL, 'revoke_others': ALL,
    },
    'farms': {
        'read': ALL, 'create': FARMER_OR_ADMIN, 'update': FARMER_OR_ADMIN, 'delete': FARMER_OR_ADMIN,
        'summary': ALL, 'risk': STAFF,
    },
    'rooms': {
        'read': ALL, 'create': FARMER_OR_ADMIN, 'update': FARMER_OR_ADMIN, 'delete': FARMER_OR_ADMIN,
    },
    'batches': {
        'read': ALL, 'create': FARMER_OR_ADMIN, 'update': FARMER_OR_ADMIN, 'delete': FARMER_OR_ADMIN,
        'move_room': FARMER_OR_ADMIN, 'advance_stage': FARMER_OR_ADMIN,
        'report': ALL, 'active': ALL, 'compare': ALL,
    },
    'mortality': {'read': ALL, 'create': FARMER_OR_ADMIN, 'delete': FARMER_OR_ADMIN},
    # A supervisor may read a lot but not change it or share it.
    'harvests': {'read': ALL, 'create': FARMER_OR_ADMIN, 'delete': FARMER_OR_ADMIN, 'share': FARMER_OR_ADMIN},
    'detections': {'read': ALL, 'create': ALL, 'feedback': ALL, 'recent': STAFF},
    'readings': {'read': ALL, 'create': ALL},
    'devices': {'read': ALL, 'create': STAFF, 'update': STAFF, 'delete': STAFF},
    'alerts': {
        'read': ALL, 'mark_read': ALL, 'mark_all_read': STAFF, 'stream_ticket': STAFF, 'stream': STAFF,
    },
    'alert_acknowledgements': {'create': STAFF, 'delete': STAFF},
    # Taking a comment away is the author's or an admin's. That is about the record, so the view keeps it.
    'alert_comments': {'read': ALL, 'create': ALL, 'delete': ALL},
    'thresholds': {'read': ALL, 'update': ADMIN_ONLY},
    'cooperatives': {
        'read': ALL, 'create': ADMIN_ONLY, 'update': ADMIN_ONLY, 'delete': ADMIN_ONLY, 'restore': ADMIN_ONLY,
    },
    # A supervisor's own farmers and invitations, or the cooperative an admin names.
    'team': {'read': STAFF, 'create': STAFF, 'delete': STAFF},
    'invitations': {'accept': FARMER_ONLY},
    'locations': {'read': ALL, 'locate': ALL},
    'cooperative_reports': {'read': STAFF},
    'reports': {'read': ADMIN_ONLY},
    'system_health': {'read': ADMIN_ONLY},
    'audit_log': {'read': ADMIN_ONLY},
    'logs': {'read': ADMIN_ONLY},
    'contacts': {'read': ADMIN_ONLY, 'update': ADMIN_ONLY, 'create': ADMIN_ONLY, 'delete': ADMIN_ONLY},
    'admin_users': {
        'read': ADMIN_ONLY, 'create': ADMIN_ONLY, 'update': ADMIN_ONLY, 'delete': ADMIN_ONLY, 'restore': ADMIN_ONLY,
    },
}


def may(role, resource, action) -> bool:
    """True when the role may do the action on the resource. What the table does not know is refused."""
    return role in PERMISSIONS.get(resource, {}).get(action, ())
