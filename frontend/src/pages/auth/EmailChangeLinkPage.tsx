import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { AuthShell } from '../../landing/auth/AuthShell';
import { accountService } from '../../services/account.service';

type Status = 'loading' | 'success' | 'error';

/**
 * The page behind a link in an email about a change of login email. It opens the link once, as soon as it is drawn, and says
 * what happened. A link is good once, so a page drawn twice (as React does while developing) must not use it twice.
 */
export default function EmailChangeLinkPage({ kind }: { kind: 'confirm' | 'undo' }) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setStatus('error');
      setMessage(t('erLinkInvalid'));
      return;
    }
    const call = kind === 'confirm' ? accountService.confirmEmailChange : accountService.undoEmailChange;
    call(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setMessage(getErrorMessage(err));
        setStatus('error');
      });
    // The link is opened once, when the page is first drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'loading') {
    return (
      <AuthShell title={t('ecWorking')}>
        <p className="l-auth__status" role="status">
          <span className="l-auth__spinner l-auth__spinner--dark" aria-hidden="true" />
        </p>
      </AuthShell>
    );
  }

  const done = status === 'success';
  const title = done ? t(kind === 'confirm' ? 'ecDoneTitle' : 'ecUndoneTitle') : t('ecLinkFailed');
  const subtitle = done ? t(kind === 'confirm' ? 'ecDoneBody' : 'ecUndoneBody') : message;
  return (
    <AuthShell title={title} subtitle={subtitle}>
      <div className="l-auth__actions">
        <Link to="/login" className="l-auth__submit">{t('loginSignIn')}</Link>
      </div>
    </AuthShell>
  );
}
