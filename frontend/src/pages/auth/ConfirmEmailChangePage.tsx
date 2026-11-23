import EmailChangeLinkPage from './EmailChangeLinkPage';

/** /confirm-email-change?token=...: the link sent to the new address. */
export default function ConfirmEmailChangePage() {
  return <EmailChangeLinkPage kind="confirm" />;
}
