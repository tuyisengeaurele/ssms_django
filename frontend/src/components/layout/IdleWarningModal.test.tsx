import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import IdleWarningModal from './IdleWarningModal';

function show(secondsLeft = 60, open = true) {
  const onStay = vi.fn();
  const onSignOut = vi.fn();
  const view = render(
    <LanguageProvider>
      <IdleWarningModal open={open} secondsLeft={secondsLeft} onStay={onStay} onSignOut={onSignOut} />
    </LanguageProvider>,
  );
  const again = (left: number) =>
    view.rerender(
      <LanguageProvider>
        <IdleWarningModal open secondsLeft={left} onStay={onStay} onSignOut={onSignOut} />
      </LanguageProvider>,
    );
  return { ...view, onStay, onSignOut, again };
}

beforeEach(() => {
  localStorage.clear();
  setReducedMotion(true);
});

describe('IdleWarningModal', () => {
  it('is an alert dialog, so a screen reader reads it at once', () => {
    show();
    expect(screen.getByRole('alertdialog', { name: 'Are you still there?' })).toBeInTheDocument();
  });

  it('shows nothing while closed', () => {
    show(60, false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('says how long is left and asks the question', () => {
    show(42);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('You will be signed out in 42 seconds because nobody used this page. Stay signed in?')).toBeInTheDocument();
  });

  it('says one second in the singular', () => {
    show(1);
    expect(screen.getByText(/in 1 second because/)).toBeInTheDocument();
  });

  it('puts the focus on Stay signed in, so Enter keeps the person signed in', () => {
    show();
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toHaveFocus();
  });

  it('keeps the person signed in with the button, and with Escape', () => {
    const { onStay } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    expect(onStay).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onStay).toHaveBeenCalledTimes(2);
  });

  it('signs out at once when asked', () => {
    const { onSignOut, onStay } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onStay).not.toHaveBeenCalled();
  });

  it('announces the countdown politely, every 10 seconds, not every second', () => {
    const { again } = show(60);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('60 seconds left before you are signed out.');
    again(59);
    expect(live).toHaveTextContent('60 seconds left before you are signed out.');
    act(() => again(50));
    expect(live).toHaveTextContent('50 seconds left before you are signed out.');
  });

  it('hides the ticking number from screen readers', () => {
    show(30);
    expect(screen.getByText('30').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('speaks French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    show(30);
    expect(screen.getByRole('alertdialog', { name: 'Êtes-vous toujours là ?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rester connecté' })).toBeInTheDocument();
    expect(screen.getByText(/dans 30 secondes/)).toBeInTheDocument();
  });

  it('speaks Kinyarwanda', () => {
    localStorage.setItem('ssms_locale', 'rw');
    show(30);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByText('Are you still there?')).not.toBeInTheDocument();
    expect(screen.getAllByText(/30/).length).toBeGreaterThan(0);
  });
});
