import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const base = { cooperativeId: null, cooperativeName: null, isEmailVerified: true, createdAt: '2026-05-01T10:00:00Z', updatedAt: '2026-05-01T10:00:00Z' };
const people = vi.hoisted(() => [
  { id: 'me', name: 'Auris Tuyisenge', email: 'auris@ssms.com', role: 'ADMIN', isActive: true },
  { id: 'a2', name: 'Other Admin', email: 'other@ssms.com', role: 'ADMIN', isActive: true },
  { id: 's1', name: 'Coop Supervisor', email: 'supervisor@ssms.com', role: 'SUPERVISOR', isActive: true, cooperativeId: 'c1', cooperativeName: 'Gatsibo 1' },
  { id: 'f1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', role: 'FARMER', isActive: true },
  { id: 'f2', name: 'Gad Anaclet', email: 'gad@ssms.com', role: 'FARMER', isActive: false },
]);

const api = vi.hoisted(() => ({ getUsers: vi.fn(), getCoops: vi.fn() }));
const support = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), cancel: vi.fn(), start: vi.fn() }));
const mfa = vi.hoisted(() => ({ resetFor: vi.fn(), stepUp: vi.fn() }));

vi.mock('../../services/admin.service', () => ({ adminService: api }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));
vi.mock('../../services/support.service', () => ({ supportService: support }));
vi.mock('../../services/cooperative.service', () => ({ cooperativeService: { getAll: api.getCoops } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: 'ADMIN' }, startActing: vi.fn() }) }));

import AdminUsersPage from './AdminUsersPage';

const GOOD = 'Please look at my batch list';
const requested = (id = 'r1') => ({
  data: { data: {
    id, status: 'requested', reason: GOOD, minutes: 30, requestedMode: 'view', grantedMode: '', person: { id: 'f1', name: 'Bruce Ishimwe' },
    requestedAt: '2026-11-06T10:00:00Z', decidedAt: null, startedAt: null, endsAt: null, endedBy: '', endedReason: '',
  } },
});
const needsCode = () => new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, {
  status: 403, data: { code: 'mfa_recent_required' }, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
});

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <AdminUsersPage />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getUsers.mockResolvedValue({ data: { data: people.map((p) => ({ ...base, ...p })) } });
  api.getCoops.mockResolvedValue({ data: { data: [] } });
  support.get.mockResolvedValue(requested());
});

const askFor = (name: string) => screen.queryByRole('button', { name: `Ask ${name} for support access` });

async function askBruce() {
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Ask Bruce Ishimwe for support access' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: GOOD } });
}

describe('Support access from the Users page', () => {
  it('offers it for an active farmer and an active supervisor', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    expect(askFor('Bruce Ishimwe')).toBeInTheDocument();
    expect(askFor('Coop Supervisor')).toBeInTheDocument();
  });

  it('does not offer it for an admin, for yourself, or for somebody whose account is off', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    expect(askFor('Other Admin')).not.toBeInTheDocument();
    expect(askFor('Auris Tuyisenge')).not.toBeInTheDocument();
    expect(askFor('Gad Anaclet')).not.toBeInTheDocument();
  });

  it('sends the request and waits for the person to answer', async () => {
    support.request.mockResolvedValue(requested());
    await askBruce();
    fireEvent.click(screen.getByRole('button', { name: 'Send the request' }));
    expect(await screen.findByRole('dialog', { name: 'Waiting for Bruce Ishimwe' })).toBeInTheDocument();
    expect(support.request).toHaveBeenCalledWith({ personId: 'f1', reason: GOOD, minutes: 30, mode: 'view' });
  });

  it('asks for a fresh code first when the server wants one, then sends the same request', async () => {
    support.request.mockRejectedValueOnce(needsCode()).mockResolvedValue(requested());
    mfa.stepUp.mockResolvedValue({ data: {} });
    await askBruce();
    fireEvent.click(screen.getByRole('button', { name: 'Send the request' }));
    expect(await screen.findByRole('dialog', { name: 'Confirm with a code' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('6 digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('dialog', { name: 'Waiting for Bruce Ishimwe' })).toBeInTheDocument();
    expect(mfa.stepUp).toHaveBeenCalledWith('123456');
    expect(support.request).toHaveBeenCalledTimes(2);
  });

  it('shows the server\'s reason and stays on the form when the request is refused', async () => {
    support.request.mockRejectedValue(new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409, data: { message: 'You already have an open support request.' }, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
    }));
    await askBruce();
    fireEvent.click(screen.getByRole('button', { name: 'Send the request' }));
    expect(await screen.findByText('You already have an open support request.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Waiting for Bruce Ishimwe' })).not.toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe(GOOD));
  });
});
