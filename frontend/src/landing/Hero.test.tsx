import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('has one headline, an eyebrow and the sub line', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1, name: 'Raise healthier silkworms.' })).toBeInTheDocument();
    expect(screen.getByText('Smart Sericulture Management System')).toBeInTheDocument();
    expect(screen.queryByText(/Silk farming software for Rwanda/)).not.toBeInTheDocument();
    expect(screen.getByText(/SSMS watches the temperature and humidity in your rearing room/)).toBeInTheDocument();
  });

  it('links the two actions and has no note under them', () => {
    const { container } = renderHero();
    expect(screen.getByRole('link', { name: /Create your account/ })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '#how');
    expect(screen.queryByText(/Works in any phone browser/)).not.toBeInTheDocument();
    expect(container.querySelector('.l-hero__note')).toBeNull();
  });

  it('has no statistic in the hero', () => {
    setReducedMotion(true);
    const { container } = renderHero();
    expect(screen.queryByLabelText('Key fact')).not.toBeInTheDocument();
    expect(container.querySelector('.l-hero__stat')).toBeNull();
    expect(screen.queryByText(/diseases the platform identifies/)).not.toBeInTheDocument();
  });

  it('describes the photo and has no ghost word over it', () => {
    const { container } = renderHero();
    expect(screen.getByAltText('Silkworm cocoons resting in bamboo trays')).toHaveAttribute('fetchpriority', 'high');
    expect(container.querySelector('.l-hero__ghost')).toBeNull();
    expect(container.textContent).not.toMatch(/SILK$|SILKSILK/);
  });

  it('has no silkworm cutout and no rotating preview', () => {
    const { container } = renderHero();
    expect(container.querySelector('.l-hero__worm')).toBeNull();
    expect(container.querySelector('img[src*="worm"]')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d\d? \/ 0?\d|sample/i);
  });

  it('rotates three paper cards in one window and announces only one', () => {
    const { container } = renderHero();
    expect(container.querySelectorAll('.l-paper')).toHaveLength(3);
    expect(screen.getAllByRole('img', { name: /^Illustration/ })).toHaveLength(1);
  });

  it('does not follow the mouse', () => {
    const { container } = renderHero();
    const card = container.querySelector('.l-hero__card') as HTMLElement;
    fireEvent.pointerMove(card, { clientX: 300, clientY: 200, pointerType: 'mouse' });
    expect(card.style.getPropertyValue('--px')).toBe('');
    expect(card.style.getPropertyValue('--py')).toBe('');
  });

  it('keeps the main button still when the mouse moves over it', () => {
    renderHero();
    const link = screen.getByRole('link', { name: /Create your account/ });
    fireEvent.pointerMove(link, { clientX: 5, clientY: 5, pointerType: 'mouse' });
    fireEvent.mouseMove(link, { clientX: 5, clientY: 5 });
    expect(link.style.transform).toBe('');
  });

  it('shows the French headline after switching language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderHero();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Élevez des vers à soie en meilleure santé.' }),
    ).toBeInTheDocument();
  });
});
