import { useEffect, useState } from 'react';
import CodeModal from '../../components/auth/CodeModal';
import { useMfaReminder } from '../../components/auth/mfaReminderContext';
import RecoveryCodes from '../../components/auth/RecoveryCodes';
import TurnOffTwoStepDialog from '../../components/auth/TurnOffTwoStepDialog';
import TwoStepSetup from '../../components/auth/TwoStepSetup';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import Panel from '../../components/ui/Panel';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { mfaService } from '../../services/mfa.service';
import type { MfaStatus } from '../../types';
import { fill } from '../../utils/fill';
import { dateFormat } from '../../utils/dateFormat';

/** A person's two-step sign in: turn it on or off, see how many recovery codes are left, and make new ones. */
export default function MfaSettings() {
  const { t, tn, locale } = useLanguage();
  const { success } = useToast();
  const { refresh } = useMfaReminder();
  const [settingUp, setSettingUp] = useState(false);
  // While a code is being checked, and while the recovery codes are on screen, the set-up dialog cannot be closed.
  const [locked, setLocked] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  // Counted up to read the status again after a change.
  const [version, setVersion] = useState(0);
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
  }, [version]);

  const closeSetup = () => {
    setSettingUp(false);
    setLocked(false);
  };

  const turnedOn = () => {
    closeSetup();
    setVersion((n) => n + 1);
    success(t('mfaTurnedOn'));
    refresh();
  };

  const turnedOff = () => {
    setTurningOff(false);
    setFresh(null);
    setVersion((n) => n + 1);
    success(t('mfaTurnedOff'));
    refresh();
  };

  const makeNewCodes = async (code: string) => {
    const res = await mfaService.newRecoveryCodes(code);
    const codes = res.data.data.recoveryCodes;
    setFresh(codes);
    setStatus((current) => (current ? { ...current, recoveryCodesLeft: codes.length } : current));
    setAsking(false);
  };

  const since = status?.enabledAt ? dateFormat(locale, { dateStyle: 'medium' }).format(new Date(status.enabledAt)) : '';

  return (
    <>
      <Panel
        title={t('adMfaPanelTitle')}
        note={t('adMfaPanelNote')}
        actions={
          !status ? undefined : status.enabled ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setAsking(true)}><Icon name="refresh" size={13} />{t('adMfaNewCodes')}</button>
              {status.required ? null : (
                <button className="btn btn-secondary btn-sm btn-quiet-danger" onClick={() => setTurningOff(true)}><Icon name="deactivate" size={13} />{t('mfaTurnOff')}</button>
              )}
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setSettingUp(true)}><Icon name="lock" size={13} />{t('mfaTurnOn')}</button>
          )
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
                  {tn(status.recoveryCodesLeft, 'adMfaCodesLeftOne', 'adMfaCodesLeft')}
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

      <Modal open={settingUp} onClose={closeSetup} title={t('mfaTurnOnTitle')} dismissible={!locked}>
        {/* Drawn only while open, so nothing typed or shown outlives the dialog. */}
        {settingUp ? <TwoStepSetup onDone={turnedOn} onCancel={closeSetup} onLock={setLocked} /> : null}
      </Modal>

      <TurnOffTwoStepDialog open={turningOff} onClose={() => setTurningOff(false)} onDone={turnedOff} />
    </>
  );
}
