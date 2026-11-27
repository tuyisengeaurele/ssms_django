"""The sentence for each error code, in the language asked for.

The web translates a code by itself, with its own catalogue; these are the same words (copied from it into `core/doc_text.py`), so
anyone else who reads the answer gets the sentence in the same language. A code is never renamed or reused for another meaning.
"""
from .doc_text import t

CODE_KEYS = {
    'bad_login': 'erBadLogin',
    'email_taken': 'erEmailTaken',
    'invalid_phone': 'erBadPhone',
    'phone_required': 'erPhoneRequired',
    'phone_taken': 'erPhoneTaken',
    'phone_confirm_mismatch': 'erPhoneConfirm',
    'confirm_mismatch': 'erConfirmTyped',
    'wrong_password': 'erWrongPassword',
    'mfa_wrong_code': 'erMfaWrongCode',
    'mfa_already_on': 'erMfaAlreadyOn',
    'mfa_start_again': 'erMfaStartAgain',
    'mfa_not_on': 'erMfaNotOn',
    'announcement_times': 'erAnnouncementTimes',
    'announcement_past': 'erAnnouncementPast',
    'announcement_ended': 'erAnnouncementEnded',
    'email_same': 'erEmailSame',
    'link_invalid': 'erLinkInvalid',
    'link_expired': 'erLinkExpired',
    'link_used': 'erLinkUsed',
    'email_not_sent': 'erEmailNotSent',
    'nothing_to_cancel': 'erNothingToCancel',
    'undo_blocked': 'erUndoBlocked',
    'coop_request_open': 'erCoopRequestOpen',
    'coop_request_same': 'erCoopRequestSame',
    'coop_reason_required': 'erCoopReasonRequired',
    'coop_note_required': 'erCoopNoteRequired',
    'coop_already_decided': 'erCoopAlreadyDecided',
    'coop_person_inactive': 'erCoopPersonInactive',
    'coop_cooperative_inactive': 'erCoopCooperativeInactive',
    'coop_already_moved': 'erCoopAlreadyMoved',
    'coop_nothing_to_withdraw': 'erCoopNothingToWithdraw',
    'deletion_scheduled': 'erDeletionScheduled',
    'deletion_not_for_staff': 'erDeletionNotForStaff',
    'deletion_nothing_to_cancel': 'erDeletionNothingToCancel',
    'anonymised': 'erAnonymised',
    'photo_not_image': 'erPhotoNotImage',
    'photo_too_large': 'erPhotoTooLarge',
    'photo_missing': 'erPhotoMissing',
    'photo_none': 'erPhotoNone',
    'invalid_input': 'erCheckInput',
    'forbidden': 'erForbidden',
    'not_found': 'erNotFound',
    'session_ended': 'erSession',
    'something_wrong': 'erGeneric',
    'not_authenticated': 'aeSignIn',
    'inactive_account': 'aeInactive',
    'method_not_allowed': 'aeMethod',
    'bad_request': 'aeBadRequest',
    'server_error': 'aeServerSide',
}

# A wait is told in seconds (a slow down) or in minutes (a locked email), each with a singular for one.
_WAITS = {'throttled': ('aeThrottled', 'aeThrottledOne', 'aeThrottledWait'), 'locked': ('aeLocked', 'aeLockedOne', 'aeThrottledWait')}
CODES = (*CODE_KEYS, *_WAITS)


def error_text(code, lang='en', n=None):
    """The sentence for a code, or None when the code is not one of ours. `n` is the wait, for throttled and locked."""
    if code in _WAITS:
        many, one, unknown = _WAITS[code]
        if not n:
            return t(lang, unknown)
        return t(lang, one if n == 1 else many, n=n)
    key = CODE_KEYS.get(code)
    return t(lang, key) if key else None
