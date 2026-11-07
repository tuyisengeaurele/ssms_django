import { useLanguage } from '../../context/LanguageContext';
import { SplitRow } from '../../services/supply.service';
import { fill } from '../../utils/fill';
import Avatar from '../../components/ui/Avatar';

interface Props {
  rows: SplitRow[];
  /** What each row is given, as typed. Kept as text so a half typed number is not lost. */
  values: Record<string, string>;
  notes: Record<string, string>;
  onValue: (id: string, value: string) => void;
  onNote: (id: string, value: string) => void;
}

/** The split the system proposes, row by row, for the supervisor to edit. The page works out the total. */
export default function SplitTable({ rows, values, notes, onValue, onNote }: Props) {
  const { t } = useLanguage();
  return (
    <div className="table-wrapper">
      <table className="table-stack">
        <thead>
          <tr>
            <th>{t('rsColFarmer')}</th>
            <th>{t('rsColRoom')}</th>
            <th>{t('rsColAsked')}</th>
            <th>{t('rsColAllowance')}</th>
            <th>{t('rsColRoomSpace')}</th>
            <th>{t('rsColGive')}</th>
            <th>{t('rsColReason')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="tbody-row">
              <td className="cell-lead">
                <div className="cell-person">
                  <Avatar name={r.farmer.name} />
                  <div className="cell-stack">
                    <span className="cell-strong">{r.farmer.name}</span>
                    <span className="cell-sub">{r.farmer.email}</span>
                    {r.note && <span className="cell-sub">{r.note}</span>}
                  </div>
                </div>
              </td>
              <td data-label={t('rsColRoom')}>{r.room.name}</td>
              <td data-label={t('rsColAsked')}>{r.asked}</td>
              <td data-label={t('rsColAllowance')}>{r.allowance}</td>
              <td data-label={t('rsColRoomSpace')}>{r.roomFree === null ? t('rsNotKnown') : r.roomFree}</td>
              <td data-label={t('rsColGive')}>
                <input
                  type="number" inputMode="numeric" className="form-input form-input--narrow" min={0} max={r.asked} step={1}
                  aria-label={fill(t('rsGiveFor'), { name: r.farmer.name })} value={values[r.id] ?? ''} onChange={(e) => onValue(r.id, e.target.value)}
                />
              </td>
              <td data-label={t('rsColReason')}>
                <input className="form-input" maxLength={500} aria-label={fill(t('rsReasonFor'), { name: r.farmer.name })} value={notes[r.id] ?? ''} onChange={(e) => onNote(r.id, e.target.value)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
