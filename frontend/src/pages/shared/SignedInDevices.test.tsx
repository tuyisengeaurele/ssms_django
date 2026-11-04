import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn() }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: api }));

import SignedInDevices from './SignedInDevices';

const laptop = {
  id: 'one', deviceLabel: 'Chrome on Windows', browser: 'Chrome', os: 'Windows', isInstalledApp: false,
  createdAt: '2026-10-20T08:00:00Z', lastUsedAt: '2026-10-30T09:15:00Z', isCurrent: true,
};
const phone = {
  ...laptop, id: 'two', deviceLabel: 'Chrome on Pixel 9', browser: 'Chrome', os: 'Android',
  lastUsedAt: '2026-10-29T18:00:00Z', isCurrent: false,
};
const tablet = { ...laptop, id: 'three', deviceLabel: 'Safari on iPad', isCurrent: false };

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <SignedInDevices />
      </ToastProvider>
    </LanguageProvider>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.list.mockResolvedValue({ data: { data: [laptop, phone, tablet] } });
  api.revoke.mockResolvedValue({ data: { data: null } });
  api.revokeOthers.mockResolvedValue({ data: { data: { revoked: 2 } } });
});

describe('Signed in devices', () => {
  it('lists every device by the browser and system it signed in from', async () => {
    open();
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByText('Chrome on Pixel 9')).toBeInTheDocument();
    expect(screen.getByText('Safari on iPad')).toBeInTheDocument();
  });

  it('says which devices were signed in as a shared computer', async () => {
    api.list.mockResolvedValue({ data: { data: [{ ...laptop, isSharedDevice: false }, { ...phone, isSharedDevice: true }] } });
    open();
    const row = (await screen.findByText('Chrome on Pixel 9')).closest('li') as HTMLElement;
    expect(within(row).getByText('Shared computer')).toBeInTheDocument();
    const own = screen.getByText('Chrome on Windows').closest('li') as HTMLElement;
    expect(within(own).queryByText('Shared computer')).not.toBeInTheDocument();
  });

  it('has no way to rename a device', async () => {
    open();
    await screen.findByText('Chrome on Windows');
    expect(screen.queryByRole('button', { name: /Rename/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name for this device')).not.toBeInTheDocument();
  });

  it('never shows an address, even if the server were to send one', async () => {
    open();
    await screen.findByText('Chrome on Windows');
    expect(screen.queryByText(/Address/)).not.toBeInTheDocument();
    expect(screen.queryByText(/41\.186/)).not.toBeInTheDocument();
  });

  it('says in words which one is this device, and offers it no sign out', async () => {
    open();
    const row = (await screen.findByText('Chrome on Windows')).closest('li') as HTMLElement;
    expect(within(row).getByText('This device')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Sign out/ })).not.toBeInTheDocument();
    const other = screen.getByText('Chrome on Pixel 9').closest('li') as HTMLElement;
    expect(within(other).getByRole('button', { name: 'Sign out Chrome on Pixel 9' })).toBeInTheDocument();
  });

  it('asks before signing a device out, and does nothing on cancel', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Chrome on Pixel 9' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign out this device?' });
    expect(within(dialog).getByText(/Chrome on Pixel 9 will be signed out/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.revoke).not.toHaveBeenCalled();
    expect(screen.getByText('Chrome on Pixel 9')).toBeInTheDocument();
  });

  it('signs the device out on confirm and takes it off the list', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Chrome on Pixel 9' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('two'));
    await waitFor(() => expect(screen.queryByText('Chrome on Pixel 9')).not.toBeInTheDocument());
    expect(await screen.findByText('Device signed out.')).toBeInTheDocument();
  });

  it('signs out all the other devices after a question', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign out all other devices?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out all' }));
    await waitFor(() => expect(api.revokeOthers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Chrome on Pixel 9')).not.toBeInTheDocument());
    expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
  });

  it('does not offer to sign out the others when there are none', async () => {
    api.list.mockResolvedValue({ data: { data: [laptop] } });
    open();
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out all other devices' })).not.toBeInTheDocument();
    expect(screen.getByText('No other devices are signed in.')).toBeInTheDocument();
  });

  it('says so when the devices cannot be loaded, and lets the person try again', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your devices.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
  });

  it('keeps the device on the list when signing it out fails', async () => {
    api.revoke.mockRejectedValueOnce(new Error('offline'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Chrome on Pixel 9' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Chrome on Pixel 9')).toBeInTheDocument();
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByText('Appareils connectés')).toBeInTheDocument();
    expect(screen.getByText('Cet appareil')).toBeInTheDocument();
  });

  it('reads in Kinyarwanda', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(await screen.findByText('Ibikoresho winjiriyeho')).toBeInTheDocument();
    expect(screen.getByText('Iki gikoresho')).toBeInTheDocument();
  });
});
