import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import LoadError from './LoadError';

beforeEach(() => localStorage.clear());

const open = (onRetry = vi.fn()) => {
  render(<LanguageProvider><LoadError onRetry={onRetry} /></LanguageProvider>);
  return onRetry;
};

describe('LoadError', () => {
  it('says the page could not be loaded and is not mistaken for an empty list', () => {
    open();
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load this page. Check your connection and try again.');
  });

  it('offers Try again, which asks for the data once more', () => {
    const onRetry = open();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('speaks French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
