import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

function open(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  render(
    <Modal open onClose={onClose} title="A question" {...props}>
      <button type="button">Answer</button>
    </Modal>,
  );
  return onClose;
}

describe('A dialog that may not be dismissed', () => {
  it('can be dismissed by default: the close button, Escape and a click outside all close it', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('has no close button, and ignores Escape and a click outside, when dismissible is off', () => {
    const onClose = open({ dismissible: false });
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'A question' })).toBeInTheDocument();
  });
});
