import { FormEvent, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { harvestService } from '../../services/harvest.service';
import { batchService } from '../../services/batch.service';
import { Batch, HarvestRecord, QualityGrade } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { colorFor } from '../../utils/chartColors';
import { fill } from '../../utils/fill';
import BarList from '../../components/ui/BarList';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

const GRADES: QualityGrade[] = ['A', 'B', 'C'];
const EMPTY_FORM = { cocoonWeightKg: '', silkYieldG: '', qualityGrade: 'A' as QualityGrade, notes: '' };

// Django sends decimal fields as strings, and a plain number reads better than "12.50".
const num = (value: unknown) => Number(value) || 0;
const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

export default function HarvestPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [records, setRecords] = useState<HarvestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<HarvestRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const code = (batchId ?? '').slice(-8).toUpperCase();

  useEffect(() => {
    if (!batchId) return;
    Promise.all([batchService.getById(batchId), harvestService.getByBatch(batchId)])
      .then(([batchRes, recordRes]) => {
        setBatch(batchRes.data.data);
        setRecords(recordRes.data.data);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [batchId]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!batchId) return;
    setSaving(true);
    try {
      const res = await harvestService.create(batchId, {
        cocoonWeightKg: parseFloat(form.cocoonWeightKg),
        silkYieldG: form.silkYieldG ? parseFloat(form.silkYieldG) : null,
        qualityGrade: form.qualityGrade,
        notes: form.notes || undefined,
      });
      setRecords((prev) => [res.data.data, ...prev]);
      setShowAdd(false);
      setForm(EMPTY_FORM);
      success(t('hpSaved'));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await harvestService.delete(toDelete.id);
      setRecords((prev) => prev.filter((r) => r.id !== toDelete.id));
      setToDelete(null);
      success(t('hpDeleted'));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const back = (
    <Link to={`/batches/${batchId}`} className="btn btn-ghost btn-sm">
      <Icon name="back" size={15} />
      {t('hpBack')}
    </Link>
  );

  if (loading) {
    return (
      <div>
        <PageHeader title={t('ptHarvest')} />
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }

  if (failed) {
    return (
      <div>
        <PageHeader title={t('ptHarvest')} actions={back} />
        <div className="alert alert-error" role="alert">{t('hpLoadError')}</div>
      </div>
    );
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dayLabel = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });

  const totalKg = records.reduce((sum, r) => sum + num(r.cocoonWeightKg), 0);
  const totalSilk = records.reduce((sum, r) => sum + num(r.silkYieldG), 0);

  const kgByDay = records.reduce<Record<string, number>>((acc, r) => {
    const day = r.harvestedAt.slice(0, 10);
    acc[day] = (acc[day] ?? 0) + num(r.cocoonWeightKg);
    return acc;
  }, {});
  const days = Object.entries(kgByDay).sort(([a], [b]) => a.localeCompare(b)).slice(-8);

  const openAdd = () => setShowAdd(true);

  return (
    <div>
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={t('hpLogTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" form="harvest-form" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" />{t('hpSaving')}</> : t('hpSave')}
            </button>
          </>
        }
      >
        <form id="harvest-form" onSubmit={add}>
          <div className="form-group">
            <label className="form-label" htmlFor="harvest-kg">{t('hpCocoon')} <span className="required" aria-hidden="true">*</span></label>
            <input id="harvest-kg" type="number" step="0.01" min="0.01" required className="form-input" value={form.cocoonWeightKg} onChange={(e) => setForm((f) => ({ ...f, cocoonWeightKg: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="harvest-silk">{t('hpSilk')} <span className="form-optional">({t('hpOptional')})</span></label>
            <input id="harvest-silk" type="number" step="0.01" min="0" className="form-input" value={form.silkYieldG} onChange={(e) => setForm((f) => ({ ...f, silkYieldG: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="harvest-grade">{t('hpGrade')} <span className="required" aria-hidden="true">*</span></label>
            <select id="harvest-grade" className="form-select" value={form.qualityGrade} onChange={(e) => setForm((f) => ({ ...f, qualityGrade: e.target.value as QualityGrade }))}>
              <option value="A">{t('hpGradeA')}</option>
              <option value="B">{t('hpGradeB')}</option>
              <option value="C">{t('hpGradeC')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="harvest-notes">{t('hpNotes')} <span className="form-optional">({t('hpOptional')})</span></label>
            <textarea id="harvest-notes" className="form-textarea" rows={3} maxLength={500} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={t('hpDeleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setToDelete(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={remove} disabled={deleting}>
              {deleting ? <><span className="spinner" />{t('hpDeleting')}</> : t('hpDeleteYes')}
            </button>
          </>
        }
      >
        {toDelete && (
          <p className="modal-text">
            {fill(t('hpDeleteBody'), { kg: trim(num(toDelete.cocoonWeightKg)), date: date.format(new Date(toDelete.harvestedAt)) })}
          </p>
        )}
      </Modal>

      <PageHeader
        title={t('ptHarvest')}
        subtitle={batch?.farm?.name ? fill(t('hpSubtitle'), { id: code, farm: batch.farm.name }) : fill(t('bdTitle'), { id: code })}
        actions={
          <>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={openAdd}>
                <Icon name="add" size={15} />
                {t('hpLog')}
              </button>
            )}
            {back}
          </>
        }
      />

      <div className="stack-24">
        <div className="grid-3">
          <StatTile label={t('hpTileRecords')} value={records.length} />
          <StatTile label={t('hpTileCocoon')} value={`${trim(totalKg)} kg`} />
          <StatTile label={t('hpTileSilk')} value={`${trim(totalSilk, 1)} g`} />
        </div>

        {records.length > 0 && (
          <div className="split">
            <Panel title={t('hpByDay')} note={t('hpByDayNote')}>
              <BarList
                label={t('hpByDay')}
                rows={days.map(([day, kg]) => ({ key: day, label: dayLabel.format(new Date(`${day}T00:00:00`)), value: kg, color: colorFor('grade', 'A') }))}
                format={(v) => `${trim(v)} kg`}
              />
            </Panel>
            <Panel title={t('hpGrades')} note={t('hpGradesNote')}>
              <BarList
                label={t('hpGrades')}
                rows={GRADES.map((g) => ({ key: g, label: fill(t('hpGradeName'), { g }), value: records.filter((r) => r.qualityGrade === g).length, color: colorFor('grade', g) }))}
              />
            </Panel>
          </div>
        )}

        <Panel title={t('hpRecords')} note={records.length > 0 ? fill(t('hpCount'), { n: records.length }) : undefined} flush>
          {records.length === 0 ? (
            <EmptyState
              icon={<Icon name="harvests" size={22} />}
              title={t('hpNone')}
              description={t('hpNoneBody')}
              action={canEdit ? { label: t('hpNoneAction'), onClick: openAdd } : undefined}
            />
          ) : (
            <div className="table-wrapper">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>{t('hpColDate')}</th>
                    <th>{t('hpColCocoon')}</th>
                    <th>{t('hpColSilk')}</th>
                    <th>{t('hpColGrade')}</th>
                    <th>{t('hpColNotes')}</th>
                    {canEdit && <th><span className="sr-only">{t('hpDelete')}</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const when = date.format(new Date(r.harvestedAt));
                    return (
                      <tr key={r.id} className="tbody-row">
                        <td className="cell-lead cell-muted cell-nowrap">{when}</td>
                        <td data-label={t('hpColCocoon')} className="cell-strong cell-nowrap">{trim(num(r.cocoonWeightKg))} kg</td>
                        <td data-label={t('hpColSilk')} className="cell-nowrap">{r.silkYieldG != null ? `${trim(num(r.silkYieldG), 1)} g` : '-'}</td>
                        <td data-label={t('hpColGrade')}>
                          <span className="badge badge-stage badge-dot" style={{ '--c': colorFor('grade', r.qualityGrade) } as CSSProperties}>
                            {fill(t('hpGradeName'), { g: r.qualityGrade })}
                          </span>
                        </td>
                        <td data-label={t('hpColNotes')} className="cell-muted">{r.notes ?? '-'}</td>
                        {canEdit && (
                          <td data-label="">
                            <button className="btn btn-ghost btn-xs btn-quiet-danger" aria-label={`${t('hpDelete')} ${when}`} onClick={() => setToDelete(r)}>
                              {t('hpDelete')}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
