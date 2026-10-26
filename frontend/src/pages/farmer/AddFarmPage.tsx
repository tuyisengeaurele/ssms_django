import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../../components/ui/Icon';
import NextSteps from '../../components/ui/NextSteps';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';

export default function AddFarmPage() {
  const [form, setForm] = useState({ name: '', location: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { success } = useToast();
  const { t } = useLanguage();

  const change = (field: 'name' | 'location') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await farmService.create(form);
      success(t('afCreated'));
      navigate(`/farms/${res.data.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('ptFarmNew')}
        subtitle={t('afSubtitle')}
        actions={
          <Link to="/farms" className="btn btn-secondary btn-sm">
            <Icon name="back" size={15} />
            {t('afBack')}
          </Link>
        }
      />

      <div className="form-page">
        <Panel title={t('afPanel')}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="farm-name">{t('afName')} <span className="required" aria-hidden="true">*</span></label>
              <input id="farm-name" className="form-input" value={form.name} onChange={change('name')} placeholder={t('afNamePlace')} required maxLength={150} aria-describedby="farm-name-hint" />
              <span id="farm-name-hint" className="form-hint">{t('afNameHint')}</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="farm-location">{t('afLocation')} <span className="required" aria-hidden="true">*</span></label>
              <input id="farm-location" className="form-input" value={form.location} onChange={change('location')} placeholder={t('afLocationPlace')} required maxLength={250} aria-describedby="farm-location-hint" />
              <span id="farm-location-hint" className="form-hint">{t('afLocationHint')}</span>
            </div>

            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" />{t('afCreating')}</> : t('afCreate')}
              </button>
              <Link to="/farms" className="btn btn-ghost">{t('btnCancel')}</Link>
            </div>
          </form>
        </Panel>

        <NextSteps
          label={t('afNextTitle')}
          steps={[
            { title: t('afStep1'), body: t('afStep1Body') },
            { title: t('afStep2'), body: t('afStep2Body') },
            { title: t('afStep3'), body: t('afStep3Body') },
            { title: t('afStep4'), body: t('afStep4Body') },
          ]}
        />
      </div>
    </div>
  );
}
