import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { accountService, EmailChangePending } from '../../services/account.service';
import { authService } from '../../services/auth.service';
import { CooperativeRequest, cooperativeRequestService } from '../../services/cooperativeRequest.service';
import { farmService } from '../../services/farm.service';
import CloseAccountDialog from '../../components/ui/CloseAccountDialog';
import DownloadDataButton from '../../components/ui/DownloadDataButton';
import ConfirmPhoneChangeDialog from '../../components/ui/ConfirmPhoneChangeDialog';
import CooperativeRequestModal from '../../components/ui/CooperativeRequestModal';
import EmailChangeDialog from '../../components/ui/EmailChangeDialog';
import PhoneLink from '../../components/ui/PhoneLink';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';
import Avatar from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import ProfilePhotoDialog from '../../components/ui/ProfilePhotoDialog';
import Panel from '../../components/ui/Panel';
import { dateFormat } from '../../utils/dateFormat';
import { fill } from '../../utils/fill';
import { formatRwandaMobile, phoneFieldError } from '../../utils/phone';

const SEEN_KEY = 'ssms:coop-request-seen';

/** Which answer the person already read and put away. A convenience of this browser only, so a failure of storage is no failure. */
function readSeen(): string {
  try { return localStorage.getItem(SEEN_KEY) ?? ''; } catch { return ''; }
}
function writeSeen(id: string) {
  try { localStorage.setItem(SEEN_KEY, id); } catch { /* the answer shows again next time, which is harmless */ }
}

