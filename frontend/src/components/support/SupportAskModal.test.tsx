import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { User } from '../../types';
import SupportAskModal from './SupportAskModal';

const aline = { id: 'p1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER' } as User;
const GOOD = 'Please look at my batch list';

function open(props: Partial<React.ComponentProps<typeof SupportAskModal>> = {}) {
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <LanguageProvider>
      <SupportAskModal open person={aline} onClose={onClose} onSubmit={onSubmit} {...props} />
    </LanguageProvider>,
  );
  return { onClose, onSubmit };
}

const reason = () => screen.getByLabelText('Reason') as HTMLTextAreaElement;
const send = () => screen.getByRole('button', { name: 'Send the request' });

beforeEach(() => {
  localStorage.clear();
});

describe('Ask for support access', () => {
  it('names the person in the title and puts the focus on the reason', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Ask Aline Uwase for support access' })).toBeInTheDocument();
    expect(reason()).toHaveFocus();
  });

  it('tells the admin that the person will read the reason', () => {
    open();
    expect(screen.getByText(/Aline Uwase will read this/)).toBeInTheDocument();
  });

  it('keeps Send off until the reason has 10 characters', () => {
    open();
    expect(send()).toBeDisabled();
    fireEvent.change(reason(), { target: { value: 'too short' } });
    expect(send()).toBeDisabled();
    fireEvent.change(reason(), { target: { value: 'ten chars!!' } });
    expect(send()).toBeEnabled();
  });

  it('does not count spaces as a reason', () => {
    open();
    fireEvent.change(reason(), { target: { value: '            ' } });
    expect(send()).toBeDisabled();
  });

  it('counts the characters and stops at 300', () => {
    open();
    fireEvent.change(reason(), { target: { value: GOOD } });
    expect(screen.getByText(`${GOOD.length} of 300`)).toBeInTheDocument();
    expect(reason()).toHaveAttribute('maxlength', '300');
  });

  it('starts at 30 minutes and view only, in two labelled groups', () => {
    open();
    const length = screen.getByRole('group', { name: 'How long' });
    const mode = screen.getByRole('group', { name: 'What you may do' });
    expect(screen.getByRole('radio', { name: '30 minutes' })).toBeChecked();
    expect(length.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'View only' })).toBeChecked();
    expect(mode.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  });

  it('sends the reason, the length and the mode that were chosen', async () => {
    const { onSubmit } = open();
    fireEvent.change(reason(), { target: { value: `  ${GOOD}  ` } });
    fireEvent.click(screen.getByRole('radio', { name: '60 minutes' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Ask to make changes as well' }));
    fireEvent.click(send());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ reason: GOOD, minutes: 60, mode: 'edit' }));
  });

  it('shows why it failed and stays open, so the reason is not lost', async () => {
    const { onSubmit, onClose } = open();
    onSubmit.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: 'You already have an open support request.' } } });
    fireEvent.change(reason(), { target: { value: GOOD } });
    fireEvent.click(send());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(reason().value).toBe(GOOD);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape and on Cancel, and starts clean when it opens again', () => {
    const { onClose } = open();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows nothing when it is closed', () => {
    open({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
