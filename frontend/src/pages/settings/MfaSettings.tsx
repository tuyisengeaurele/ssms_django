import { useEffect, useState } from 'react';
import CodeModal from '../../components/auth/CodeModal';
import RecoveryCodes from '../../components/auth/RecoveryCodes';
import Panel from '../../components/ui/Panel';
import { useLanguage } from '../../context/LanguageContext';
import { mfaService } from '../../services/mfa.service';
import type { MfaStatus } from '../../types';
import { fill } from '../../utils/fill';

/** An admin's authenticator app: is it on, how many recovery codes are left, and a way to make new ones. */
export default function MfaSettings() {
  const { t, locale } = useLanguage();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  // The new codes are shown here once, until the person says they are done.
  const [fresh, setFresh] = useState<string[] | null>(null);

  useEffect(() => {
    let live = true;
    mfaService
      .status()
      .then((res) => { if (live) setStatus(res.data.data); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const makeNewCodes = async (code: string) => {
    const res = await mfaService.newRecoveryCodes(code);
    const codes = res.data.data.recoveryCodes;
    setFresh(codes);
    setStatus((current) => (current ? { ...current, recoveryCodesLeft: codes.length } : current));
    setAsking(false);
  };

  const since = status?.enabledAt ? new Date(status.enabledAt).toLocaleDateString(locale, { dateStyle: 'medium' }) : '';

  return (
    <>
      <Panel
        title={t('adMfaPanelTitle')}
        note={t('adMfaPanelNote')}
        actions={
          status?.enabled ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setAsking(true)}>{t('adMfaNewCodes')}</button>
          ) : undefined
        }
      >
        {failed ? <div className="alert alert-error" role="alert">{t('adMfaStatusError')}</div> : null}
        {status ? (
          <div className="mfa-status">
            <p className="mfa-status__state">{status.enabled ? t('adMfaOn') : t('adMfaOff')}</p>
            {status.enabled ? (
              <>
                {since ? <p>{fill(t('adMfaOnSince'), { date: since })}</p> : null}
                <p>
                  {status.recoveryCodesLeft === 1
                    ? t('adMfaCodesLeftOne')
                    : fill(t('adMfaCodesLeft'), { n: status.recoveryCodesLeft })}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
        {fresh ? (
          <div className="mfa-fresh">
            <h3>{t('adMfaNewCodesDone')}</h3>
            <p className="modal-text">{t('adMfaCodesHint')}</p>
            <RecoveryCodes codes={fresh} variant="app" />
            <div>
              <button className="btn btn-primary btn-sm" onClick={() => setFresh(null)}>{t('adMfaDone')}</button>
            </div>
          </div>
        ) : null}
      </Panel>

      <CodeModal
        open={asking}
        title={t('adMfaNewCodesTitle')}
        body={t('adMfaNewCodesBody')}
        confirmLabel={t('adMfaStepUpConfirm')}
        onSubmit={makeNewCodes}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
