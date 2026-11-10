import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { CalendarEvent, calendarService } from '../../services/calendar.service';
import { stageLabel } from '../../utils/constants';
import { fill } from '../../utils/fill';
import { addDays, addMonths, fetchWindow, gridDays, localIsoDay, weekdayIndex } from './calendarDays';
import { dateFormat } from '../../utils/dateFormat';
import { resultLabel } from '../../utils/resultLabel';

/** The date of a whole day written like 2026-11-05, as a local date to format. */
const asDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * The dated events of the farms a person may see. A month grid on wide screens, with the events of the chosen day under
 * it, and an agenda of the next 14 days on phones. The keyboard moves by day, week and month, one day stays in the tab
 * order, and every event is also written as text, so a colour is never the only way to tell them apart.
 */
export default function FarmCalendar({ staff = false }: { staff?: boolean }) {
  const { t, locale } = useLanguage();
  const today = localIsoDay(new Date());
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [truncated, setTruncated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);

  const [year, month] = selected.split('-').map(Number);
  const days = useMemo(() => gridDays(year, month - 1), [year, month]);
  const range = useMemo(() => fetchWindow(days, today), [days, today]);

  useEffect(() => {
    let current = true;
    setStatus('loading');
    calendarService.events(range.from, range.to)
      .then((r) => {
        if (!current) return;
        setEvents(r.data.data.events);
        setTruncated(r.data.data.truncated);
        setStatus('ready');
      })
      .catch(() => { if (current) setStatus('failed'); });
    // An older answer must never replace a newer one when a person moves quickly between months.
    return () => { current = false; };
  }, [range.from, range.to, attempt]);

  // After the keyboard moves the chosen day, the focus goes with it.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>('[data-selected="true"]')?.focus();
  }, [selected]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);

  const full = dateFormat(locale, { dateStyle: 'full' });
  const short = dateFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const monthTitle = dateFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  const weekdays = Array.from({ length: 7 }, (_, i) => dateFormat(locale, { weekday: 'short' }).format(asDate(addDays('2026-11-02', i))));

  const countText = (n: number) => (n === 0 ? t('calNoEvents') : n === 1 ? t('calOneEvent') : fill(t('calManyEvents'), { n }));

  const textOf = (e: CalendarEvent): string => {
    const d = e.detail;
    switch (e.kind) {
      case 'batch_started': return t('calEvStarted');
      case 'harvest_expected': return t('calEvExpected');
      case 'harvest_recorded': return t('calEvHarvest');
      case 'stage_changed': return d.stage ? fill(t('calEvStageTo'), { stage: stageLabel(t, d.stage) }) : t('calEvStage');
      case 'disease_check': return fill(t('calEvCheck'), { result: resultLabel(t, d.result ?? '') });
      case 'round_deadline': return fill(t('calEvDeadline'), { name: d.name ?? '' });
      case 'round_delivery': return fill(t('calEvDelivery'), { name: d.name ?? '', place: d.place ?? '' });
    }
  };

  const hrefOf = (e: CalendarEvent): string | null => {
    if (e.batchId) return `/batches/${e.batchId}`;
    if (staff && e.detail.roundId) return `/supply/${e.detail.roundId}`;
    return null;
  };

  const line = (e: CalendarEvent) => {
    const inner = (
      <>
        <span className="cal-ev-text">{textOf(e)}</span>
        {e.farmName && <span className="cal-ev-farm">{e.farmName}</span>}
        {e.expected && <span className="cal-ev-tag">{t('calExpected')}</span>}
      </>
    );
    const href = hrefOf(e);
    return (
      <li key={e.id} className="cal-ev" data-kind={e.kind}>
        {href ? <Link to={href} className="cal-ev-link">{inner}</Link> : <div className="cal-ev-link">{inner}</div>}
      </li>
    );
  };

  const move = (to: string) => {
    refocus.current = true;
    setSelected(to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const week = weekdayIndex(selected);
    const target: Record<string, string> = {
      ArrowLeft: addDays(selected, -1),
      ArrowRight: addDays(selected, 1),
      ArrowUp: addDays(selected, -7),
      ArrowDown: addDays(selected, 7),
      PageUp: addMonths(selected, -1),
      PageDown: addMonths(selected, 1),
      Home: addDays(selected, -week),
      End: addDays(selected, 6 - week),
    };
    if (target[e.key]) {
      e.preventDefault();
      move(target[e.key]);
    }
  };

  const agendaDays = Array.from({ length: 14 }, (_, i) => addDays(today, i)).filter((d) => byDay.has(d));
  const chosen = byDay.get(selected) ?? [];

  return (
    <section className="cal" aria-label={t('calTitle')}>
      <header className="cal-head">
        <h2 className="cal-title">{monthTitle}</h2>
        <div className="cal-nav">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelected(addMonths(selected, -1))}>
            <span aria-hidden="true">‹</span><span className="sr-only">{t('calPrev')}</span>
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelected(today)}>{t('calToday')}</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelected(addMonths(selected, 1))}>
            <span aria-hidden="true">›</span><span className="sr-only">{t('calNext')}</span>
          </button>
        </div>
      </header>

      {status === 'failed' && (
        <div className="cal-error" role="status">
          <p>{t('calFailed')}</p>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setAttempt((n) => n + 1)}>{t('dcsRetry')}</button>
        </div>
      )}
      {truncated && <p className="cell-sub cell-sub--wrap">{t('calTruncated')}</p>}

      <div className="cal-grid-wrap">
        <div className="cal-weekdays" aria-hidden="true">
          {weekdays.map((w) => <span key={w} data-testid="weekday">{w}</span>)}
        </div>
        <div className="cal-grid" ref={grid} role="group" aria-label={monthTitle} onKeyDown={onKeyDown}>
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const isToday = d === today;
            const isSelected = d === selected;
            const label = `${full.format(asDate(d))}${isToday ? `, ${t('calTodayWord')}` : ''}, ${countText(list.length)}`;
            return (
              <button
                key={d}
                type="button"
                className="cal-day"
                aria-label={label}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                tabIndex={isSelected ? 0 : -1}
                data-selected={isSelected}
                data-today={isToday}
                data-outside={d.slice(0, 7) !== selected.slice(0, 7)}
                onClick={() => setSelected(d)}
              >
                <span className="cal-num" aria-hidden="true">{Number(d.slice(8))}</span>
                <span className="cal-dots" aria-hidden="true">
                  {list.slice(0, 3).map((e) => <span key={e.id} className="cal-dot" data-kind={e.kind} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cal-day-list" data-testid="day-list">
        <h3 className="cal-day-title">{full.format(asDate(selected))}</h3>
        {chosen.length === 0 ? <p className="cell-sub">{t('calDayNone')}</p> : <ul className="cal-events">{chosen.map(line)}</ul>}
      </div>

      <div className="cal-agenda" data-testid="agenda">
        <h3 className="cal-day-title">{t('calAgenda')}</h3>
        {agendaDays.length === 0 ? (
          <p className="cell-sub">{t('calAgendaNone')}</p>
        ) : (
          agendaDays.map((d) => (
            <div key={d} className="cal-agenda-day">
              <h4 className="cal-agenda-date">{short.format(asDate(d))}</h4>
              <ul className="cal-events">{(byDay.get(d) ?? []).map(line)}</ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
