import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { AttentionItem } from '../../utils/attention';
import TodayCard from './TodayCard';

const show = (items: AttentionItem[]) => render(
  <MemoryRouter>
    <LanguageProvider>
      <TodayCard items={items} />
    </LanguageProvider>
  </MemoryRouter>,
);

const item = (over: Partial<AttentionItem>): AttentionItem => ({ batchId: 'b1', farmName: 'Habimana Silk Farm', kind: 'tempLow', ...over });

beforeEach(() => localStorage.clear());

describe('Today card', () => {
  it('has a heading and says everything is in order when there is nothing to do', () => {
    show([]);
    expect(screen.getByRole('heading', { name: 'Needs attention today' })).toBeInTheDocument();
    expect(screen.getByText('Everything is in order today.')).toBeInTheDocument();
    expect(screen.getByText('Readings are in the safe range and no harvest is due in the next 3 days.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: 'tempLow', value: 20.5, min: 22, max: 28 }, 'Habimana Silk Farm: temperature is 20.5 °C, below the safe 22 to 28 °C.'],
    [{ kind: 'tempHigh', value: 29, min: 22, max: 28 }, 'Habimana Silk Farm: temperature is 29 °C, above the safe 22 to 28 °C.'],
    [{ kind: 'humLow', value: 60, min: 70, max: 85 }, 'Habimana Silk Farm: humidity is 60 %, below the safe 70 to 85 %.'],
    [{ kind: 'humHigh', value: 90, min: 70, max: 85 }, 'Habimana Silk Farm: humidity is 90 %, above the safe 70 to 85 %.'],
    [{ kind: 'silent', hours: 8 }, 'Habimana Silk Farm: no reading for 8 hours. Check the sensor.'],
    [{ kind: 'harvestLate', days: 3 }, 'Habimana Silk Farm: harvest was expected 3 days ago.'],
    [{ kind: 'harvestLate', days: 1 }, 'Habimana Silk Farm: harvest was expected yesterday.'],
    [{ kind: 'harvestToday' }, 'Habimana Silk Farm: harvest is expected today.'],
    [{ kind: 'harvestTomorrow' }, 'Habimana Silk Farm: harvest is expected tomorrow.'],
    [{ kind: 'harvestSoon', days: 3 }, 'Habimana Silk Farm: harvest is expected in 3 days.'],
  ] as [Partial<AttentionItem>, string][])('words %j in plain language', (over, text) => {
    show([item(over)]);
    expect(screen.getByRole('link', { name: text })).toHaveAttribute('href', '/batches/b1');
  });

  it('names the room when the line is about a room', () => {
    show([item({ roomId: 'r1', roomName: 'Rearing house 2', kind: 'tempLow', value: 20.5, min: 22, max: 28 })]);
    expect(screen.getByRole('link', { name: 'Habimana Silk Farm, Rearing house 2: temperature is 20.5 °C, below the safe 22 to 28 °C.' })).toBeInTheDocument();
  });

  it('lists every item as a link to its batch', () => {
    show([item({ batchId: 'b1', kind: 'tempLow', value: 20, min: 22, max: 28 }), item({ batchId: 'b2', farmName: 'Other Farm', kind: 'harvestToday' })]);
    const list = screen.getByRole('list', { name: 'Needs attention today' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/batches/b1', '/batches/b2']);
  });

  it('uses no dots or pills', () => {
    const { container } = show([item({ kind: 'harvestToday' })]);
    expect(container.querySelector('.badge, [class*="dot"], [class*="pill"]')).toBeNull();
  });
});
