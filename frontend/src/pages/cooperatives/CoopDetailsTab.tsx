import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cooperativeService } from '../../services/cooperative.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import Modal from '../../components/ui/Modal';
import Panel from '../../components/ui/Panel';
import { useCoop } from './coopContext';
import CooperativeFormModal from './CooperativeFormModal';
import CoopSupplySettings from './CoopSupplySettings';
import { dateFormat } from '../../utils/dateFormat';

/** Where the cooperative is and what it is for, and the way for an admin to change it or delete it. */
export default function CoopDetailsTab() {
  const { detail, setDetail } = useCoop();
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!detail) return <p className="panel-loading"><span className="spinner" /></p>;

  const date = dateFormat(locale, { dateStyle: 'medium' });

  const remove = async () => {
    setDeleting(true);
    try {
      await cooperativeService.delete(detail.id);
      success(t('coDeleted'));
      navigate('/admin/cooperatives');
    } catch (e) {
      showError(getErrorMessage(e));
      setAsking(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="stack-24">
    <Panel
      title={t('cpAbout')}
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>{t('coEdit')}</button>
          <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setAsking(true)}>{t('coDelete')}</button>
        </>
      }
    >
      <dl className="facts">
        <div><dt>{t('coColLocation')}</dt><dd>{detail.location || '-'}</dd></div>
        <div><dt>{t('coColMembers')}</dt><dd>{detail.memberCount}</dd></div>
        <div><dt>{t('coColFarms')}</dt><dd>{detail.farmCount}</dd></div>
        <div><dt>{t('coColCreated')}</dt><dd>{date.format(new Date(detail.createdAt))}</dd></div>
      </dl>
      {detail.description ? <p className="coop-description">{detail.description}</p> : null}

      <CooperativeFormModal
        open={editing}
        editing={detail}
        onClose={() => setEditing(false)}
        onSaved={(saved) => setDetail({ ...detail, ...saved })}
      />

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title={t('coDeleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAsking(false)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={remove} disabled={deleting}>
              {deleting ? <><span className="spinner" />{t('coDeleteBusy')}</> : t('coDeleteConfirm')}
            </button>
          </>
        }
      >
        <p className="modal-text">{fill(t('coDeleteBody'), { name: detail.name })}</p>
      </Modal>
    </Panel>
    <CoopSupplySettings cooperativeId={detail.id} />
    </div>
  );
}
