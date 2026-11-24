import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const api = vi.hoisted(() => ({ confirmEmailChange: vi.fn(), undoEmailChange: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: api }));

import ConfirmEmailChangePage from './ConfirmEmailChangePage';
import UndoEmailChangePage from './UndoEmailChangePage';

function open(path: string, page: JSX.Element, route: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider>
          <Routes>
            <Route path={route} element={page} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

function refused(code: string, message: string) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 400, data: { code, message } } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.confirmEmailChange.mockResolvedValue({ data: { data: null } });
  api.undoEmailChange.mockResolvedValue({ data: { data: null } });
});

describe('The page behind the link that confirms a new email', () => {
  const page = () => open('/confirm-email-change?token=abc:def', <ConfirmEmailChangePage />, '/confirm-email-change');

  it('opens the link once, even when the page is drawn twice, and says the address changed', async () => {
    page();
    expect(await screen.findByRole('heading', { level: 1, name: 'Email changed' })).toBeInTheDocument();
    expect(api.confirmEmailChange).toHaveBeenCalledTimes(1);
    expect(api.confirmEmailChange).toHaveBeenCalledWith('abc:def');
    expect(screen.getByText(/Sign in with your new address/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('says in plain words why a link could not be used, in the language of the screen', async () => {
    api.confirmEmailChange.mockRejectedValue(refused('link_expired', 'This link expired. Ask for a new one.'));
    page();
    expect(await screen.findByRole('heading', { level: 1, name: 'We could not use this link' })).toBeInTheDocument();
    expect(screen.getByText('This link expired. Ask for a new one.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('writes the refusal from the code in French, whatever language the answer came in', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    api.confirmEmailChange.mockRejectedValue(refused('link_used', 'This link was already used, or is no longer needed.'));
    page();
    expect(await screen.findByText("Ce lien a déjà été utilisé ou n'est plus nécessaire.")).toBeInTheDocument();
  });

  it('does not call the server when the address has no token', async () => {
    open('/confirm-email-change', <ConfirmEmailChangePage />, '/confirm-email-change');
    expect(await screen.findByRole('heading', { level: 1, name: 'We could not use this link' })).toBeInTheDocument();
    expect(api.confirmEmailChange).not.toHaveBeenCalled();
    expect(screen.getByText('This link is not valid. Ask for a new one.')).toBeInTheDocument();
  });

  it('shows a waiting state first', () => {
    api.confirmEmailChange.mockReturnValue(new Promise(() => undefined));
    page();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('is written in Kinyarwanda with no English left on it', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    const { container } = page();
    await screen.findByRole('link', { name: /Injira|Kwinjira/i });
    expect(container.textContent).not.toMatch(/Your email address|Please sign in|Sign in/);
  });
});

describe('The page behind the link that undoes a change of email', () => {
  const page = () => open('/undo-email-change?token=xyz:123', <UndoEmailChangePage />, '/undo-email-change');

  it('opens the link once and says the old address is back and a password link was sent', async () => {
    page();
    expect(await screen.findByRole('heading', { level: 1, name: 'The change was undone' })).toBeInTheDocument();
    expect(api.undoEmailChange).toHaveBeenCalledTimes(1);
    expect(api.undoEmailChange).toHaveBeenCalledWith('xyz:123');
    expect(screen.getByText(/set a new password/)).toBeInTheDocument();
  });

  it('says when the old address is taken, in plain words', async () => {
    api.undoEmailChange.mockRejectedValue(refused('undo_blocked', 'Another account uses that address, so this cannot be undone. Contact the SSMS team.'));
    page();
    expect(await screen.findByText(/Another account uses that address/)).toBeInTheDocument();
  });

  it('does not call the server when the address has no token', async () => {
    open('/undo-email-change', <UndoEmailChangePage />, '/undo-email-change');
    expect(await screen.findByRole('heading', { level: 1, name: 'We could not use this link' })).toBeInTheDocument();
    expect(api.undoEmailChange).not.toHaveBeenCalled();
  });
});
