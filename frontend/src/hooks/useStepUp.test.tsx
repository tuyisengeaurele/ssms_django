import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { setReducedMotion } from '../test/setup';

const mfa = vi.hoisted(() => ({ stepUp: vi.fn() }));
vi.mock('../services/mfa.service', () => ({ mfaService: mfa }));

import { useStepUp } from './useStepUp';

function refused(status: number, data: object) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status, data, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
  });
}
const needsCode = () => refused(403, { code: 'mfa_recent_required', message: 'Please confirm with a code from your authenticator app.' });

/** A page with one button that runs an action through the hook and shows how it ended. */
function Page({ action }: { action: () => Promise<string> }) {
  const { run, modal } = useStepUp();
  const [outcome, setOutcome] = useState('');
  return (
    <div>
      <button onClick={() => run(action).then((v) => setOutcome(`done:${v}`), (e: AxiosError) => setOutcome(`failed:${e.response?.status}`))}>Do it</button>
      <p data-testid="outcome">{outcome}</p>
      {modal}
    </div>
  );
}

const open = (action: () => Promise<string>) => render(<LanguageProvider><Page action={action} /></LanguageProvider>);
const press = () => fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
const outcome = () => screen.getByTestId('outcome');

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
});

describe('useStepUp', () => {
  it('runs a plain action once and never opens the prompt', async () => {
    const action = vi.fn().mockResolvedValue('ok');
    open(action);
    press();
    await waitFor(() => expect(outcome()).toHaveTextContent('done:ok'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes any other error straight on, without asking for a code', async () => {
    const action = vi.fn().mockRejectedValue(refused(404, { message: 'Not found' }));
    open(action);
    press();
    await waitFor(() => expect(outcome()).toHaveTextContent('failed:404'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('asks for a code when one is needed, and runs the action again after a right one', async () => {
    const action = vi.fn().mockRejectedValueOnce(needsCode()).mockResolvedValueOnce('saved');
    mfa.stepUp.mockResolvedValue({ data: { data: null } });
    open(action);
    press();
    expect(await screen.findByRole('dialog', { name: 'Confirm with a code' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('6 digit code'), { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(outcome()).toHaveTextContent('done:saved'));
    expect(mfa.stepUp).toHaveBeenCalledWith('123456');
    expect(action).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the prompt open with a plain message when the code is wrong, and does not run the action', async () => {
    const action = vi.fn().mockRejectedValueOnce(needsCode());
    mfa.stepUp.mockRejectedValue(refused(422, { message: "That code isn't right." }));
    open(action);
    press();
    fireEvent.change(await screen.findByLabelText('6 digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code isn't right");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    expect(outcome()).toHaveTextContent('');
  });

  it('hands the original error back when the person cancels, without running the action again', async () => {
    const action = vi.fn().mockRejectedValue(needsCode());
    open(action);
    press();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(outcome()).toHaveTextContent('failed:403'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(mfa.stepUp).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('asks only once: a second refusal after a good code is passed on, not asked again', async () => {
    const action = vi.fn().mockRejectedValue(needsCode());
    mfa.stepUp.mockResolvedValue({ data: { data: null } });
    open(action);
    press();
    fireEvent.change(await screen.findByLabelText('6 digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(outcome()).toHaveTextContent('failed:403'));
    expect(action).toHaveBeenCalledTimes(2);
    expect(mfa.stepUp).toHaveBeenCalledTimes(1);
  });

  it('can ask again for a later action', async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(needsCode()).mockResolvedValueOnce('first')
      .mockRejectedValueOnce(needsCode()).mockResolvedValueOnce('second');
    mfa.stepUp.mockResolvedValue({ data: { data: null } });
    open(action);
    for (const expected of ['done:first', 'done:second']) {
      press();
      fireEvent.change(await screen.findByLabelText('6 digit code'), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(outcome()).toHaveTextContent(expected));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  });

  it('asks in French when the person chose French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open(vi.fn().mockRejectedValue(needsCode()));
    press();
    expect(await screen.findByRole('dialog', { name: 'Confirmez avec un code' })).toBeInTheDocument();
  });
});
