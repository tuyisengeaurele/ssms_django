import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { setReducedMotion } from '../test/setup';
import { About } from './About';
import { Challenge } from './Challenge';
import { Cooperatives } from './Cooperatives';
import { Features } from './Features';

function wrap(node: JSX.Element) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

beforeEach(() => {
  localStorage.clear();
});

describe('About sericulture', () => {
  it('explains what sericulture is in plain words', () => {
    const { container } = wrap(<About />);
    expect(container.querySelector('section')).toHaveAttribute('id', 'about');
    expect(screen.getByText('Sericulture', { selector: 'p' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Silk begins with a worm that eats mulberry leaves.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sericulture is the farming of silkworms/)).toBeInTheDocument();
    expect(screen.getByText(/In Rwanda, silk gives rural families and cooperatives an income/)).toBeInTheDocument();
  });

  it('lists the five stages of a batch in order', () => {
    wrap(<About />);
    const list = screen.getByRole('list', { name: 'The five stages of a batch' });
    const stages = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(stages).toEqual(['01Egg', '02Larva', '03Pupa', '04Cocoon', '05Harvest']);
  });

  it('prints no statistics', () => {
    const { container } = wrap(<About />);
    expect(container.textContent?.replace(/0[1-5]/g, '')).not.toMatch(/\d/);
  });
});

describe('The challenge', () => {
  it('names the three problems in order', () => {
    const { container } = wrap(<Challenge />);
    expect(container.querySelector('section')).toHaveAttribute('id', 'challenge');
    expect(screen.getByRole('heading', { level: 2, name: 'One bad night can cost a batch.' })).toBeInTheDocument();
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Conditions drift', 'Disease goes unnoticed', 'Records stay on paper']);
  });

  it('keeps the old fragile-silkworms lines out', () => {
    const { container } = wrap(<Challenge />);
    expect(container.textContent).not.toMatch(/Silkworms are fragile|misses the night/);
  });
});

describe('What SSMS does', () => {
  it('is the product section with a level two heading', () => {
    const { container } = wrap(<Features />);
    const section = container.querySelector('section') as HTMLElement;
    expect(section).toHaveAttribute('id', 'product');
    expect(
      within(section).getByRole('heading', { level: 2, name: 'A second pair of eyes for every rearing room.' }),
    ).toBeInTheDocument();
  });

  it('shows five tiles and no languages tile', () => {
    const { container } = wrap(<Features />);
    const tiles = screen.getAllByRole('article');
    expect(tiles).toHaveLength(5);
    const titles = tiles.map((tile) => within(tile).getByRole('heading', { level: 3 }).textContent);
    expect(titles).toEqual(['Live readings', 'Disease check', 'Email alerts', 'Harvest records', 'Cooperatives']);
    expect(container.textContent).not.toMatch(/Three languages|Kinyarwanda/);
  });

  it('keeps the tiles free of controls and of window dots', () => {
    const { container } = wrap(<Features />);
    expect(container.querySelectorAll('a, button, input, select, textarea')).toHaveLength(0);
    expect(container.querySelector('.l-feat__pulse, .l-feat__crew, .l-feat__chips')).toBeNull();
  });

  it('follows the pointer with a spotlight on desktop', () => {
    wrap(<Features />);
    const tile = screen.getAllByRole('article')[0];
    tile.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, x: 10, y: 20, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerMove(tile, { clientX: 60, clientY: 70, pointerType: 'mouse' });
    expect(tile.style.getPropertyValue('--mx')).toBe('50px');
  });

  it('skips the spotlight when motion is reduced', () => {
    setReducedMotion(true);
    wrap(<Features />);
    const tile = screen.getAllByRole('article')[0];
    fireEvent.pointerMove(tile, { clientX: 60, clientY: 70, pointerType: 'mouse' });
    expect(tile.style.getPropertyValue('--mx')).toBe('');
  });
});

describe('Cooperatives', () => {
  it('says who sees what, without statistics', () => {
    const { container } = wrap(<Cooperatives />);
    expect(container.querySelector('section')).toHaveAttribute('id', 'cooperatives');
    expect(screen.getByRole('heading', { level: 2, name: 'One view of every farm.' })).toBeInTheDocument();
    expect(screen.getByText('Supervisors see the farms in their cooperative.')).toBeInTheDocument();
    expect(screen.getByText('Farmers see only their own farms.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
  });
});
