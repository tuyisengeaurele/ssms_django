import { useEffect, useState } from 'react';
import { alertService } from '../../services/alert.service';
import type { StageRange } from '../../services/sensor.service';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { STAGE_LABELS } from '../../utils/constants';
import { fill } from '../../utils/fill';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

/** What a stage needs when nobody has chosen otherwise. It is also what the server starts with. */
const USUAL = { tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 };

type Draft = Record<keyof typeof USUAL, string>;
type ErrorKey = 'thNeedNumber' | 'thTempRange' | 'thHumRange' | 'thTempOrder' | 'thHumOrder';

const toDraft = (r: StageRange): Draft => ({ tempMin: String(r.tempMin), tempMax: String(r.tempMax), humMin: String(r.humMin), humMax: String(r.humMax) });
const toNumbers = (d: Draft) => ({ tempMin: Number(d.tempMin), tempMax: Number(d.tempMax), humMin: Number(d.humMin), humMax: Number(d.humMax) });

/** What is wrong with these four boxes, as the key of a kind sentence, or null when they can be saved. */
function problemWith(d: Draft): ErrorKey | null {
  if (Object.values(d).some((v) => v.trim() === '' || Number.isNaN(Number(v)))) return 'thNeedNumber';
  const n = toNumbers(d);
  if ([n.tempMin, n.tempMax].some((v) => v < 0 || v > 50)) return 'thTempRange';
  if ([n.humMin, n.humMax].some((v) => v < 0 || v > 100)) return 'thHumRange';
  if (n.tempMin >= n.tempMax) return 'thTempOrder';
  if (n.humMin >= n.humMax) return 'thHumOrder';
  return null;
}

const sameAsSaved = (d: Draft, r: StageRange) => {
  const n = toNumbers(d);
  return n.tempMin === r.tempMin && n.tempMax === r.tempMax && n.humMin === r.humMin && n.humMax === r.humMax;
};

/** The safe temperature and humidity of each stage. An alert is raised when a reading falls outside its stage's range. */
export default function AdminThresholdsPage() {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();

  const [rows, setRows] = useState<StageRange[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    alertService.getThresholds()
      .then((res) => {
        if (!live) return;
        setRows(res.data.data);
        setDrafts(Object.fromEntries(res.data.data.map((r) => [r.stage, toDraft(r)])));
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [attempt]);

  const edit = (stage: string, patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));

  const save = async (row: StageRange) => {
    const draft = drafts[row.stage];
    if (problemWith(draft) || saving) return;
    setSaving(row.stage);
    try {
      const res = await alertService.updateThreshold(row.stage, toNumbers(draft));
      const saved = res.data.data;
      setRows((prev) => prev.map((r) => (r.stage === row.stage ? saved : r)));
      setDrafts((prev) => ({ ...prev, [row.stage]: toDraft(saved) }));
      success(t('thSaved'));
    } catch {
      showError(t('thSaveError'));
    } finally {
      setSaving(null);
    }
  };

  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div>
      <PageHeader title={t('ptThresholds')} subtitle={t('thIntro')} />

      <Panel title={t('ptThresholds')} note={t('thNote')} flush>
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : failed ? (
          <div className="panel-body">
            <div className="alert alert-error" role="alert">
              <span>{t('thLoadError')}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>{t('thRetry')}</button>
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('thStage')}</th>
                  <th>{t('thTemp')}</th>
                  <th>{t('thHum')}</th>
                  <th>{t('thLast')}</th>
                  <th><span className="sr-only">{t('thActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = drafts[row.stage];
                  if (!draft) return null;
                  const stageName = STAGE_LABELS[row.stage] ?? row.stage;
                  const problem = problemWith(draft);
                  const unchanged = !problem && sameAsSaved(draft, row);
                  const isUsual = toDraft({ ...row, ...USUAL }) && JSON.stringify(draft) === JSON.stringify(toDraft({ ...row, ...USUAL }));
                  const box = (key: keyof Draft, label: string) => (
                    <input
                      type="number" inputMode="decimal" step="0.5" className="form-input form-input--number"
                      aria-label={`${stageName}, ${t(label)}`} aria-invalid={problem ? true : undefined}
                      value={draft[key]} onChange={(e) => edit(row.stage, { [key]: e.target.value })}
                    />
                  );
                  return (
                    <tr key={row.stage} className="tbody-row">
                      <td className="cell-lead cell-strong">{stageName}</td>
                      <td data-label={t('thTemp')}><span className="range-pair">{box('tempMin', 'thTempMin')}<span aria-hidden="true">to</span>{box('tempMax', 'thTempMax')}</span></td>
                      <td data-label={t('thHum')}><span className="range-pair">{box('humMin', 'thHumMin')}<span aria-hidden="true">to</span>{box('humMax', 'thHumMax')}</span></td>
                      <td data-label={t('thLast')} className="cell-muted">
                        {row.updatedBy && row.updatedAt
                          ? fill(t('thBy'), { name: row.updatedBy.name, when: when.format(new Date(row.updatedAt)) })
                          : t('thNever')}
                      </td>
                      <td data-label="">
                        {problem && <p className="form-hint is-problem">{t(problem)}</p>}
                        <div className="table-actions">
                          <button
                            type="button" className="btn btn-primary btn-xs" aria-label={fill(t('thSaveFor'), { stage: stageName })}
                            onClick={() => save(row)} disabled={!!problem || unchanged || saving !== null}
                          >
                            {t('thSave')}
                          </button>
                          <button
                            type="button" className="btn btn-ghost btn-xs" aria-label={fill(t('thUsualFor'), { stage: stageName })}
                            onClick={() => edit(row.stage, toDraft({ ...row, ...USUAL }))} disabled={isUsual}
                          >
                            {t('thUsual')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
