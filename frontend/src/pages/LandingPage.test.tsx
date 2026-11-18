import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { prerenderedHtml, rememberPrerendered } from '../utils/prerendered';

vi.mock('lenis', () => ({
  default: class FakeLenis {
    raf() {}
    destroy() {}
  },
}));

import LandingPage from './LandingPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <LandingPage />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has a single main heading and the main landmark', () => {
    const { container } = renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(container.querySelector('header')).not.toBeNull();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('puts a skip link first in the tab order', async () => {
    renderPage();
    await userEvent.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main');
  });

  it('tells the story in the agreed order', () => {
    const { container } = renderPage();
    const ids = Array.from(container.querySelectorAll('section[id]')).map((el) => el.id);
    expect(ids).toEqual(['about', 'challenge', 'product', 'how', 'cooperatives', 'faq', 'contact']);
  });

  it('has the roles section removed', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/For farmers|For supervisors|For admins/i);
    expect(container.textContent).not.toMatch(/Three languages/);
  });

  it('follows the saved language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Élevez des vers à soie en meilleure santé.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toBeInTheDocument();
  });

  it('lets go of the prerendered copy once the real page is on screen', () => {
    const root = document.createElement('div');
    root.setAttribute('data-prerendered', 'true');
    root.innerHTML = '<p>copy</p>';
    rememberPrerendered(root);
    expect(prerenderedHtml()).toBe('<p>copy</p>');
    renderPage();
    expect(prerenderedHtml()).toBeNull();
  });
});

describe('LandingPage, the offer of another language', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is shown to a first time visitor whose browser prefers French', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'en']);
    renderPage();
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByRole('link', { name: 'Voir en français' })).toHaveAttribute('href', '/fr');
  });

  it('is not shown to an English reader', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    renderPage();
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
