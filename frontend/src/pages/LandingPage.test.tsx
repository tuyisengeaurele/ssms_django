import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';

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
});
