import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ list: vi.fn(), rename: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn() }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: api }));

import SignedInDevices from './SignedInDevices';

const laptop = {
  id: 'one', deviceLabel: 'Chrome on Windows', customName: '', browser: 'Chrome', os: 'Windows', isInstalledApp: false,
  createdAt: '2026-10-20T08:00:00Z', lastUsedAt: '2026-10-30T09:15:00Z', isCurrent: true,
};
const phone = {
  ...laptop, id: 'two', deviceLabel: 'Chrome on Pixel 9', customName: 'My phone', browser: 'Chrome', os: 'Android',
  lastUsedAt: '2026-10-29T18:00:00Z', isCurrent: false,
};
const tablet = { ...laptop, id: 'three', deviceLabel: 'Safari on iPad', customName: '', isCurrent: false };

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
  api.rename.mockResolvedValue({ data: { data: { ...phone, customName: 'Work phone' } } });
  api.revoke.mockResolvedValue({ data: { data: null } });
  api.revokeOthers.mockResolvedValue({ data: { data: { revoked: 2 } } });
});

describe('Signed in devices', () => {
  it('lists every device, with the name the person gave it first', async () => {
    open();
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    const row = screen.getByText('My phone').closest('li') as HTMLElement;
    expect(within(row).getByText('Chrome on Pixel 9')).toBeInTheDocument();
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
    const other = screen.getByText('My phone').closest('li') as HTMLElement;
    expect(within(other).getByRole('button', { name: 'Sign out My phone' })).toBeInTheDocument();
  });

  it('asks before signing a device out, and does nothing on cancel', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out My phone' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign out this device?' });
    expect(within(dialog).getByText(/My phone will be signed out/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.revoke).not.toHaveBeenCalled();
    expect(screen.getByText('My phone')).toBeInTheDocument();
  });

  it('signs the device out on confirm and takes it off the list', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out My phone' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('two'));
    await waitFor(() => expect(screen.queryByText('My phone')).not.toBeInTheDocument());
    expect(await screen.findByText('Device signed out.')).toBeInTheDocument();
  });

  it('signs out all the other devices after a question', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign out all other devices?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out all' }));
    await waitFor(() => expect(api.revokeOthers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('My phone')).not.toBeInTheDocument());
    expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
  });

  it('does not offer to sign out the others when there are none', async () => {
    api.list.mockResolvedValue({ data: { data: [laptop] } });
    open();
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out all other devices' })).not.toBeInTheDocument();
    expect(screen.getByText('No other devices are signed in.')).toBeInTheDocument();
  });

  it('renames a device in place, with the old name ready to edit', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Rename My phone' }));
    const field = screen.getByLabelText('Name for this device') as HTMLInputElement;
    expect(field.value).toBe('My phone');
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: 'Work phone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.rename).toHaveBeenCalledWith('two', 'Work phone'));
    expect(await screen.findByText('Work phone')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name for this device')).not.toBeInTheDocument();
  });

  it('saves a rename with the Enter key and drops it with Escape', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Rename My phone' }));
    fireEvent.keyDown(screen.getByLabelText('Name for this device'), { key: 'Escape' });
    expect(screen.queryByLabelText('Name for this device')).not.toBeInTheDocument();
    expect(api.rename).not.toHaveBeenCalled();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out My phone' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('My phone')).toBeInTheDocument();
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
