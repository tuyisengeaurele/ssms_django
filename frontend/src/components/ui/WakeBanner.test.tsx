import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setWaiting } from '../../services/wake';
import WakeBanner from './WakeBanner';

const open = () => render(<LanguageProvider><WakeBanner /></LanguageProvider>);

beforeEach(() => {
  localStorage.clear();
  setWaiting(false);
});
afterEach(() => setWaiting(false));

describe('WakeBanner', () => {
  it('shows nothing while the server answers', () => {
    open();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says the server is waking up while the page waits, and goes away when it answers', () => {
    open();
    act(() => setWaiting(true));
    expect(screen.getByRole('status')).toHaveTextContent(/waking up/i);
    act(() => setWaiting(false));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('speaks the language the person chose', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    act(() => setWaiting(true));
    expect(screen.getByRole('status')).toHaveTextContent(/se réveille/i);
  });
});
