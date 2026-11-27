"""When a farmer or supervisor is reminded about two-step sign in.

The server keeps the schedule, so it follows the person from phone to phone. A reminder that nags is worse than none:
each "remind me later" waits longer, nothing is shown twice in a day, and after three the ordinary sign in stops asking.
"""
from datetime import datetime, timedelta

TRIGGERS = ('login', 'password_changed', 'new_device', 'sensitive_action')

# The wait after the first, second, third and every later "remind me later".
WAITS = (timedelta(days=3), timedelta(days=7), timedelta(days=30), timedelta(days=90))
SIGN_IN_STOPS_AFTER = 3
BETWEEN_REMINDERS = timedelta(days=1)
# A new device is worth interrupting a wait for, now and then.
BETWEEN_NEW_DEVICE_BREAKS = timedelta(days=7)


def may_be_reminded(user, *, enabled: bool, shared_device: bool, acting: bool) -> bool:
    """False for the people who are never reminded, at any moment.

    An admin must have it already. A shared computer is not the place to set it up. Somebody who still has to give a phone
    number, or is closing the account, has a screen of their own to get through first.
    """
    return not (
        user.role == 'ADMIN' or enabled or acting or shared_device or not user.phone or user.deletion_requested_at is not None
    )


def should_prompt(user, trigger: str, now: datetime, *, enabled: bool, shared_device: bool, acting: bool) -> bool:
    """Should the reminder be shown at this moment? Reads only what it is given."""
    if trigger not in TRIGGERS or not may_be_reminded(user, enabled=enabled, shared_device=shared_device, acting=acting):
        return False
    shown = user.mfa_prompted_at

    def shown_within(length: timedelta) -> bool:
        return shown is not None and now - shown < length

    waiting = user.mfa_prompt_snoozed_until is not None and now < user.mfa_prompt_snoozed_until
    if trigger == 'new_device' and waiting:
        return not shown_within(BETWEEN_NEW_DEVICE_BREAKS)
    if waiting or (trigger == 'login' and user.mfa_prompt_dismissals >= SIGN_IN_STOPS_AFTER):
        return False
    return not shown_within(BETWEEN_REMINDERS)


def snooze(user, now: datetime) -> datetime:
    """The person chose "remind me later". Returns the day the wait ends."""
    user.mfa_prompt_dismissals = user.mfa_prompt_dismissals + 1
    user.mfa_prompt_snoozed_until = now + WAITS[min(user.mfa_prompt_dismissals, len(WAITS)) - 1]
    user.save(update_fields=['mfa_prompt_dismissals', 'mfa_prompt_snoozed_until'])
    return user.mfa_prompt_snoozed_until
