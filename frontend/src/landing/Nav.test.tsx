import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { resetWarmUp } from '../services/warmUp';
import { Nav } from './Nav';

function renderNav() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <Nav />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

describe('Nav', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    scrollTo(0);
  });

  it('shows the English labels and the two actions', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Sericulture' })).toHaveAttribute('href', '#about');
    expect(screen.getByRole('link', { name: 'What it does' })).toHaveAttribute('href', '#product');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#how');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '#contact');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
  });

  it('points the section links at the home page when it is shown on another page', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <LanguageProvider>
          <Nav />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how');
  });

  it('shows the new logo in the brand link', () => {
    const { container } = renderNav();
    const logo = container.querySelector('.l-nav__brand img') as HTMLImageElement;
    expect(logo).toHaveAttribute('src', '/logo-mark.png');
    expect(logo).toHaveAttribute('alt', '');
    expect(container.querySelector('.l-nav__brand svg')).toBeNull();
  });

  it('links the logo to the home page', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /Smart Sericulture Management System/i })).toHaveAttribute('href', '/');
  });

  it('switches language and updates the page language', async () => {
    renderNav();
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'fr');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('condenses after scrolling and relaxes at the top', () => {
    const { container } = renderNav();
    const root = container.querySelector('header') as HTMLElement;
    expect(root).not.toHaveClass('is-condensed');
    scrollTo(120);
    expect(root).toHaveClass('is-condensed');
    scrollTo(0);
    expect(root).not.toHaveClass('is-condensed');
  });

  it('opens and closes the mobile menu with the keyboard', async () => {
    renderNav();
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
  });

  it('closes the mobile menu when a link is chosen', async () => {
    renderNav();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('link', { name: 'How it works' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Nav waking the API', () => {
  beforeEach(() => {
    resetWarmUp();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const healthCalls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).endsWith('/health'));

  it('does nothing when the page only loads', () => {
    renderNav();
    expect(healthCalls()).toHaveLength(0);
  });

  it('wakes the API when the pointer reaches Log in', async () => {
    renderNav();
    await userEvent.hover(screen.getByRole('link', { name: 'Log in' }));
    expect(healthCalls()).toHaveLength(1);
  });

  it('wakes the API when the keyboard reaches Create account', async () => {
    renderNav();
    screen.getByRole('link', { name: 'Create account' }).focus();
    expect(healthCalls()).toHaveLength(1);
  });

  it('asks only once however many buttons are touched', async () => {
    renderNav();
    await userEvent.hover(screen.getByRole('link', { name: 'Log in' }));
    await userEvent.hover(screen.getByRole('link', { name: 'Create account' }));
    expect(healthCalls()).toHaveLength(1);
  });
});

