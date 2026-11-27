import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import AnnouncementDialog from '../../components/announcements/AnnouncementDialog';
import { KIND_WORDS } from '../../components/announcements/kinds';
import ConfirmModal from '../../components/ui/ConfirmModal';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import LoadError from '../../components/ui/LoadError';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { announcementService } from '../../services/announcement.service';
import type { AdminAnnouncement, AnnouncementKind } from '../../types';
import { dateFormat } from '../../utils/dateFormat';

const KIND_BADGE: Record<AnnouncementKind, string> = {
  information: 'badge-blue', maintenance: 'badge-yellow', urgent: 'badge-red',
};

const STANDING: Record<AdminAnnouncement['status'], { word: string; badge: string }> = {
  scheduled: { word: 'annScheduled', badge: 'badge-purple' },
  showing: { word: 'annShowing', badge: 'badge-green' },
  ended: { word: 'annEnded', badge: 'badge-gray' },
};

/** The SSMS team's banners: what is waiting, what is up, and what has been said before. */
export default function AdminAnnouncementsPage() {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [rows, setRows] = useState<AdminAnnouncement[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [writing, setWriting] = useState<AdminAnnouncement | 'new' | null>(null);
  const [ending, setEnding] = useState<AdminAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => announcementService.all()
    .then((res) => { setRows(res.data.data); setStatus('ready'); })
    .catch(() => setStatus('failed')), []);

  useEffect(() => { load(); }, [load]);

  const when = dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kigali' });

  const saved = () => {
    setWriting(null);
    success(t('annSaved'));
    load();
  };

  const endedElsewhere = (message: string) => {
    setWriting(null);
    showError(message);
    load();
  };

  const endNow = async () => {
    if (!ending) return;
    setBusy(true);
    try {
      await announcementService.end(ending.id);
      success(t('annEndedToast'));
    } catch (err) {
      showError(getErrorMessage(err));
      // Anything but "already ended" leaves the question open, to be tried again.
      if (!(axios.isAxiosError(err) && err.response?.data?.code === 'announcement_ended')) {
        setBusy(false);
        return;
      }
    }
    setEnding(null);
    setBusy(false);
    await load();
  };

  return (
    <div>
      <PageHeader
        title={t('ptAnnouncements')}
        actions={(
          <button type="button" className="btn btn-primary" onClick={() => setWriting('new')}>
            <Icon name="add" size={16} />{t('annNew')}
          </button>
        )}
      />

      {status === 'loading' ? (
        <SkeletonTable rows={4} cols={6} />
      ) : status === 'failed' ? (
        <LoadError onRetry={() => { setStatus('loading'); load(); }} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Icon name="info" size={22} />} title={t('annNone')} />
      ) : (
        <Panel title={t('ptAnnouncements')} note={t('annKigali')} flush>
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('annColText')}</th>
                  <th>{t('annType')}</th>
                  <th>{t('annFrom')}</th>
                  <th>{t('annUntil')}</th>
                  <th>{t('annColWho')}</th>
                  <th>{t('annColStatus')}</th>
                  <th><span className="sr-only">{t('annColActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="tbody-row">
                    <td className="cell-lead cell-detail" id={`announcement-${row.id}`}>{row.text.en}</td>
                    <td data-label={t('annType')}><span className={`badge ${KIND_BADGE[row.kind]}`}>{t(KIND_WORDS[row.kind])}</span></td>
                    <td data-label={t('annFrom')} className="cell-muted">{when.format(new Date(row.showFrom))}</td>
                    {/* One ended by hand stopped then, not at the time it was written to run to. */}
                    <td data-label={t('annUntil')} className="cell-muted">{when.format(new Date(row.endedAt ?? row.showUntil))}</td>
                    <td data-label={t('annColWho')}>{t(row.showPublic ? 'annWhoAll' : 'annWhoIn')}</td>
                    <td data-label={t('annColStatus')}><span className={`badge ${STANDING[row.status].badge}`}>{t(STANDING[row.status].word)}</span></td>
                    <td data-label="">
                      {row.status !== 'ended' ? (
                        <div className="table-actions">
                          <button type="button" className="btn btn-secondary btn-sm" aria-describedby={`announcement-${row.id}`} onClick={() => setWriting(row)}>
                            <Icon name="edit" size={14} />{t('annEdit')}
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm btn-quiet-danger" aria-describedby={`announcement-${row.id}`} onClick={() => setEnding(row)}>
                            <Icon name="close" size={14} />{t('annEndNow')}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {writing ? (
        <AnnouncementDialog
          announcement={writing === 'new' ? null : writing}
          onSaved={saved}
          onEndedAlready={endedElsewhere}
          onClose={() => setWriting(null)}
        />
      ) : null}

      <ConfirmModal
        open={ending !== null}
        title={t('annEndAsk')}
        confirmLabel={t('annEndNow')}
        busy={busy}
        onConfirm={endNow}
        onClose={() => setEnding(null)}
      >
        {ending ? <p className="modal-text announcement-quote">{ending.text.en}</p> : null}
      </ConfirmModal>
    </div>
  );
}
