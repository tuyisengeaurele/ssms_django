import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { Footer } from './Footer';

function renderFooter(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('names the project and says what it is', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('Smart Sericulture Management System')).toBeInTheDocument();
    expect(within(footer).getByText('Silk farming software for Rwandan farmers and cooperatives.')).toBeInTheDocument();
    expect(within(footer).getByText('Built in Rwanda.')).toBeInTheDocument();
  });

  it('shows the logo made for dark backgrounds', () => {
    const { container } = renderFooter();
    const logo = container.querySelector('.l-footer__logo') as HTMLImageElement;
    expect(logo).toHaveAttribute('src', '/logo-on-dark.png');
    expect(logo).toHaveAttribute('alt', '');
  });

  it('groups links under Explore, Account and Legal', () => {
    renderFooter();
    const explore = screen.getByRole('navigation', { name: 'Explore' });
    expect(within(explore).getByRole('link', { name: 'Sericulture' })).toHaveAttribute('href', '#about');
    expect(within(explore).getByRole('link', { name: 'What it does' })).toHaveAttribute('href', '#product');
    expect(within(explore).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#how');
    expect(within(explore).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq');

    const account = screen.getByRole('navigation', { name: 'Account' });
    expect(within(account).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(within(account).getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
    expect(within(account).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '#contact');

    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(legal).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(within(legal).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });

  it('points section links at the home page when shown on another page', () => {
    renderFooter('/terms');
    const explore = screen.getByRole('navigation', { name: 'Explore' });
    expect(within(explore).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how');
  });

  it('has a large wordmark that screen readers skip', () => {
    const { container } = renderFooter();
    const mark = container.querySelector('.l-footer__wordmark');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveTextContent('SSMS');
  });

  it('credits the photos and shows the year', () => {
    renderFooter();
    expect(screen.getByText('Photos from Pexels.')).toBeInTheDocument();
    expect(screen.getByText(String(new Date().getFullYear()))).toBeInTheDocument();
  });
});