/** Who the person is, and the two things they can change about it: their name and their phone number. */
export default function AccountSettings() {
  const { user, refreshUser, updateUser } = useAuth();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, locale } = useLanguage();

  const savedPhone = formatRwandaMobile(user?.phone);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(savedPhone);
  // The server's refusal of the number, shown beside the field until the person types again.
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  // A change of login email that waits for its link to be opened. The new address is masked by the server.
  const [pendingEmail, setPendingEmail] = useState<EmailChangePending | null>(null);
  // Only a farmer or a supervisor belongs to a cooperative, so only they can ask to change it.
  const canAskCooperative = user?.role === 'FARMER' || user?.role === 'SUPERVISOR';
  const [coopRequest, setCoopRequest] = useState<CooperativeRequest | null>(null);
  const [askingCooperative, setAskingCooperative] = useState(false);
  const [seenRequest, setSeenRequest] = useState(readSeen);
  // Only a farmer closes their own account here. The SSMS team does it for a supervisor or an admin.
  const isFarmer = user?.role === 'FARMER';
  const [closing, setClosing] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  // How many batches are still running, so the dialog can say they stay as history. Nothing is said when it is not known.
  const [runningBatches, setRunningBatches] = useState(0);

  // Fetch the latest details, so the cooperative and name are never stale.
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  useEffect(() => {
    let live = true;
    accountService.getEmailChange()
      .then((res) => { if (live) setPendingEmail(res.data.data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!canAskCooperative) return;
    let live = true;
    cooperativeRequestService.mine()
      .then((res) => { if (live) setCoopRequest(res.data.data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [canAskCooperative]);

  useEffect(() => {
    if (!isFarmer) return;
    let live = true;
    farmService.getAll()
      .then((res) => { if (live) setRunningBatches(res.data.data.reduce((sum, farm) => sum + (farm.counts?.batches ?? 0), 0)); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [isFarmer]);

  const withdrawCooperativeRequest = async () => {
    try {
      await cooperativeRequestService.withdraw();
      setCoopRequest(null);
      success(t('cqWithdrawn'));
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const putAwayAnswer = (id: string) => {
    writeSeen(id);
    setSeenRequest(id);
  };

  const cancelEmailChange = async () => {
    try {
      await accountService.cancelEmailChange();
      setPendingEmail(null);
      success(t('ecCancelled'));
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    setPhone(formatRwandaMobile(user?.phone));
  }, [user?.phone]);

  // An account that has a number cannot type over it: changing it goes through the dialog that asks for the number to be typed.
  const hasPhone = !!user?.phone;
  const nameChanged = name !== user?.name;
  const phoneChanged = !hasPhone && phone.trim() !== '';

  const day = (iso: string) => dateFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
  // An answer stays until the person has read it and put it away.
  const answered = coopRequest && (coopRequest.status === 'approved' || coopRequest.status === 'declined') && coopRequest.id !== seenRequest ? coopRequest : null;
  const answerText = (r: CooperativeRequest) => {
    const date = day(r.decidedAt ?? r.createdAt);
    if (r.status === 'declined') return fill(t('cqDecidedNo'), { date });
    return r.to ? fill(t('cqDecidedYes'), { name: r.to.name, date }) : fill(t('cqDecidedLeft'), { date });
  };

  const joined = user?.createdAt
    ? dateFormat(locale, { dateStyle: 'medium' }).format(new Date(user.createdAt))
    : '-';

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setPhoneError('');
    try {
      // Only what changed is sent, so saving a new number never touches the name, and the other way round.
      const body: { name?: string; phone?: string } = {};
      if (nameChanged) body.name = name;
      if (phoneChanged) body.phone = phone.trim();
      const res = await authService.updateProfile(body);
      updateUser(res.data.data);
      success(t('pfSaved'));
    } catch (err) {
      const aboutThePhone = phoneFieldError(err, t);
      if (aboutThePhone) setPhoneError(aboutThePhone);
      else showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-stack">
      <section className="panel identity" aria-label={t('pfAbout')}>
        <Avatar name={user?.name ?? ''} photoUrl={user?.photoUrl} className="identity-avatar" />
        <h2 className="identity-name">{user?.name}</h2>
        <p className="identity-email">{user?.email}</p>
        {user && <span className="badge badge-ink">{t(ROLE_LABEL_KEY[user.role])}</span>}
        {user && <button type="button" className="btn btn-secondary btn-sm identity-photo-btn" onClick={() => setEditingPhoto(true)}><Icon name="camera" size={15} />{user.photoUrl ? t('ppChange') : t('ppAdd')}</button>}

        <dl className="identity-facts">
          <div><dt>{t('pfSince')}</dt><dd>{joined}</dd></div>
          <div><dt>{t('pfAccountId')}</dt><dd className="cell-mono">{user?.id?.slice(-8).toUpperCase() ?? '-'}</dd></div>
          <div>
            <dt>{t('pfCooperative')}</dt>
            <dd>
              {user?.cooperativeName ?? t('pfNotAssigned')}
            </dd>
          </div>
          {user?.supervisor ? (
            <div><dt>{t('pfSupervisor')}</dt><dd><span className="cell-stack"><span>{user.supervisor.name}</span><PhoneLink phone={user.supervisor.phone} name={user.supervisor.name} /></span></dd></div>
          ) : null}
        </dl>
      </section>

      <Panel title={t('pfAccount')}>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label" htmlFor="pf-name">{t('pfFieldName')}</label>
            <input id="pf-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pf-email">{t('pfFieldEmail')}</label>
            <div className="form-inline">
              <input id="pf-email" className="form-input is-fixed" type="email" value={user?.email ?? ''} readOnly />
              <button type="button" className="btn btn-secondary btn-sm" aria-label={t('ecChangeAria')} onClick={() => setChangingEmail(true)}>{t('cpChange')}</button>
            </div>
            {pendingEmail ? (
              <div className="form-hint">
                <span>{fill(t('ecPending'), { email: pendingEmail.newEmail })}</span>{' '}
                <button type="button" className="btn btn-secondary btn-xs" onClick={cancelEmailChange}>{t('ecCancel')}</button>
              </div>
            ) : null}
          </div>

          {hasPhone ? (
            <div className="form-group" role="group" aria-labelledby="pf-phone-label" aria-describedby="pf-phone-note">
              <span id="pf-phone-label" className="form-label">{t('pnLabel')}</span>
              <div className="form-inline">
                <span className="form-static">{savedPhone}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChanging(true)}>{t('cpChange')}</button>
              </div>
              <span id="pf-phone-note" className="form-hint">{t('pnHint')}</span>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label" htmlFor="pf-phone">{t('pnLabel')}</label>
              <input
                id="pf-phone"
                className="form-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={40}
                placeholder="0788123456"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? 'pf-phone-error pf-phone-note' : 'pf-phone-note'}
              />
              {phoneError ? <span id="pf-phone-error" className="form-error" role="alert">{phoneError}</span> : null}
              <span id="pf-phone-note" className="form-hint">{t('pnHint')}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={saving || !(nameChanged || phoneChanged)}>
            {saving ? <><span className="spinner" />{t('pfSaving')}</> : t('pfSave')}
          </button>
        </form>
      </Panel>

      <section className="panel" aria-labelledby="pf-data-title">
        <header className="panel-head">
          <div><h2 id="pf-data-title" className="panel-title">{t('ddSection')}</h2></div>
        </header>
        <div className="panel-body">
          <p className="form-hint form-hint--gap">{t('ddBody')}</p>
          <DownloadDataButton />
        </div>
      </section>

      {canAskCooperative ? (
        <section className="panel" aria-labelledby="pf-coop-title">
          <header className="panel-head">
            <div><h2 id="pf-coop-title" className="panel-title">{t('cqSection')}</h2></div>
          </header>
          <div className="panel-body">
            {coopRequest?.status === 'requested' ? (
              <>
                <p className="form-hint form-hint--gap">
                  {coopRequest.to
                    ? fill(t('cqWaiting'), { date: day(coopRequest.createdAt), name: coopRequest.to.name })
                    : fill(t('cqWaitingLeave'), { date: day(coopRequest.createdAt) })}
                </p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={withdrawCooperativeRequest}>{t('cqWithdraw')}</button>
              </>
            ) : (
              <>
                {answered ? (
                  <p className="form-hint form-hint--gap">
                    <span>{answerText(answered)}</span>
                    {answered.decisionNote ? <span> {fill(t('cqNote'), { note: answered.decisionNote })}</span> : null}
                  </p>
                ) : null}
                <div className="section-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAskingCooperative(true)}>
                    <Icon name="cooperatives" size={15} />{t('cqRequest')}
                  </button>
                  {answered ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => putAwayAnswer(answered.id)}>{t('cqGotIt')}</button> : null}
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="pf-close-title">
        <header className="panel-head">
          <div><h2 id="pf-close-title" className="panel-title">{t('caSection')}</h2></div>
        </header>
        <div className="panel-body">
          {isFarmer ? (
            <>
              <p className="form-hint form-hint--gap">{t('caSectionBody')}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClosing(true)}>{t('caOpen')}</button>
            </>
          ) : (
            <>
              <p className="form-hint form-hint--gap">{t('caStaff')}</p>
              <a className="btn btn-secondary btn-sm" href="/#contact"><Icon name="messages" size={15} />{t('caStaffLink')}</a>
            </>
          )}
        </div>
      </section>

      {user ? (
        <ProfilePhotoDialog
          open={editingPhoto}
          name={user.name}
          photoUrl={user.photoUrl}
          onClose={() => setEditingPhoto(false)}
          onChanged={(changed) => { updateUser(changed); success(t(changed.photoUrl ? 'ppSaved' : 'ppRemoved')); setEditingPhoto(false); }}
        />
      ) : null}

      {user && isFarmer ? (
        <CloseAccountDialog
          open={closing}
          email={user.email}
          openBatches={runningBatches}
          onClose={() => setClosing(false)}
          onClosed={(deletionDate) => { setClosing(false); updateUser({ ...user, deletionDate }); }}
        />
      ) : null}

      {user ? (
        <EmailChangeDialog
          open={changingEmail}
          currentEmail={user.email}
          onClose={() => setChangingEmail(false)}
          onStarted={(change) => { setPendingEmail(change); success(fill(t('ecSent'), { email: change.newEmail })); setChangingEmail(false); }}
        />
      ) : null}

      {canAskCooperative ? (
        <CooperativeRequestModal
          open={askingCooperative}
          currentCooperativeId={user?.cooperativeId ?? null}
          onClose={() => setAskingCooperative(false)}
          onSent={(request) => { setCoopRequest(request); success(t('cqSent')); setAskingCooperative(false); }}
        />
      ) : null}

      {user?.phone ? (
        <ConfirmPhoneChangeDialog
          open={changing}
          currentPhone={user.phone}
          onClose={() => setChanging(false)}
          onSaved={(saved) => { updateUser(saved); success(t('cpSaved')); setChanging(false); }}
        />
      ) : null}
    </div>
  );
}
