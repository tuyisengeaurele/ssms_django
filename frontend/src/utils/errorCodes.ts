/**
 * The codes the server puts on an error answer, and the text the page writes for each, in the language of the screen. The server
 * has the same list (core/error_text.py) and a test compares them. A code that is not here (an idle session, a missing second
 * factor, a stale decision) is a flow of its own, and the page handles it where it happens.
 */
export const ERROR_CODE_KEY: Record<string, string> = {
  bad_login: 'erBadLogin',
  email_taken: 'erEmailTaken',
  invalid_phone: 'erBadPhone',
  phone_required: 'erPhoneRequired',
  phone_taken: 'erPhoneTaken',
  phone_confirm_mismatch: 'erPhoneConfirm',
  confirm_mismatch: 'erConfirmTyped',
  wrong_password: 'erWrongPassword',
  email_same: 'erEmailSame',
  link_invalid: 'erLinkInvalid',
  link_expired: 'erLinkExpired',
  link_used: 'erLinkUsed',
  email_not_sent: 'erEmailNotSent',
  nothing_to_cancel: 'erNothingToCancel',
  undo_blocked: 'erUndoBlocked',
  invalid_input: 'erCheckInput',
  forbidden: 'erForbidden',
  not_found: 'erNotFound',
  session_ended: 'erSession',
  something_wrong: 'erGeneric',
  not_authenticated: 'aeSignIn',
  inactive_account: 'aeInactive',
  method_not_allowed: 'aeMethod',
  bad_request: 'aeBadRequest',
  server_error: 'aeServerSide',
};
