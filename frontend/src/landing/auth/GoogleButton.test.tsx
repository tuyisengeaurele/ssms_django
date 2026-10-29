import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import GoogleButton from './GoogleButton';

const open = (submit = vi.fn()) =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <form onSubmit={submit}>
          <button type="submit">Send</button>
        </form>
        <GoogleButton />
      </LanguageProvider>
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());

describe('Continue with Google', () => {
  it('is a button with the words Continue with Google', () => {
    open();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('is set off from the form by a separator that says "or"', () => {
    open();
    const separator = screen.getByRole('separator');
    expect(separator).toHaveTextContent('or');
  });

  it('draws the Google mark, and leaves it out of what a screen reader says', () => {
    open();
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    const mark = button.querySelector('svg');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });

  it('says plainly that it does not work yet when it is pressed', () => {
    open();
    expect(screen.queryByText('Sign in with Google is not available yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sign in with Google is not available yet.');
  });

  it('does nothing else when it is pressed: no request, no navigation', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
    fetchSpy.mockRestore();
  });

  it('is not a submit button, so it never sends a form', () => {
    const submit = vi.fn((e) => e.preventDefault());
    open(submit);
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(submit).not.toHaveBeenCalled();
  });

  it('is written in French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByRole('button', { name: 'Continuer avec Google' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toHaveTextContent('ou');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer avec Google' }));
    expect(screen.getByRole('status')).toHaveTextContent("La connexion avec Google n'est pas encore disponible.");
  });

  it('is written in Kinyarwanda', () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument();
    expect(screen.getByRole('separator')).not.toHaveTextContent('or');
  });
});
