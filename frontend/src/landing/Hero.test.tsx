import { render, screen, within } from '@testing-library/react';
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
    expect(screen.getByText('Silk farming software for Rwanda')).toBeInTheDocument();
    expect(screen.getByText(/SSMS watches the temperature and humidity in your rearing room/)).toBeInTheDocument();
  });

  it('links the two actions and adds a short note', () => {
    renderHero();
    expect(screen.getByRole('link', { name: /Create your account/ })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '#how');
    expect(screen.getByText('Works in any phone browser.')).toBeInTheDocument();
  });

  it('shows one honest number about the platform', () => {
    setReducedMotion(true);
    renderHero();
    const stat = screen.getByLabelText('Key fact');
    expect(stat).toHaveTextContent('4');
    expect(stat).toHaveTextContent('diseases the platform identifies');
    expect(screen.queryByText(/stages, egg to harvest/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^languages$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/from one photo/)).not.toBeInTheDocument();
  });

  it('describes the photo and hides the decoration from screen readers', () => {
    const { container } = renderHero();
    expect(screen.getByAltText('Silkworm cocoons resting in bamboo trays')).toHaveAttribute('fetchpriority', 'high');
    const ghost = container.querySelector('.l-hero__ghost');
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost).toHaveTextContent('SILK');
  });

  it('has no silkworm cutout and no rotating preview', () => {
    const { container } = renderHero();
    expect(container.querySelector('.l-hero__worm')).toBeNull();
    expect(container.querySelector('img[src*="worm"]')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d\d? \/ 0?\d|sample/i);
  });

  it('shows a stack of two paper cards but announces only one', () => {
    const { container } = renderHero();
    expect(container.querySelectorAll('.l-paper')).toHaveLength(2);
    const announced = screen.getAllByRole('img', { name: /^Illustration/ });
    expect(announced).toHaveLength(1);
    expect(within(announced[0]).getByText('Gasabo Silk Farm')).toBeInTheDocument();
    expect(container.querySelector('.l-hero__back')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows the French headline after switching language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderHero();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Élevez des vers à soie en meilleure santé.' }),
    ).toBeInTheDocument();
  });
});
