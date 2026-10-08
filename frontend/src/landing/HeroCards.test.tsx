import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { setReducedMotion } from '../test/setup';
import { HERO_CARD_INTERVAL, HeroCards } from './HeroCards';

function renderCards() {
  return render(
    <LanguageProvider>
      <HeroCards />
    </LanguageProvider>,
  );
}

const announced = () => screen.getAllByRole('img').map((el) => el.getAttribute('aria-label'));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HeroCards', () => {
  it('holds three cards in one window and announces only the visible one', () => {
    const { container } = renderCards();
    expect(container.querySelectorAll('.l-paper')).toHaveLength(3);
    expect(container.querySelectorAll('.l-herocards__slot')).toHaveLength(3);
    expect(announced()).toHaveLength(1);
    expect(container.querySelector('.l-herocards__slot.is-active')).not.toBeNull();
    expect(container.querySelectorAll('.l-herocards__slot[aria-hidden="true"]')).toHaveLength(2);
  });

  it('shows the next card by itself after the interval', () => {
    renderCards();
    const first = announced()[0];
    act(() => {
      vi.advanceTimersByTime(HERO_CARD_INTERVAL + 50);
    });
    expect(announced()).toHaveLength(1);
    expect(announced()[0]).not.toBe(first);
  });

  it('comes back to the first card after the last', () => {
    renderCards();
    const first = announced()[0];
    act(() => {
      vi.advanceTimersByTime((HERO_CARD_INTERVAL + 50) * 3);
    });
    expect(announced()[0]).toBe(first);
  });

  it('has no buttons and no progress bar', () => {
    const { container } = renderCards();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="progress"], [class*="dots"]')).toBeNull();
  });

  it('stays on the card the reader is pointing at', () => {
    const { container } = renderCards();
    const first = announced()[0];
    fireEvent.mouseEnter(container.querySelector('.l-herocards') as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(HERO_CARD_INTERVAL * 3);
    });
    expect(announced()[0]).toBe(first);
    fireEvent.mouseLeave(container.querySelector('.l-herocards') as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(HERO_CARD_INTERVAL + 50);
    });
    expect(announced()[0]).not.toBe(first);
  });

  it('does not rotate when motion is reduced', () => {
    setReducedMotion(true);
    renderCards();
    const first = announced()[0];
    act(() => {
      vi.advanceTimersByTime(HERO_CARD_INTERVAL * 4);
    });
    expect(announced()[0]).toBe(first);
  });
});
