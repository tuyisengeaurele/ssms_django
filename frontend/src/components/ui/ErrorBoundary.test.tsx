import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ErrorBoundary } from './ErrorBoundary';

const boundary = (child: JSX.Element) => render(<LanguageProvider><ErrorBoundary>{child}</ErrorBoundary></LanguageProvider>);

function Broken(): JSX.Element {
  throw new Error('secret detail from deep inside the code');
}

beforeEach(() => {
  localStorage.clear();
  // React and the boundary both print the error. Keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows the page as usual when nothing goes wrong', () => {
    boundary(<p>All well</p>);
    expect(screen.getByText('All well')).toBeInTheDocument();
  });

  it('says plainly that the page ran into a problem and what to do', () => {
    boundary(<Broken />);
    expect(screen.getByRole('heading', { level: 1, name: 'This page ran into a problem' })).toBeInTheDocument();
    expect(screen.getByText("We're sorry. Please refresh the page.")).toBeInTheDocument();
  });

  it('does not send the person to a dashboard they may not be able to reach', () => {
    const { container } = boundary(<Broken />);
    expect(container.textContent).not.toMatch(/dashboard/i);
  });

  it('shows no technical details to the person', () => {
    const { container } = boundary(<Broken />);
    expect(screen.queryByText(/technical details/i)).not.toBeInTheDocument();
    expect(container.querySelector('details, pre')).toBeNull();
    expect(container.textContent).not.toContain('secret detail');
  });

  it('still records the error for whoever reads the console', () => {
    boundary(<Broken />);
    expect(console.error).toHaveBeenCalledWith('ErrorBoundary caught:', expect.any(Error), expect.any(String));
  });

  it('offers a way to refresh and a way home', () => {
    boundary(<Broken />);
    expect(screen.getByRole('button', { name: 'Refresh page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('speaks the language of the screen', () => {
    localStorage.setItem('ssms_locale', 'fr');
    boundary(<Broken />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cette page a rencontré un problème' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualiser la page' })).toBeInTheDocument();
  });

  it('is styled by its own stylesheet (the dashboard styles are not loaded when a page breaks), with no inline colours', () => {
    const { container } = boundary(<Broken />);
    expect(container.querySelector('[style]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh page' })).toHaveClass('error-screen-btn');
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveClass('error-screen-btn', 'error-screen-btn--primary');
  });
});
