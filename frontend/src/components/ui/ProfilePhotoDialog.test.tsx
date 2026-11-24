import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ uploadPhoto: vi.fn(), removePhoto: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: api }));

import ProfilePhotoDialog from './ProfilePhotoDialog';

const saved = { id: 'u1', name: 'Aline Uwase', photoUrl: '/api/photos/new' };
const onClose = vi.fn();
const onChanged = vi.fn();

function open(photoUrl: string | null = null) {
  return render(
    <LanguageProvider>
      <ProfilePhotoDialog open name="Aline Uwase" photoUrl={photoUrl} onClose={onClose} onChanged={onChanged} />
    </LanguageProvider>,
  );
}
const chooser = () => screen.getByLabelText('Choose a photo') as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Save photo' });
const file = (name = 'me.jpg', type = 'image/jpeg', size = 1000) => new File([new Uint8Array(size)], name, { type });
const choose = (f: File) => fireEvent.change(chooser(), { target: { files: [f] } });

function refused(code: string, message: string, status = 422) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { code, message } } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/3f2c1d2e-1111-4222-8333-444455556666');
  URL.revokeObjectURL = vi.fn();
  api.uploadPhoto.mockResolvedValue({ data: { data: saved } });
  api.removePhoto.mockResolvedValue({ data: { data: { ...saved, photoUrl: null } } });
});

describe('The profile photo dialog', () => {
  it('is a dialog that says what is accepted and why it is safe, and offers a file field for pictures only', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Your photo' })).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG or WebP, up to 2 MB/)).toBeInTheDocument();
    expect(chooser()).toHaveAttribute('type', 'file');
    expect(chooser()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('shows the initials while there is no photo, and the current photo when there is one', () => {
    const { container, unmount } = open();
    expect(container.ownerDocument.querySelector('.modal-body .photo-preview img')).toBeNull();
    expect(container.ownerDocument.querySelector('.modal-body .photo-preview')).toHaveTextContent('AU');
    unmount();
    open('/api/photos/old');
    expect(document.querySelector('.modal-body .photo-preview img')).toHaveAttribute('src', '/api/photos/old');
  });

  it('keeps Save off until a photo is chosen, then shows what was chosen before anything is sent', () => {
    open();
    expect(save()).toBeDisabled();
    choose(file());
    expect(save()).toBeEnabled();
    expect(document.querySelector('.modal-body .photo-preview img')).toHaveAttribute('src', 'blob:http://localhost/3f2c1d2e-1111-4222-8333-444455556666');
    expect(api.uploadPhoto).not.toHaveBeenCalled();
  });

  it('sends the chosen file and hands the updated account on', async () => {
    open();
    const picked = file('me.png', 'image/png');
    choose(picked);
    fireEvent.click(save());
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith(picked));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(saved));
  });

  it('refuses a file over 2 MB before sending it, beside the field', () => {
    open();
    choose(file('big.jpg', 'image/jpeg', 2 * 1024 * 1024 + 1));
    const message = screen.getByText('That photo is too large. Please choose one under 2 MB.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(chooser()).toHaveAttribute('aria-invalid', 'true');
    expect(save()).toBeDisabled();
    expect(api.uploadPhoto).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a JPEG, a PNG or a WebP before sending it', () => {
    open();
    choose(file('notes.txt', 'text/plain'));
    expect(screen.getByText('Please choose a JPEG, PNG or WebP photo.')).toHaveAttribute('role', 'alert');
    expect(save()).toBeDisabled();
  });

  it('clears the message when a good file is chosen after a bad one', () => {
    open();
    choose(file('notes.txt', 'text/plain'));
    choose(file());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('shows what the server refused, in the language of the screen, and keeps the dialog open', async () => {
    api.uploadPhoto.mockRejectedValue(refused('photo_not_image', 'x'));
    open();
    choose(file());
    fireEvent.click(save());
    expect(await screen.findByText('Please choose a JPEG, PNG or WebP photo.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('removes the photo, and offers that only when there is one', async () => {
    const { unmount } = open();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
    unmount();
    open('/api/photos/old');
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(api.removePhoto).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ ...saved, photoUrl: null }));
  });

  it('closes with Escape and Cancel, and starts empty when opened again', () => {
    const { rerender } = open();
    choose(file());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(
      <LanguageProvider>
        <ProfilePhotoDialog open={false} name="Aline Uwase" photoUrl={null} onClose={onClose} onChanged={onChanged} />
      </LanguageProvider>,
    );
    rerender(
      <LanguageProvider>
        <ProfilePhotoDialog open name="Aline Uwase" photoUrl={null} onClose={onClose} onChanged={onChanged} />
      </LanguageProvider>,
    );
    expect(save()).toBeDisabled();
  });
});
