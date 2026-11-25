import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import ConfirmModal from './ConfirmModal';

const onConfirm = vi.fn();
const onClose = vi.fn();

function show(props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) {
  return render(
    <LanguageProvider>
      <ConfirmModal open title="Withdraw your request?" confirmLabel="Withdraw" onConfirm={onConfirm} onClose={onClose} {...props}>
        {props.children}
      </ConfirmModal>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
});

describe('the confirmation', () => {
  it('asks in a dialog with a Keep button and a red button with an icon for the action', async () => {
    show();
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw your request?' });
    expect(within(dialog).getByRole('button', { name: 'Keep' })).toHaveClass('btn', 'btn-secondary');
    const yes = within(dialog).getByRole('button', { name: 'Withdraw' });
    expect(yes).toHaveClass('btn', 'btn-danger');
    expect(yes.querySelector('svg')).not.toBeNull();
  });

  it('does nothing until the action is chosen', async () => {
    show();
    await screen.findByRole('dialog');
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes on Keep without acting', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the sentence under the title when there is one, and the label of Keep can be changed', async () => {
    show({ children: <p>You can ask again later.</p>, keepLabel: 'Cancel' });
    expect(await screen.findByText('You can ask again later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('cannot be pressed twice while it works', async () => {
    show({ busy: true });
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled();
  });
});
