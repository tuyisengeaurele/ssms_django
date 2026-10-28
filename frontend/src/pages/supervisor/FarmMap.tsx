import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FarmRisk } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { LEVEL_KEY, riskReasons } from '../../utils/farmRisk';
import { RWANDA_CENTRE, RWANDA_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../../utils/mapConfig';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';

type Placed = FarmRisk & { position: NonNullable<FarmRisk['position']> };

// Only a high pin carries a symbol. The levels are also told apart by shape, so colour is never the only difference.
const SYMBOL = { HIGH: '!', MEDIUM: '', OK: '' } as const;

/** A real map with a pin for each farm that has a place. The pins are drawn here, so no farm is ever sent to the map server. */
export default function FarmMap({ rows }: { rows: FarmRisk[] }) {
  const { t } = useLanguage();
  const placed = rows.filter((r): r is Placed => r.position !== null);
  const unplaced = rows.filter((r) => r.position === null);

  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef(new Map<string, L.Marker>());
  const [selected, setSelected] = useState<string | null>(null);
  const [whole, setWhole] = useState(false);
  const hasPlaced = placed.length > 0;

  // The map itself, made once while there is anything to show on it.
  useEffect(() => {
    if (!hasPlaced || !element.current) return undefined;
    const made = L.map(element.current).setView(RWANDA_CENTRE, RWANDA_ZOOM);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(made);
    map.current = made;
    const held = pins.current;
    return () => {
      made.remove();
      map.current = null;
      held.clear();
    };
  }, [hasPlaced]);

  // The pins, and where the map looks.
  useEffect(() => {
    const current = map.current;
    if (!current) return;
    pins.current.forEach((pin) => pin.remove());
    pins.current.clear();

    const points: L.LatLngTuple[] = [];
    for (const farm of placed) {
      const approx = farm.position.precision !== 'exact';
      const label = `${farm.name}, ${t(LEVEL_KEY[farm.level])}${approx ? t('mpPinApprox') : ''}`;
      const icon = L.divIcon({
        className: 'farm-pin-holder',
        html: `<span class="farm-pin farm-pin--${farm.level.toLowerCase()}${approx ? ' farm-pin--approx' : ''}">${SYMBOL[farm.level]}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const pin = L.marker([farm.position.lat, farm.position.lng], { icon, keyboard: true, title: label }).addTo(current);
      const el = pin.getElement();
      el?.setAttribute('aria-label', label);
      el?.setAttribute('role', 'button');
      pin.on('click', () => setSelected(farm.id));
      // Leaflet only opens popups on Enter. A pin is a button, so Enter and Space choose the farm.
      pin.on('keypress', (e: L.LeafletKeyboardEvent) => {
        const key = e.originalEvent.keyCode;
        if (key === 13 || key === 32) {
          e.originalEvent.preventDefault();
          setSelected(farm.id);
        }
      });
      pins.current.set(farm.id, pin);
      points.push([farm.position.lat, farm.position.lng]);
    }

    if (whole || points.length === 0) {
      current.setView(RWANDA_CENTRE, RWANDA_ZOOM);
    } else if (points.length === 1) {
      current.setView(points[0], 13);
    } else {
      current.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 14 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, whole, t, hasPlaced]);

  // The pin that is chosen stands out.
  useEffect(() => {
    pins.current.forEach((pin, id) => pin.getElement()?.classList.toggle('is-selected', id === selected));
  }, [selected, rows, t, whole]);

  const chosen = placed.find((r) => r.id === selected) ?? null;

  return (
    <div className="farm-map">
      {hasPlaced ? (
        <>
          <div className="farm-map-bar">
            <p className="form-hint">{t('mpKeys')}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWhole((v) => !v)}>
              {whole ? t('mpFit') : t('mpWhole')}
            </button>
          </div>
          <div ref={element} className="farm-map-canvas" role="region" aria-label={t('mpRegion')} />
          {chosen && (
            <section className="farm-map-card" role="region" aria-label={chosen.name}>
              <div className="risk-head">
                <Link to={`/farms/${chosen.id}`} className="risk-name">{chosen.name}</Link>
                <span className={`risk-badge risk-${chosen.level.toLowerCase()}`}>{t(LEVEL_KEY[chosen.level])}</span>
                <span className="risk-owner">{chosen.ownerName}</span>
              </div>
              {riskReasons(chosen, t).length > 0 && (
                <ul className="risk-why">
                  {riskReasons(chosen, t).map((why) => <li key={why}>{why}</li>)}
                </ul>
              )}
              {chosen.position.precision !== 'exact' && (
                <p className="form-hint">{t(chosen.position.precision === 'village' ? 'mpCardVillage' : 'mpCardSector')}</p>
              )}
            </section>
          )}
        </>
      ) : (
        <EmptyState icon={<Icon name="farms" size={22} />} title={t('mpNone')} />
      )}

      {unplaced.length > 0 && (
        <div className="farm-map-unplaced">
          <h3 className="subhead">{t('mpUnplaced')}</h3>
          <p className="form-hint">{t('mpUnplacedNote')}</p>
          <ul aria-label={t('mpUnplaced')} className="farm-map-unplaced-list">
            {unplaced.map((r) => (
              <li key={r.id}><Link to={`/farms/${r.id}`} className="cell-link">{r.name}</Link></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
