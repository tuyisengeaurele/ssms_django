import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { roomService } from '../../services/room.service';
import type { Room } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';

export default function AddBatchPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { success } = useToast();
  const { t } = useLanguage();

  const [form, setForm] = useState({ expectedHarvestDate: '', notes: '', breed: '', quantity: '', unit: 'BOXES' });
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!farmId) return;
    roomService.getByFarm(farmId)
      .then((r) => {
        setRooms(r.data.data);
        // With one room there is nothing to decide. With several the farmer chooses.
        if (r.data.data.length === 1) setRoomId(r.data.data[0].id);
      })
      .catch(() => setRooms([]));
  }, [farmId]);

  const change = (field: 'expectedHarvestDate' | 'notes' | 'breed' | 'quantity' | 'unit') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!farmId) return;
    setError('');
    setLoading(true);
    try {
      const quantity = form.quantity === '' ? undefined : Number(form.quantity);
      const res = await batchService.create({
        farmId,
        roomId: roomId || undefined,
        expectedHarvestDate: form.expectedHarvestDate,
        notes: form.notes || undefined,
        breed: form.breed.trim() || undefined,
        quantity,
        // The unit only means something next to a quantity.
        quantityUnit: quantity === undefined ? undefined : (form.unit as 'BOXES' | 'WORMS'),
      });
      success(t(res.data.data?.milestone === 'FIRST_BATCH' ? 'msFirstBatch' : 'abCreated'));
      navigate(`/farms/${farmId}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // A batch needs about a week at the least, so earlier dates are not offered.
  const earliest = new Date();
  earliest.setDate(earliest.getDate() + 7);

  return (
    <div className="page-narrow">
      <PageHeader
        title={t('ptBatchNew')}
        subtitle={t('abSubtitle')}
        actions={
          <Link to={`/farms/${farmId}`} className="btn btn-secondary btn-sm">
            <Icon name="back" size={15} />
            {t('abBack')}
          </Link>
        }
      />

      <Panel title={t('abPanel')}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="batch-harvest">{t('abHarvest')} <span className="required" aria-hidden="true">*</span></label>
              <input id="batch-harvest" type="date" className="form-input" value={form.expectedHarvestDate} onChange={change('expectedHarvestDate')} min={earliest.toISOString().split('T')[0]} required aria-describedby="batch-harvest-hint" />
              <span id="batch-harvest-hint" className="form-hint">{t('abHarvestHint')}</span>
            </div>

            {rooms && rooms.length === 0 && <p className="form-hint form-hint--gap">{t('abRoomMake')}</p>}
            {rooms && rooms.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="batch-room">{t('abRoom')}</label>
                <select id="batch-room" className="form-select" value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
                  {rooms.length > 1 && <option value="">{t('abRoomChoose')}</option>}
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="batch-breed">{t('abBreed')} <span className="form-optional">({t('abNotesOptional')})</span></label>
              <input id="batch-breed" className="form-input" maxLength={100} value={form.breed} onChange={change('breed')} placeholder={t('abBreedPlace')} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="batch-quantity">{t('abQuantity')} <span className="form-optional">({t('abNotesOptional')})</span></label>
                <input id="batch-quantity" type="number" inputMode="numeric" min={1} step={1} className="form-input" value={form.quantity} onChange={change('quantity')} aria-describedby="batch-quantity-hint" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="batch-unit">{t('abUnit')}</label>
                <select id="batch-unit" className="form-select" value={form.unit} onChange={change('unit')}>
                  <option value="BOXES">{t('abUnitBoxes')}</option>
                  <option value="WORMS">{t('abUnitWorms')}</option>
                </select>
              </div>
            </div>
            <span id="batch-quantity-hint" className="form-hint form-hint--gap">{t('abQuantityHint')}</span>

            <div className="form-group">
              <label className="form-label" htmlFor="batch-notes">{t('abNotes')} <span className="form-optional">({t('abNotesOptional')})</span></label>
              <textarea id="batch-notes" className="form-textarea" rows={3} maxLength={500} value={form.notes} onChange={change('notes')} placeholder={t('abNotesPlace')} />
            </div>

            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" />{t('abCreating')}</> : t('abCreate')}
              </button>
              <Link to={`/farms/${farmId}`} className="btn btn-ghost">{t('btnCancel')}</Link>
            </div>
          </form>
      </Panel>
    </div>
  );
}
