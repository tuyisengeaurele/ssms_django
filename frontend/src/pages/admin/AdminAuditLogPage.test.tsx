import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const entries = vi.hoisted(() => [
  { id: 3, userName: 'Auris Tuyisenge', userEmail: 'auris@ssms.com', action: 'LOGIN', resource: 'User', resourceId: '12', detail: 'Login: auris@ssms.com', ipAddress: '127.0.0.1', createdAt: '2026-10-08T12:30:00Z' },
  { id: 2, userName: 'Bruce Ishimwe', userEmail: 'bruce@gmail.com', action: 'CREATE', resource: 'Farm', resourceId: '7', detail: 'Created farm', ipAddress: null, createdAt: '2026-10-07T08:00:00Z' },
  { id: 1, userName: '', userEmail: '', action: 'DELETE', resource: 'Batch', resourceId: '', detail: '', ipAddress: '10.0.0.4', createdAt: '2026-10-06T08:00:00Z' },
]);

const meta = (page: number, totalPages = 1) => ({ page, pageSize: 25, totalItems: 3, totalPages, hasNext: page < totalPages, hasPrev: page > 1 });
const api = vi.hoisted(() => ({ getList: vi.fn(), exportCsv: vi.fn() }));
vi.mock('../../services/admin.service', () => ({ auditLogService: api }));

import AdminAuditLogPage from './AdminAuditLogPage';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AdminAuditLogPage />
      </ToastProvider>
    </LanguageProvider>,
  );
}

// The toast list loads on the first toast. Load it once up front so a busy machine cannot make a test time out.
beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getList.mockResolvedValue({ data: { data: entries, pagination: meta(1) } });
  api.exportCsv.mockResolvedValue(undefined);
});

describe('Audit log page', () => {
  it('has one title and counts the recorded events', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument();
    expect(await screen.findByText('3 recorded events.')).toBeInTheDocument();
  });

  it('shows who did what, to what, and when', async () => {
    open();
    const row = (await screen.findByText('Bruce Ishimwe')).closest('tr') as HTMLElement;
    expect(within(row).getByText('bruce@gmail.com')).toBeInTheDocument();
    expect(within(row).getByText('Created')).toBeInTheDocument();
    expect(within(row).getByText('Farm #7')).toBeInTheDocument();
    expect(within(row).getByText('Created farm')).toBeInTheDocument();
  });

  it('shortens a long record id and keeps the full one on hover', async () => {
    api.getList.mockResolvedValue({
      data: { data: [{ ...entries[0], id: 9, resource: 'Farm', resourceId: 'c19fc78d82c0zvkmoshytvr3vsma' }], pagination: meta(1) },
    });
    open();
    const cell = await screen.findByText('Farm #…r3vsma');
    expect(cell).toHaveAttribute('title', 'c19fc78d82c0zvkmoshytvr3vsma');
  });

  it('says event in the singular for one event', async () => {
    api.getList.mockResolvedValue({ data: { data: [entries[0]], pagination: { ...meta(1), totalItems: 1 } } });
    open();
    expect(await screen.findByText('1 recorded event.')).toBeInTheDocument();
  });

  it('names the panel by what it holds, not by the page title', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    expect(screen.getByRole('heading', { level: 2, name: 'Recent activity' })).toBeInTheDocument();
  });

  it('uses plain words for actions and a dash-free fallback for missing details', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Signed in')).toBeInTheDocument();
    expect(table.getByText('Deleted')).toBeInTheDocument();
    expect(table.getByText('System')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']'));
  });

  it('loads the list once and only filters when asked', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    expect(api.getList).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by email or detail' }), { target: { value: 'bruce' } });
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'Farm' } });
    expect(api.getList).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() => expect(api.getList).toHaveBeenLastCalledWith({ page: 1, action: '', resource: 'Farm', search: 'bruce' }));
  });

  it('filters by action straight away', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'LOGIN' } });
    await waitFor(() => expect(api.getList).toHaveBeenLastCalledWith({ page: 1, action: 'LOGIN', resource: '', search: '' }));
  });

  it('clears every filter', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'Farm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() => expect(api.getList).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(api.getList).toHaveBeenLastCalledWith({ page: 1, action: '', resource: '', search: '' }));
    expect((screen.getByLabelText('Resource') as HTMLInputElement).value).toBe('');
  });

  it('moves between pages', async () => {
    api.getList.mockResolvedValue({ data: { data: entries, pagination: meta(1, 3) } });
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.getList).toHaveBeenLastCalledWith({ page: 2, action: '', resource: '', search: '' }));
  });

  it('downloads the CSV with the current filters and says so', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith({ action: '', resource: '', search: '' }));
    expect(await screen.findByText('Your CSV file is ready.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('tells the person kindly when the export fails', async () => {
    api.exportCsv.mockRejectedValue(new Error('x'));
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText("We couldn't create the file. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    api.getList.mockResolvedValue({ data: { data: [], pagination: { ...meta(1), totalItems: 0 } } });
    open();
    expect(await screen.findByText('No events found')).toBeInTheDocument();
    expect(screen.getByText('Try a different search, or clear the filters.')).toBeInTheDocument();
  });

  it('shows a calm message when the log cannot be loaded', async () => {
    api.getList.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the audit log. Please try again.");
  });
});
