import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ options: vi.fn(), ask: vi.fn() }));
vi.mock('../../services/cooperativeRequest.service', () => ({ cooperativeRequestService: api }));

import CooperativeRequestModal from './CooperativeRequestModal';

const sent = { id: 'r1', status: 'requested', reason: 'x', from: { id: 'c1', name: 'Old Coop' }, to: { id: 'c2', name: 'New Coop' }, decisionNote: '', createdAt: '2026-11-23T10:00:00Z', decidedAt: null };
const onClose = vi.fn();
const onSent = vi.fn();

function open() {
  return render(
    <LanguageProvider>
      <CooperativeRequestModal open currentCooperativeId="c1" onClose={onClose} onSent={onSent} />
    </LanguageProvider>,
  );
}
const choice = () => screen.getByLabelText('Cooperative you want to join') as HTMLSelectElement;
const reason = () => screen.getByLabelText(/Why do you want to change\?/);
const send = () => screen.getByRole('button', { name: 'Send request' });

function refused(code: string, message: string, status = 409) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { code, message } } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.options.mockResolvedValue({ data: { data: [{ id: 'c1', name: 'Old Coop' }, { id: 'c2', name: 'New Coop' }, { id: 'c3', name: 'Third Coop' }] } });
  api.ask.mockResolvedValue({ data: { data: sent } });
});

describe('The change cooperative modal', () => {
  it('is a dialog that says the SSMS team decides', async () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Ask to change cooperative' })).toBeInTheDocument();
    expect(screen.getByText(/The SSMS team decides/)).toBeInTheDocument();
    await waitFor(() => expect(choice()).toBeEnabled());
  });

  it('lists the other cooperatives by name, without the one the person is in, and a way to leave', async () => {
    open();
    await screen.findByRole('option', { name: 'New Coop' });
    const names = Array.from(choice().options).map((o) => o.textContent);
    expect(names).toEqual(['Choose', 'New Coop', 'Third Coop', 'No cooperative (leave mine)']);
  });

  it('keeps Send request off until a choice and a reason exist', async () => {
    open();
    await screen.findByRole('option', { name: 'New Coop' });
    expect(send()).toBeDisabled();
    fireEvent.change(choice(), { target: { value: 'c2' } });
    expect(send()).toBeDisabled();
    fireEvent.change(reason(), { target: { value: '   ' } });
    expect(send()).toBeDisabled();
    fireEvent.change(reason(), { target: { value: 'My farm is closer.' } });
    expect(send()).toBeEnabled();
  });

  it('counts the reason and stops at 500 characters', async () => {
    open();
    await screen.findByRole('option', { name: 'New Coop' });
    expect(reason()).toHaveAttribute('maxlength', '500');
    fireEvent.change(reason(), { target: { value: 'abcde' } });
    expect(screen.getByText('5 of 500')).toBeInTheDocument();
  });

  it('sends the cooperative and the reason, then tells the page', async () => {
    open();
    await screen.findByRole('option', { name: 'New Coop' });
    fireEvent.change(choice(), { target: { value: 'c2' } });
    fireEvent.change(reason(), { target: { value: '  My farm is closer.  ' } });
    fireEvent.click(send());
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(sent));
    expect(api.ask).toHaveBeenCalledWith({ toCooperativeId: 'c2', reason: 'My farm is closer.' });
  });

  it('asks to leave with an empty cooperative', async () => {
    open();
    await screen.findByRole('option', { name: 'New Coop' });
    fireEvent.change(choice(), { target: { value: '__none__' } });
    fireEvent.change(reason(), { target: { value: 'I stopped rearing.' } });
    fireEvent.click(send());
    await waitFor(() => expect(api.ask).toHaveBeenCalledWith({ toCooperativeId: null, reason: 'I stopped rearing.' }));
  });

  it('shows a refusal as a plain message and keeps what was typed', async () => {
    api.ask.mockRejectedValue(refused('coop_request_open', 'You already have a request waiting. Withdraw it to ask again.'));
    open();
    await screen.findByRole('option', { name: 'New Coop' });
    fireEvent.change(choice(), { target: { value: 'c2' } });
    fireEvent.change(reason(), { target: { value: 'My farm is closer.' } });
    fireEvent.click(send());
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a request waiting.');
    expect(reason()).toHaveValue('My farm is closer.');
    expect(onSent).not.toHaveBeenCalled();
  });

  it('says so when the cooperatives cannot be loaded', async () => {
    api.options.mockRejectedValue(new Error('offline'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the cooperatives');
  });

  it('closes with Escape', async () => {
    open();
    await screen.findByRole('option', { name: 'New Coop' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
