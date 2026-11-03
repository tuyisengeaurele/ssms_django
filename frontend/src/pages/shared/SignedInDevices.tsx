import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { sessionsService } from '../../services/sessions.service';
import { SignedInDevice } from '../../types';
import { fill } from '../../utils/fill';
import Modal from '../../components/ui/Modal';
import Panel from '../../components/ui/Panel';

const nameOf = (device: SignedInDevice) => device.customName || device.deviceLabel;

/** The places the account is signed in: see them, name them, sign one out, or sign out all but this one. */
export default function SignedInDevices() {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();

  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<SignedInDevice | 'others' | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await sessionsService.list();
      setDevices(res.data.data);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const others = devices?.filter((d) => !d.isCurrent) ?? [];

  const startRename = (device: SignedInDevice) => {
    setEditing(device.id);
    setDraft(device.customName);
  };

  const saveRename = async (event: FormEvent, device: SignedInDevice) => {
    event.preventDefault();
    try {
      const res = await sessionsService.rename(device.id, draft);
      setDevices((list) => list?.map((d) => (d.id === device.id ? res.data.data : d)) ?? null);
      setEditing(null);
      success(t('sdRenamed'));
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') setEditing(null);
  };

  const signOut = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'others') {
        await sessionsService.revokeOthers();
        setDevices((list) => list?.filter((d) => d.isCurrent) ?? null);
        success(t('sdOthersDone'));
      } else {
        await sessionsService.revoke(confirm.id);
        setDevices((list) => list?.filter((d) => d.id !== confirm.id) ?? null);
        success(t('sdSignedOut'));
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const everyone = confirm === 'others';

  return (
    <Panel
      title={t('sdTitle')}
      note={t('sdHint')}
      actions={
        others.length > 0 ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm('others')}>{t('sdSignOutOthers')}</button>
        ) : undefined
      }
    >
      {failed ? (
        <div className="alert alert-error" role="alert">
          <p>{t('sdLoadError')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>{t('sdRetry')}</button>
        </div>
      ) : devices === null ? (
        <p className="form-hint" role="status">{t('sdLoading')}</p>
      ) : (
        <>
          <ul className="signin-list">
            {devices.map((device) => (
              <li key={device.id} className="signin-row">
                <div className="signin-main">
                  {editing === device.id ? (
                    <form className="signin-edit" onSubmit={(e) => saveRename(e, device)}>
                      <input
                        ref={field}
                        className="form-input"
                        aria-label={t('sdNameLabel')}
                        value={draft}
                        maxLength={40}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onRenameKey}
                      />
                      <button type="submit" className="btn btn-primary btn-sm">{t('sdSave')}</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>{t('btnCancel')}</button>
                    </form>
                  ) : (
                    <>
                      <p className="signin-name">
                        <strong>{nameOf(device)}</strong>
                        {device.isCurrent ? <span className="badge badge-green">{t('sdThisDevice')}</span> : null}
                      </p>
                      {device.customName ? <p className="signin-sub">{device.deviceLabel}</p> : null}
                      <p className="signin-sub">
                        {fill(t('sdLastUsed'), { when: when.format(new Date(device.lastUsedAt)) })}
                        {device.isInstalledApp ? ` · ${t('sdInstalledApp')}` : ''}
                      </p>
                    </>
                  )}
                </div>
                {editing === device.id ? null : (
                  <div className="signin-actions">
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`${t('sdRename')} ${nameOf(device)}`} onClick={() => startRename(device)}>
                      {t('sdRename')}
                    </button>
                    {device.isCurrent ? null : (
                      <button type="button" className="btn btn-secondary btn-sm" aria-label={`${t('sdSignOut')} ${nameOf(device)}`} onClick={() => setConfirm(device)}>
                        {t('sdSignOut')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {others.length === 0 ? <p className="form-hint">{t('sdNoOthers')}</p> : null}
        </>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={everyone ? t('sdConfirmOthersTitle') : t('sdConfirmTitle')}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>{t('btnCancel')}</button>
            <button type="button" className="btn btn-danger" onClick={signOut} disabled={busy}>
              {busy ? <><span className="spinner" />{t('sdBusy')}</> : everyone ? t('sdConfirmOthers') : t('sdSignOut')}
            </button>
          </>
        }
      >
        <p className="modal-text">
          {confirm === null ? '' : everyone ? t('sdConfirmOthersBody') : fill(t('sdConfirmBody'), { device: nameOf(confirm) })}
        </p>
      </Modal>
    </Panel>
  );
}
