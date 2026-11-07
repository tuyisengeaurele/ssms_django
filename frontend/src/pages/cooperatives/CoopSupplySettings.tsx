import { useEffect, useState } from 'react';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { supplyService } from '../../services/supply.service';
import Panel from '../../components/ui/Panel';

const M2_NUMBER = /^\d+(\.\d{1,2})?$/;

/** What an admin chooses for a cooperative's egg supply. The space per box stays empty until a sericulture officer says. */
export default function CoopSupplySettings({ cooperativeId }: { cooperativeId: string }) {
  const { t } = useLanguage();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();

  const [loaded, setLoaded] = useState(false);
  const [starter, setStarter] = useState('');
  const [m2, setM2] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const show = (data: { starterBoxes: number; m2PerBox: number | null }) => {
    setStarter(String(data.starterBoxes));
    setM2(data.m2PerBox == null ? '' : String(data.m2PerBox));
  };

  useEffect(() => {
    let current = true;
    supplyService.getSettings(cooperativeId)
      .then((r) => {
        if (!current) return;
        show(r.data.data);
        setLoaded(true);
      })
      // Without the settings the rest of the page still works, so the section just stays out.
      .catch(() => {});
    return () => { current = false; };
  }, [cooperativeId]);

  if (!loaded) return null;

  const save = async () => {
    const boxes = starter.trim() === '' ? NaN : Number(starter);
    if (!Number.isInteger(boxes) || boxes < 0 || boxes > 100) return setError(t('alwNeedBoxes'));
    const typed = m2.trim();
    let space: number | null = null;
    if (typed !== '') {
      space = Number(typed);
      if (!M2_NUMBER.test(typed) || space <= 0 || space > 1000) return setError(t('alwNeedM2'));
    }
    setError('');
    setSaving(true);
    try {
      const res = await supplyService.updateSettings({ cooperativeId, starterBoxes: boxes, m2PerBox: space });
      show(res.data.data);
      success(t('alwSettingsSaved'));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={t('alwSettingsTitle')}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="supply-starter">{t('alwSettingStarter')}</label>
        <input id="supply-starter" type="number" inputMode="numeric" className="form-input" min={0} max={100} step={1} value={starter} onChange={(e) => setStarter(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="supply-m2">{t('alwSettingM2')}</label>
        <input id="supply-m2" type="number" inputMode="decimal" className="form-input" min={0} step="0.01" value={m2} aria-describedby="supply-m2-hint" onChange={(e) => setM2(e.target.value)} />
        <span id="supply-m2-hint" className="form-hint">{t('alwSettingM2Hint')}</span>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
        {saving ? <span className="spinner" aria-hidden="true" /> : null}
        {t('alwSettingsSave')}
      </button>
    </Panel>
  );
}
