import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

/** The recovery codes of an admin, shown once, with a way to copy them and to keep them in a file. */
export default function RecoveryCodes({ codes }: { codes: string[] }) {
  const { t } = useLanguage();
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
    <div className="l-mfa__codes">
      <ul className="l-mfa__codelist">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="l-mfa__actions">
        <button type="button" className="l-auth__ghost" onClick={copy}>
          {t('adMfaCopy')}
        </button>
        <button type="button" className="l-auth__ghost" onClick={download}>
          {t('adMfaDownload')}
        </button>
        <span role="status" className="l-mfa__copied">
          {copied ? t('adMfaCopied') : ''}
        </span>
      </div>
    </div>
  );
}
