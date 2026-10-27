import { useEffect, useState } from 'react';
import { teamService, TeamFarmer, TeamInvitation } from '../../services/team.service';
import { useApiError } from '../../hooks/useApiError';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonStatCard, SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

const STATUS_KEY = {
  pending: 'tmStPending',
  accepted: 'tmStAccepted',
  expired: 'tmStExpired',
  revoked: 'tmStRevoked',
} as const;

export default function SupervisorFarmersPage() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [farmers, setFarmers] = useState<TeamFarmer[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [toRemove, setToRemove] = useState<TeamFarmer | null>(null);
  const [removing, setRemoving] = useState(false);
  const [toRevoke, setToRevoke] = useState<TeamInvitation | null>(null);
  const [revoking, setRevoking] = useState(false);

  // The invite dialog: a form first, then the link, which is shown once.
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<TeamInvitation | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([teamService.getFarmers(), teamService.getInvitations()])
      .then(([farmersRes, invitationsRes]) => {
        setFarmers(farmersRes.data.data);
        setInvitations(invitationsRes.data.data);
      })
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const pending = invitations.filter((i) => i.status === 'pending').length;

  const openInvite = () => {
    setEmail('');
    setCreated(null);
    setInviteError('');
    setInviting(true);
  };

  const createInvite = async () => {
    setInviteError('');
    setCreating(true);
    try {
      const res = await teamService.createInvitation(email.trim() || undefined);
      const made = res.data.data;
      setCreated(made);
      // The list never holds the link itself.
      const { link: _link, ...row } = made;
      setInvitations((prev) => [row, ...prev]);
    } catch (e) {
      setInviteError(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!created?.link) return;
    try {
      await navigator.clipboard.writeText(created.link);
      success(t('tmCopied'));
    } catch {
      showError(t('tmCopyFailed'));
    }
  };

  const shareText = created?.link
    ? fill(t('tmShareText'), { inviter: user?.name ?? '', coop: user?.cooperativeName ?? '', link: created.link })
    : '';

  const removeFarmer = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await teamService.removeFarmer(toRemove.id);
      setFarmers((prev) => prev.filter((f) => f.id !== toRemove.id));
      success(fill(t('tmRemoved'), { name: toRemove.name }));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setRemoving(false);
      setToRemove(null);
    }
  };

  const revokeInvitation = async () => {
    if (!toRevoke) return;
    setRevoking(true);
    try {
      await teamService.revokeInvitation(toRevoke.id);
      setInvitations((prev) => prev.map((i) => (i.id === toRevoke.id ? { ...i, status: 'revoked' } : i)));
      success(t('tmRevoked'));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setRevoking(false);
      setToRevoke(null);
    }
  };

  return (
    <div>
      <Modal
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        title={toRemove ? fill(t('tmRemoveTitle'), { name: toRemove.name }) : ''}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setToRemove(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={removeFarmer} disabled={removing}>{t('tmRemoveYes')}</button>
          </>
        }
      >
        <p className="modal-text">{toRemove ? fill(t('tmRemoveBody'), { name: toRemove.name }) : ''}</p>
      </Modal>

      <Modal
        open={!!toRevoke}
        onClose={() => setToRevoke(null)}
        title={t('tmRevokeTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setToRevoke(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={revokeInvitation} disabled={revoking}>{t('tmRevokeYes')}</button>
          </>
        }
      >
        <p className="modal-text">{t('tmRevokeBody')}</p>
      </Modal>

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title={t('tmInviteTitle')}
        footer={
          created ? (
            <button className="btn btn-primary" onClick={() => setInviting(false)}>{t('tmInviteDone')}</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setInviting(false)}>{t('btnCancel')}</button>
              <button className="btn btn-primary" onClick={createInvite} disabled={creating}>
                {creating ? <span className="spinner" aria-hidden="true" /> : null}
                {t('tmInviteCreate')}
              </button>
            </>
          )
        }
      >
        {inviteError && <div className="alert alert-error" role="alert">{inviteError}</div>}
        {created ? (
          <>
            <p className="modal-text">{t('tmInviteReady')}</p>
            <div className="form-group">
              <label className="form-label" htmlFor="invite-link">{t('tmInviteLink')}</label>
              <input id="invite-link" className="form-input" readOnly value={created.link ?? ''} onFocus={(e) => e.currentTarget.select()} />
            </div>
            <div className="invite-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>{t('tmInviteCopy')}</button>
              <a
                className="btn btn-secondary btn-sm"
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('tmInviteWhatsapp')}
              </a>
            </div>
          </>
        ) : (
          <div className="form-group">
            <label className="form-label" htmlFor="invite-email">{t('tmInviteEmail')} <span className="form-optional">({t('abNotesOptional')})</span></label>
            <input id="invite-email" type="email" className="form-input" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} aria-describedby="invite-email-hint" />
            <span id="invite-email-hint" className="form-hint">{t('tmInviteEmailHint')}</span>
          </div>
        )}
      </Modal>

      <PageHeader
        title={t('ptTeam')}
        subtitle={t('tmSubtitle')}
        actions={
          <button className="btn btn-primary btn-sm" onClick={openInvite}>
            <Icon name="add" size={15} />
            {t('tmInvite')}
          </button>
        }
      />

      <div className="grid-3" style={{ marginBottom: 24 }}>
        {loading ? (
          [0, 1].map((i) => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <StatTile label={t('tmStatFarmers')} value={farmers.length} icon="users" />
            <StatTile label={t('tmStatPending')} value={pending} icon="messages" />
          </>
        )}
      </div>

      <div className="stack-24">
        <Panel title={`${t('tmFarmersTitle')} (${farmers.length})`} flush>
          {loading ? (
            <SkeletonTable rows={4} cols={4} />
          ) : farmers.length === 0 ? (
            <EmptyState
              icon={<Icon name="users" size={22} />}
              title={t('tmNoFarmers')}
              description={t('tmNoFarmersBody')}
              action={{ label: t('tmInvite'), onClick: openInvite }}
            />
          ) : (
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('tmColName')}</th>
                    <th>{t('tmColFarms')}</th>
                    <th>{t('tmColJoined')}</th>
                    <th><span className="sr-only">{t('thActions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {farmers.map((f) => (
                    <tr key={f.id} className="tbody-row">
                      <td className="cell-lead">
                        <div className="cell-person">
                          <Avatar name={f.name} />
                          <div className="cell-stack">
                            <span className="cell-strong">{f.name}</span>
                            <span className="cell-sub">{f.email}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label={t('tmColFarms')}>{f.farmCount}</td>
                      <td data-label={t('tmColJoined')} className="cell-muted cell-nowrap">{date.format(new Date(f.joinedAt))}</td>
                      <td data-label="">
                        <div className="table-actions">
                          <button
                            className="btn btn-ghost btn-xs btn-quiet-danger"
                            aria-label={fill(t('tmRemoveFor'), { name: f.name })}
                            onClick={() => setToRemove(f)}
                          >
                            {t('tmRemove')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t('tmInvitations')} flush>
          {loading ? (
            <SkeletonTable rows={3} cols={4} />
          ) : invitations.length === 0 ? (
            <EmptyState icon={<Icon name="messages" size={22} />} title={t('tmNoInvites')} description={t('tmNoInvitesBody')} />
          ) : (
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('tmColInvite')}</th>
                    <th>{t('tmColStatus')}</th>
                    <th>{t('tmColSent')}</th>
                    <th>{t('tmColExpires')}</th>
                    <th><span className="sr-only">{t('thActions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((i) => (
                    <tr key={i.id} className="tbody-row">
                      <td className="cell-lead">
                        <div className="cell-stack">
                          <span className="cell-strong">{i.email || t('tmLinkOnly')}</span>
                          {i.acceptedByName && <span className="cell-sub">{i.acceptedByName}</span>}
                        </div>
                      </td>
                      <td data-label={t('tmColStatus')}>
                        <span className={`badge ${i.status === 'pending' ? 'badge-green' : 'badge-gray'}`}>{t(STATUS_KEY[i.status])}</span>
                      </td>
                      <td data-label={t('tmColSent')} className="cell-muted cell-nowrap">{date.format(new Date(i.createdAt))}</td>
                      <td data-label={t('tmColExpires')} className="cell-muted cell-nowrap">{date.format(new Date(i.expiresAt))}</td>
                      <td data-label="">
                        <div className="table-actions">
                          {i.status === 'pending' && (
                            <button
                              className="btn btn-ghost btn-xs btn-quiet-danger"
                              aria-label={`${t('tmRevoke')} ${i.email || t('tmLinkOnly')}`}
                              onClick={() => setToRevoke(i)}
                            >
                              {t('tmRevoke')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
