import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { setReducedMotion } from '../test/setup';
import { Hero } from './Hero';

function renderHero() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <Hero />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Hero', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has one headline and the sub line', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1, name: 'Raise healthier silkworms.' })).toBeInTheDocument();
    expect(screen.getByText('Watch every batch, catch disease early, harvest at the right time.')).toBeInTheDocument();
  });

  it('links the two actions', () => {
    renderHero();
    expect(screen.getByRole('link', { name: /Get started/ })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '#how');
  });

  it('shows the three true stats immediately when motion is reduced', () => {
    setReducedMotion(true);
    renderHero();
    const stats = screen.getByRole('list', { name: 'Key facts' });
    const items = within(stats).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('4');
    expect(items[0]).toHaveTextContent('diseases spotted from one photo');
    expect(items[1]).toHaveTextContent('5');
    expect(items[1]).toHaveTextContent('stages, egg to harvest');
    expect(items[2]).toHaveTextContent('3');
    expect(items[2]).toHaveTextContent('languages');
  });

  it('describes the photo and hides the decoration from screen readers', () => {
    const { container } = renderHero();
    expect(screen.getByAltText('Silkworm cocoons resting in bamboo trays')).toBeInTheDocument();
    const ghost = container.querySelector('.l-hero__ghost');
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost).toHaveTextContent('SILK');
    expect(container.querySelector('.l-hero__worm img')).toHaveAttribute('alt', '');
  });

  it('marks the hero photo as high priority', () => {
    renderHero();
    expect(screen.getByAltText('Silkworm cocoons resting in bamboo trays')).toHaveAttribute('fetchpriority', 'high');
  });

  it('shows one sample screen at a time with a counter', () => {
    renderHero();
    expect(screen.getAllByRole('img', { name: /^Sample/ })).toHaveLength(1);
    expect(screen.getByText('01 / 03')).toBeInTheDocument();
  });

  it('moves to the next screen after five seconds', () => {
    vi.useFakeTimers();
    renderHero();
    expect(screen.getByRole('img', { name: /sample dashboard/i })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.getByRole('img', { name: /sample disease check/i })).toBeInTheDocument();
    expect(screen.getByText('02 / 03')).toBeInTheDocument();
  });

  it('stays on the first screen when motion is reduced', () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    renderHero();
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByRole('img', { name: /sample dashboard/i })).toBeInTheDocument();
  });

  it('lets people pick a screen and then stops rotating', () => {
    vi.useFakeTimers();
    renderHero();
    fireEvent.click(screen.getByRole('button', { name: 'Show Alerts' }));
    expect(screen.getByRole('img', { name: /sample list of three alerts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Alerts' })).toHaveAttribute('aria-current', 'true');
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByRole('img', { name: /sample list of three alerts/i })).toBeInTheDocument();
  });

  it('pauses while the pointer rests on the preview', () => {
    vi.useFakeTimers();
    const { container } = renderHero();
    const preview = container.querySelector('.l-hero__preview') as HTMLElement;
    fireEvent.pointerEnter(preview);
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByRole('img', { name: /sample dashboard/i })).toBeInTheDocument();
    fireEvent.pointerLeave(preview);
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.getByRole('img', { name: /sample disease check/i })).toBeInTheDocument();
  });

  it('shows the French headline after switching language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderHero();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Élevez des vers à soie en meilleure santé.' }),
    ).toBeInTheDocument();
  });
});
