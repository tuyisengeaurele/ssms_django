import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHART_COLORS, colorFor } from '../../utils/chartColors';
import BarList from './BarList';

const rows = [
  { key: 'a', label: 'Larva', value: 8, color: '#1F7A52' },
  { key: 'b', label: 'Egg', value: 4, color: '#B97F0C' },
  { key: 'c', label: 'Pupa', value: 0, color: '#2F78B5' },
];

describe('BarList', () => {
  it('lists each label with its value as text', () => {
    render(<BarList label="Batches by stage" rows={rows} />);
    const list = screen.getByRole('list', { name: 'Batches by stage' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Larva');
    expect(items[0]).toHaveTextContent('8');
  });

  it('sizes bars against the largest value', () => {
    const { container } = render(<BarList label="x" rows={rows} />);
    const widths = Array.from(container.querySelectorAll<HTMLElement>('.barlist-bar')).map((b) => b.style.width);
    expect(widths).toEqual(['100%', '50%', '0%']);
  });

  it('draws each bar in its own colour with no outline', () => {
    const { container } = render(<BarList label="x" rows={rows} />);
    const first = container.querySelector<HTMLElement>('.barlist-bar')!;
    expect(first.style.background).toMatch(/rgb\(31, 122, 82\)|#1f7a52/i);
    expect(first.style.border).toBe('');
  });

  it('copes with every value being zero', () => {
    const { container } = render(<BarList label="x" rows={[{ key: 'z', label: 'None', value: 0, color: '#000' }]} />);
    expect(container.querySelector<HTMLElement>('.barlist-bar')!.style.width).toBe('0%');
  });

  it('keeps the label and the value in text colour, not the series colour', () => {
    const { container } = render(<BarList label="x" rows={rows} />);
    expect(container.querySelector<HTMLElement>('.barlist-label')!.style.color).toBe('');
    expect(container.querySelector<HTMLElement>('.barlist-value')!.style.color).toBe('');
  });

  it('formats the value when asked', () => {
    render(<BarList label="x" rows={[{ key: 'k', label: 'Grade A', value: 2.5, color: '#000' }]} format={(v) => `${v} kg`} />);
    expect(screen.getByText('2.5 kg')).toBeInTheDocument();
  });
});

describe('chart colours', () => {
  it('has five categorical colours in a fixed order', () => {
    expect(CHART_COLORS).toEqual(['#B97F0C', '#1F7A52', '#2F78B5', '#B4472F', '#7A5BA6']);
  });

  it('gives the same colour to the same name every time', () => {
    expect(colorFor('stage', 'LARVA')).toBe(colorFor('stage', 'LARVA'));
    expect(colorFor('result', 'Healthy')).toBe('#1F7A52');
    expect(colorFor('role', 'FARMER')).toBe('#1F7A52');
    expect(colorFor('action', 'DELETE')).toBe('#B4472F');
  });

  it('falls back to a quiet grey for a name it does not know', () => {
    expect(colorFor('stage', 'MYSTERY')).toBe('#6B7B73');
  });
});
