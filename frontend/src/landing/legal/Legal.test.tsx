import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import PrivacyPolicyPage from '../../pages/PrivacyPolicyPage';
import TermsOfServicePage from '../../pages/TermsOfServicePage';

function renderPage(node: JSX.Element, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>{node}</LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Privacy policy page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the site navigation and footer', () => {
    renderPage(<PrivacyPolicyPage />, '/privacy');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    const create = screen.getAllByRole('link', { name: 'Create account' });
    expect(create.length).toBeGreaterThanOrEqual(2);
    expect(create.every((l) => l.getAttribute('href') === '/register')).toBe(true);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('has one title, a date and an introduction', () => {
    renderPage(<PrivacyPolicyPage />, '/privacy');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
    expect(screen.getByText(/explains how the Smart Sericulture Management System/)).toBeInTheDocument();
  });

  it('lists every section in a contents navigation that links to it', () => {
    const { container } = renderPage(<PrivacyPolicyPage />, '/privacy');
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(toc).getAllByRole('link');
    expect(links).toHaveLength(9);
    for (const link of links) {
      const id = (link.getAttribute('href') as string).slice(1);
      const section = container.querySelector(`article section[id="${id}"]`);
      expect(section, id).not.toBeNull();
      expect(section?.querySelector('h2')).not.toBeNull();
    }
  });

  it('keeps the promises the site makes elsewhere', () => {
    renderPage(<PrivacyPolicyPage />, '/privacy');
    expect(screen.getByText(/does not show a cookie banner/)).toBeInTheDocument();
    const promise = screen.getByText((_, el) => el?.tagName === 'P' && /do not sell, rent or trade/.test(el.textContent ?? ''));
    expect(promise).toBeInTheDocument();
  });

  it('points to the terms and back home', () => {
    renderPage(<PrivacyPolicyPage />, '/privacy');
    const article = screen.getByRole('main');
    expect(within(article).getByRole('link', { name: /Terms of Service/ })).toHaveAttribute('href', '/terms');
  });

  it('has no inline styles, so the theme controls how it looks', () => {
    const { container } = renderPage(<PrivacyPolicyPage />, '/privacy');
    expect(container.querySelectorAll('article [style]')).toHaveLength(0);
  });
});

describe('Terms of service page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has twelve sections', () => {
    renderPage(<TermsOfServicePage />, '/terms');
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(toc).getAllByRole('link')).toHaveLength(12);
  });

  it('says the disease check can make mistakes', () => {
    renderPage(<TermsOfServicePage />, '/terms');
    expect(screen.getByText(/can make mistakes/)).toBeInTheDocument();
    expect(screen.queryByText(/diagnostic suggestions only/)).not.toBeInTheDocument();
  });

  it('links to the privacy policy from the data section', () => {
    renderPage(<TermsOfServicePage />, '/terms');
    const links = screen.getAllByRole('link', { name: 'Privacy Policy' });
    expect(links.some((l) => l.getAttribute('href') === '/privacy')).toBe(true);
  });
});
