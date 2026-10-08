import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { setReducedMotion } from '../test/setup';
import { Features } from './Features';
import { Problem } from './Problem';

function wrap(node: JSX.Element) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

describe('Problem', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the three lines in order', () => {
    const { container } = wrap(<Problem />);
    const lines = Array.from(container.querySelectorAll('.l-problem__line')).map((el) => el.textContent);
    expect(lines).toEqual([
      'Silkworms are fragile.',
      'A few degrees, or one damp night, can cost a whole batch.',
      'Checking by hand misses the night.',
    ]);
  });
});

describe('Features', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is the product section with a level two heading', () => {
    const { container } = wrap(<Features />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section).toHaveAttribute('id', 'product');
    expect(within(section).getByRole('heading', { level: 2, name: 'Everything a rearing room needs.' })).toBeInTheDocument();
  });

  it('shows six tiles with a title and a sentence each', () => {
    wrap(<Features />);
    const tiles = screen.getAllByRole('article');
    expect(tiles).toHaveLength(6);
    const titles = tiles.map((tile) => within(tile).getByRole('heading', { level: 3 }).textContent);
    expect(titles).toEqual([
      'Live readings',
      'Disease check',
      'Email alerts',
      'Cooperatives',
      'Harvest records',
      'Three languages',
    ]);
    expect(within(tiles[1]).getByText('One photo, one answer, with a confidence score.')).toBeInTheDocument();
  });

  it('keeps the tiles free of controls', () => {
    const { container } = wrap(<Features />);
    expect(container.querySelectorAll('a, button, input, select, textarea')).toHaveLength(0);
  });

  it('follows the pointer with a spotlight on desktop', () => {
    wrap(<Features />);
    const tile = screen.getAllByRole('article')[0];
    tile.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, x: 10, y: 20, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerMove(tile, { clientX: 60, clientY: 70, pointerType: 'mouse' });
    expect(tile.style.getPropertyValue('--mx')).toBe('50px');
    expect(tile.style.getPropertyValue('--my')).toBe('50px');
  });

  it('skips the spotlight when motion is reduced', () => {
    setReducedMotion(true);
    wrap(<Features />);
    const tile = screen.getAllByRole('article')[0];
    fireEvent.pointerMove(tile, { clientX: 60, clientY: 70, pointerType: 'mouse' });
    expect(tile.style.getPropertyValue('--mx')).toBe('');
  });
});
