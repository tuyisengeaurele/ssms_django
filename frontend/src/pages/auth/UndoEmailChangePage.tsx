import EmailChangeLinkPage from './EmailChangeLinkPage';

/** /undo-email-change?token=...: the link sent to the old address, good for seven days. */
export default function UndoEmailChangePage() {
  return <EmailChangeLinkPage kind="undo" />;
}
