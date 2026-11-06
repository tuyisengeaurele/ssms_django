import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

/**
 * The recovery codes of an admin, shown once, with a way to copy them and to keep them in a file.
 * `public` is for the sign in pages (styled in landing/auth/auth.css), `app` for the signed in app (styles/components.css).
 */
export default function RecoveryCodes({ codes, variant = 'public' }: { codes: string[]; variant?: 'public' | 'app' }) {
  const { t } = useLanguage();
  const app = variant === 'app';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard still has the list on screen and the download.
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ssms-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={app ? 'mfa-codes' : 'l-mfa__codes'}>
      <ul className={app ? 'mfa-codes__list' : 'l-mfa__codelist'}>
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className={app ? 'mfa-codes__actions' : 'l-mfa__actions'}>
        <button type="button" className={app ? 'btn btn-secondary btn-sm' : 'l-auth__ghost'} onClick={copy}>
          {t('adMfaCopy')}
        </button>
        <button type="button" className={app ? 'btn btn-secondary btn-sm' : 'l-auth__ghost'} onClick={download}>
          {t('adMfaDownload')}
        </button>
        <span role="status" className={app ? 'mfa-codes__copied' : 'l-mfa__copied'}>
          {copied ? t('adMfaCopied') : ''}
        </span>
      </div>
    </div>
  );
}
