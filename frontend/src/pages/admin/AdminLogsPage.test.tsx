import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const rows = vi.hoisted(() => ({
  security: [
    { id: 2, createdAt: '2026-11-04T12:30:00Z', kind: 'lockout', label: 'Account locked for a while', userEmail: '', ipAddress: '203.0.113.9', requestId: 'BBBB33334444', detail: 'x@example.rw' },
    { id: 1, createdAt: '2026-11-04T08:00:00Z', kind: 'login_ok', label: 'Signed in', userEmail: 'auris@ssms.com', ipAddress: '127.0.0.1', requestId: 'AAAA11112222', detail: 'Chrome on Windows' },
  ],
  requests: [
    { id: 3, createdAt: '2026-11-04T12:30:00Z', requestId: 'CCCC55556666', method: 'GET', route: 'api/lots/<str:token>', status: 500, durationMs: 212, role: '', ipAddress: '203.0.113.9' },
    { id: 2, createdAt: '2026-11-04T12:00:00Z', requestId: 'AAAA11112222', method: 'POST', route: 'api/auth/login', status: 401, durationMs: 31, role: '', ipAddress: '127.0.0.1' },
  ],
  jobs: [
    { id: 2, createdAt: '2026-11-04T12:30:00Z', kind: 'email_failed', subject: 'Welcome to SSMS', detail: 'SMTPException', requestId: 'AAAA11112222' },
    { id: 1, createdAt: '2026-11-04T08:00:00Z', kind: 'device_offline', subject: 'DHT22 A', detail: 'No reading for 30 minutes', requestId: '' },
  ],
}));

const meta = (total = 2, page = 1, totalPages = 1) => ({ page, pageSize: 25, totalItems: total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 });
const api = vi.hoisted(() => ({ list: vi.fn(), exportCsv: vi.fn() }));
vi.mock('../../services/logs.service', () => ({ logsService: api }));

// The audit stream is the page that was already here. It has its own tests, so here it is only a marker.
vi.mock('./AdminAuditLogPage', () => ({ default: () => <p>Audit log table</p> }));

import AdminLogsPage from './AdminLogsPage';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function open(path = '/admin/system/logs') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/admin/system/logs" element={<AdminLogsPage />} />
          </Routes>
          <Where />
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
  api.list.mockImplementation((stream: 'security' | 'requests' | 'jobs') => Promise.resolve({ data: { data: rows[stream], pagination: meta(rows[stream].length) } }));
  api.exportCsv.mockResolvedValue(undefined);
});

const streams = () => within(screen.getByRole('navigation', { name: 'Log streams' })).getAllByRole('button');

