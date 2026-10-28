import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Place, locationService } from '../../services/location.service';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { Icon } from './Icon';

export interface PlaceValue {
  provinceCode: string;
  districtCode: string;
  sectorCode: string;
  cellCode: string;
  villageCode: string;
  street: string;
  /**
   * The exact spot the farm stands on, saved from "Use my location". Left out until there is one. A number or null once
   * there is: null means "remove it", which is how an edit tells the server to forget it.
   */
  latitude?: number | null;
  longitude?: number | null;
}

export const EMPTY_PLACE: PlaceValue = { provinceCode: '', districtCode: '', sectorCode: '', cellCode: '', villageCode: '', street: '' };

const LEVELS = [
  { key: 'provinceCode', label: 'lcProvince', pick: 'lcPickProvince' },
  { key: 'districtCode', label: 'lcDistrict', pick: 'lcPickDistrict' },
  { key: 'sectorCode', label: 'lcSector', pick: 'lcPickSector' },
  { key: 'cellCode', label: 'lcCell', pick: 'lcPickCell' },
  { key: 'villageCode', label: 'lcVillage', pick: 'lcPickVillage' },
] as const;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** True when all five choices are made, which is what the server asks for. */
export const placeIsComplete = (v: PlaceValue) => LEVELS.every((l) => v[l.key] !== '');

/** The places under `parent` ('' for the provinces, null while the level above has no choice yet). */
function usePlaces(parent: string | null, attempt: number) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaces([]);
    setFailed(false);
    if (parent === null) return;
    let current = true;
    locationService.getPlaces(parent || undefined)
      .then((r) => { if (current) setPlaces(r.data.data); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [parent, attempt]);

  return { places, failed };
}

interface Props {
  value: PlaceValue;
  onChange: (next: PlaceValue) => void;
  /** The text of a farm from before places could be chosen. Shown until a place is chosen to replace it. */
  legacyText?: string;
  idPrefix?: string;
}

type Notice = { kind: 'working' | 'ok' | 'problem'; text: string } | null;

/** Province to village as linked lists, an optional street, and "Use my location" for the part a map can tell. */
export default function LocationPicker({ value, onChange, legacyText, idPrefix = 'place' }: Props) {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);

  const province = usePlaces('', attempt);
  const district = usePlaces(value.provinceCode || null, attempt);
  const sector = usePlaces(value.districtCode || null, attempt);
  const cell = usePlaces(value.sectorCode || null, attempt);
  const village = usePlaces(value.cellCode || null, attempt);
  const lists = [province, district, sector, cell, village];
  const failed = lists.some((l) => l.failed);

  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const working = notice?.kind === 'working';
  const hasPlace = LEVELS.some((l) => value[l.key] !== '');
  // A farm from before places can keep its old text. Choosing any part means choosing all five.
  const relaxed = !!legacyText && !hasPlace;

  const hasPosition = value.latitude != null && value.longitude != null;
  // A position held on this form is cleared, and said to be cleared, when the place it belonged to changes.
  const withoutPosition = value.latitude !== undefined ? { latitude: null, longitude: null } : {};

  const choose = (index: number, code: string) => {
    const next = { ...value, ...withoutPosition, [LEVELS[index].key]: code };
    // A new choice makes the ones below it meaningless, so they are emptied.
    for (const lower of LEVELS.slice(index + 1)) next[lower.key] = '';
    onChange(next);
  };

  const useMyLocation = () => {
    setNotice({ kind: 'working', text: t('lcLocating') });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationService.locate(position.coords.latitude, position.coords.longitude)
          .then((r) => {
            const { province: p, district: d, sector: s, cell: c, village: v } = r.data.data;
            // The spot is kept to about a metre. The places come from the same point, so they always agree with it.
            const spot = { latitude: round5(position.coords.latitude), longitude: round5(position.coords.longitude) };
            onChange({ ...value, provinceCode: p.code, districtCode: d.code, sectorCode: s.code, cellCode: c?.code ?? '', villageCode: v?.code ?? '', ...spot });
            setNotice({ kind: 'ok', text: t(v ? 'lcFoundVillage' : c ? 'lcFoundCell' : 'lcFound') });
          })
          .catch((e) => {
            const outside = e instanceof AxiosError && e.response?.status === 404;
            setNotice({ kind: 'problem', text: outside ? t('lcOutside') : t('lcUnavailable') });
          });
      },
      (error) => setNotice({ kind: 'problem', text: error.code === 1 ? t('lcDenied') : t('lcUnavailable') }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <fieldset className="place-picker">
      <legend className="form-label">{t('lcLegend')}</legend>

      {legacyText && !hasPlace && (
        <p className="form-hint place-legacy">
          {t('lcOnRecord')}: <strong>{legacyText}</strong>. {t('lcOnRecordHint')}
        </p>
      )}

      {canLocate && (
        <div className="place-locate">
          <button type="button" className="btn btn-secondary btn-sm" onClick={useMyLocation} disabled={working}>
            {working ? <><span className="spinner" />{t('lcLocating')}</> : <><Icon name="location" size={15} />{t('lcUse')}</>}
          </button>
          <p className="form-hint" id={`${idPrefix}-locate-hint`}>{t('lcUseHint')}</p>
        </div>
      )}
      {hasPosition && (
        <p className="form-hint place-pinned">
          {fill(t('lcPinned'), { lat: value.latitude!.toFixed(5), lng: value.longitude!.toFixed(5) })}{' '}
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange({ ...value, latitude: null, longitude: null })}>
            {t('lcPinRemove')}
          </button>
        </p>
      )}
      <div role="status" className={`place-notice${notice?.kind === 'problem' ? ' is-problem' : ''}`}>
        {notice && notice.kind !== 'working' ? notice.text : ''}
      </div>

      {failed && (
        <div className="alert alert-error" role="alert">
          {t('lcLoadError')}{' '}
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAttempt((n) => n + 1)}>{t('lcRetry')}</button>
        </div>
      )}

      <div className="place-grid">
        {LEVELS.map((level, index) => {
          const open = index === 0 || value[LEVELS[index - 1].key] !== '';
          return (
            <div className="form-group" key={level.key}>
              <label className="form-label" htmlFor={`${idPrefix}-${level.key}`}>
                {t(level.label)} {!relaxed && <span className="required" aria-hidden="true">*</span>}
              </label>
              <select
                id={`${idPrefix}-${level.key}`}
                className="form-select"
                value={value[level.key]}
                onChange={(e) => choose(index, e.target.value)}
                disabled={!open}
                required={!relaxed}
              >
                <option value="">{t(level.pick)}</option>
                {lists[index].places.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={`${idPrefix}-street`}>{t('lcStreet')}</label>
        <input
          id={`${idPrefix}-street`}
          className="form-input"
          value={value.street}
          onChange={(e) => onChange({ ...value, street: e.target.value })}
          maxLength={200}
          placeholder={t('lcStreetPlace')}
        />
      </div>
    </fieldset>
  );
}
