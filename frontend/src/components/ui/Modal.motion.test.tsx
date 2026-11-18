import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

// A dialog that closes stays on screen, marked as leaving, while its leaving animation plays (the CSS reacts to data-leaving),
// and then goes. While it leaves it cannot be answered: the stylesheet turns off its pointer events, and the keyboard
// handlers are already off because the dialog is no longer open.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const view = (open: boolean, onClose = () => {}) => (
  <Modal open={open} onClose={onClose} title="Question">
    <p>Body</p>
  </Modal>
);

describe('a dialog and its leaving animation', () => {
  it('is not in the page while it has never been open', () => {
    render(view(false));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is in the page and not leaving while open', () => {
    render(view(true));
    expect(screen.getByRole('dialog').closest('.modal-overlay')).not.toHaveAttribute('data-leaving');
  });

  it('stays, marked as leaving, for a moment after it closes, then goes', () => {
    const { rerender } = render(view(true));
    rerender(view(false));
    expect(screen.getByRole('dialog').closest('.modal-overlay')).toHaveAttribute('data-leaving');
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('gives the page its scroll back at once, not when the animation ends', () => {
    const { rerender } = render(view(true));
    expect(document.body.style.overflow).toBe('hidden');
    rerender(view(false));
    expect(document.body.style.overflow).toBe('');
  });

  it('ignores Escape while it leaves', () => {
    const onClose = vi.fn();
    const { rerender } = render(view(true, onClose));
    rerender(view(false, onClose));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is back, not leaving, when it opens again during the animation', () => {
    const { rerender } = render(view(true));
    rerender(view(false));
    rerender(view(true));
    expect(screen.getByRole('dialog').closest('.modal-overlay')).not.toHaveAttribute('data-leaving');
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