describe('The Logs page', () => {
  it('offers the four streams and opens on the audit log', () => {
    open();
    expect(streams().map((b) => b.textContent)).toEqual(['Audit', 'Security', 'Requests', 'Jobs and devices']);
    expect(streams()[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Audit log table')).toBeInTheDocument();
    expect(api.list).not.toHaveBeenCalled();
  });

  it('opens on the stream named in the address, so a link can point at one', async () => {
    open('/admin/system/logs?stream=security');
    expect(await screen.findByText('Account locked for a while')).toBeInTheDocument();
    expect(streams()[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a stream it does not know', () => {
    open('/admin/system/logs?stream=passwords');
    expect(screen.getByText('Audit log table')).toBeInTheDocument();
  });

  it('switches stream and keeps it in the address', async () => {
    open();
    fireEvent.click(streams()[2]);
    expect(await screen.findByText('api/lots/<str:token>')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?stream=requests');
    fireEvent.click(streams()[0]);
    expect(screen.getByText('Audit log table')).toBeInTheDocument();
    expect(screen.getByTestId('where')).not.toHaveTextContent('stream=');
  });
});

describe('The security stream', () => {
  const show = () => open('/admin/system/logs?stream=security');

  it('lists what happened, to whom, from where and with which reference', async () => {
    show();
    const row = (await screen.findByText('auris@ssms.com')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Signed in')).toBeInTheDocument();
    expect(within(row).getByText('127.0.0.1')).toBeInTheDocument();
    expect(within(row).getByText('Chrome on Windows')).toBeInTheDocument();
    expect(within(row).getByText('AAAA11112222')).toBeInTheDocument();
  });

  it('counts the entries', async () => {
    show();
    expect(await screen.findByText('2 entries.')).toBeInTheDocument();
  });

  it('filters by kind, at once', async () => {
    show();
    await screen.findByText('Signed in');
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'lockout' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('security', expect.objectContaining({ kind: 'lockout' })));
  });

  it('finds one reference', async () => {
    show();
    await screen.findByText('Signed in');
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'AAAA11112222' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('security', expect.objectContaining({ reference: 'AAAA11112222' })));
  });

  it('filters by a range of days', async () => {
    show();
    await screen.findByText('Signed in');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('security', expect.objectContaining({ from: '2026-11-01' })));
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-04' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('security', expect.objectContaining({ from: '2026-11-01', to: '2026-11-04' })));
  });

  it('clears every filter in one go', async () => {
    show();
    await screen.findByText('Signed in');
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'lockout' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('security', expect.objectContaining({ kind: '' })));
  });

  it('says so when nothing matches', async () => {
    api.list.mockResolvedValue({ data: { data: [], pagination: meta(0) } });
    show();
    expect(await screen.findByText('Nothing here')).toBeInTheDocument();
  });

  it('says so when it cannot load, and tries again', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load this log.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Signed in')).toBeInTheDocument();
  });

  it('exports with the filters on screen', async () => {
    show();
    await screen.findByText('Signed in');
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'lockout' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('security', expect.objectContaining({ kind: 'lockout' })));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith('security', expect.objectContaining({ kind: 'lockout' })));
    expect(await screen.findByText('The log was exported.')).toBeInTheDocument();
  });

  it('tells the person when the export fails', async () => {
    api.exportCsv.mockRejectedValue(new Error('no'));
    show();
    await screen.findByText('Signed in');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText("We couldn't export the log. Please try again.")).toBeInTheDocument();
  });

  it('moves between pages', async () => {
    api.list.mockResolvedValue({ data: { data: rows.security, pagination: meta(60, 1, 3) } });
    show();
    await screen.findByText('Signed in');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('security', expect.objectContaining({ page: 2 })));
  });
});

describe('The requests stream', () => {
  const show = () => open('/admin/system/logs?stream=requests');

  it('shows the method, the route pattern, the status, the time and the reference', async () => {
    show();
    const row = (await screen.findByText('api/lots/<str:token>')).closest('tr') as HTMLElement;
    expect(within(row).getByText('GET')).toBeInTheDocument();
    expect(within(row).getByText('500')).toBeInTheDocument();
    expect(within(row).getByText('212 ms')).toBeInTheDocument();
    expect(within(row).getByText('CCCC55556666')).toBeInTheDocument();
  });

  it('filters by the class of status and by route', async () => {
    show();
    await screen.findByText('api/auth/login');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '5xx' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('requests', expect.objectContaining({ status: '5xx' })));
    fireEvent.change(screen.getByLabelText('Route'), { target: { value: 'api/lots' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('requests', expect.objectContaining({ status: '5xx', route: 'api/lots' })));
  });
});

describe('The jobs stream', () => {
  it('shows what kind of thing happened, to what, and the detail', async () => {
    open('/admin/system/logs?stream=jobs');
    const row = (await screen.findByText('Welcome to SSMS')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Mail not sent')).toBeInTheDocument();
    expect(within(row).getByText('SMTPException')).toBeInTheDocument();
    const other = screen.getByText('DHT22 A').closest('tr') as HTMLElement;
    expect(within(other).getByText('Device went quiet')).toBeInTheDocument();
  });

  it('never cuts the detail with dots: it wraps', async () => {
    open('/admin/system/logs?stream=jobs');
    const cell = (await screen.findByText('SMTPException')).closest('td') as HTMLElement;
    expect(cell).toHaveClass('cell-detail');
    expect(cell).not.toHaveClass('cell-trim');
  });
});

describe('In French', () => {
  it('names the streams and the columns', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open('/admin/system/logs?stream=security');
    expect(await screen.findByRole('navigation', { name: 'Flux de journaux' })).toBeInTheDocument();
    expect(screen.getByLabelText('Référence')).toBeInTheDocument();
    const row = (await screen.findByText('auris@ssms.com')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Connexion réussie')).toBeInTheDocument();
  });
});
