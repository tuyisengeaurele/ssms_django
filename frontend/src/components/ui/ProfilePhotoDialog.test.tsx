import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ uploadPhoto: vi.fn(), removePhoto: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: api }));

const crop = vi.hoisted(() => ({ loadImage: vi.fn(), cropToFile: vi.fn() }));
vi.mock('../../utils/photoCrop', async () => ({ ...(await vi.importActual<object>('../../utils/photoCrop')), loadImage: crop.loadImage, cropToFile: crop.cropToFile }));

import ProfilePhotoDialog from './ProfilePhotoDialog';

const saved = { id: 'u1', name: 'Aline Uwase', photoUrl: '/api/photos/new' };
const BLOB = 'blob:http://localhost/3f2c1d2e-1111-4222-8333-444455556666';
const picture = { naturalWidth: 800, naturalHeight: 400, src: BLOB } as HTMLImageElement;
const cropped = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
const onClose = vi.fn();
const onChanged = vi.fn();

function open(photoUrl: string | null = null) {
  return render(
    <LanguageProvider>
      <ProfilePhotoDialog open name="Aline Uwase" photoUrl={photoUrl} onClose={onClose} onChanged={onChanged} />
    </LanguageProvider>,
  );
}
const chooser = () => screen.getByLabelText('Choose photo') as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Save' });
const file = (name = 'me.jpg', type = 'image/jpeg', size = 1000) => new File([new Uint8Array(size)], name, { type });
const choose = (f: File) => fireEvent.change(chooser(), { target: { files: [f] } });
const cropper = () => screen.queryByRole('group', { name: 'Adjust photo' });

function refused(code: string, message: string, status = 422) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { code, message } } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  URL.createObjectURL = vi.fn(() => BLOB);
  URL.revokeObjectURL = vi.fn();
  crop.loadImage.mockResolvedValue(picture);
  crop.cropToFile.mockResolvedValue(cropped);
  api.uploadPhoto.mockResolvedValue({ data: { data: saved } });
  api.removePhoto.mockResolvedValue({ data: { data: { ...saved, photoUrl: null } } });
});

describe('The profile photo dialog', () => {
  it('is a dialog with a button to choose a picture, the kinds it takes in a few words, and nothing else to read', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Profile photo' })).toBeInTheDocument();
    expect(screen.getByText('JPEG, PNG or WebP')).toBeInTheDocument();
    expect(chooser()).toHaveAttribute('type', 'file');
    expect(chooser()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('shows the choose control as a button with a camera, and keeps the browser file field out of sight', () => {
    open();
    const button = screen.getByText('Choose photo').closest('label') as HTMLElement;
    expect(button).toHaveClass('btn');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(chooser()).toHaveClass('sr-only');
  });

  it('shows the initials while there is no photo, and the current photo when there is one', () => {
    const { unmount } = open();
    expect(document.querySelector('.modal-body .photo-preview img')).toBeNull();
    expect(document.querySelector('.modal-body .photo-preview')).toHaveTextContent('AU');
    unmount();
    open('/api/photos/old');
    expect(document.querySelector('.modal-body .photo-preview img')).toHaveAttribute('src', '/api/photos/old');
  });

  it('keeps Save off until a picture is chosen', () => {
    open();
    expect(save()).toBeDisabled();
    expect(cropper()).toBeNull();
  });

  it('shows the chosen picture in the cropper, ready to be adjusted, and sends nothing yet', async () => {
    open();
    choose(file());
    expect(await screen.findByRole('group', { name: 'Adjust photo' })).toBeInTheDocument();
    expect(crop.loadImage).toHaveBeenCalledWith(BLOB);
    expect(save()).toBeEnabled();
    expect(api.uploadPhoto).not.toHaveBeenCalled();
  });

  it('crops what the window shows and sends that file, then hands the updated account on', async () => {
    open();
    choose(file());
    await screen.findByRole('group', { name: 'Adjust photo' });
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } });
    fireEvent.click(save());
    await waitFor(() => expect(crop.cropToFile).toHaveBeenCalledWith(picture, { zoom: 2, x: 0, y: 0 }, 240));
    await waitFor(() => expect(api.uploadPhoto).toHaveBeenCalledWith(cropped));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(saved));
  });

  it('lets a full size phone photo through, because what is sent is the small cropped square', async () => {
    open();
    choose(file('big.jpg', 'image/jpeg', 8 * 1024 * 1024));
    expect(await screen.findByRole('group', { name: 'Adjust photo' })).toBeInTheDocument();
  });

  it('refuses a file that is far too big to open, beside the choose button', () => {
    open();
    choose(file('huge.jpg', 'image/jpeg', 25 * 1024 * 1024 + 1));
    expect(screen.getByText('That photo is too large.')).toHaveAttribute('role', 'alert');
    expect(chooser()).toHaveAttribute('aria-invalid', 'true');
    expect(crop.loadImage).not.toHaveBeenCalled();
    expect(save()).toBeDisabled();
  });

  it('refuses a file that is not a JPEG, a PNG or a WebP', () => {
    open();
    choose(file('notes.txt', 'text/plain'));
    expect(screen.getByText('Please choose a JPEG, PNG or WebP photo.')).toHaveAttribute('role', 'alert');
    expect(cropper()).toBeNull();
    expect(save()).toBeDisabled();
  });

  it('says so when the browser cannot read the picture', async () => {
    crop.loadImage.mockRejectedValue(new Error('x'));
    open();
    choose(file());
    expect(await screen.findByText('Please choose a JPEG, PNG or WebP photo.')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('starts the adjustment again when another picture is chosen', async () => {
    open();
    choose(file());
    await screen.findByRole('group', { name: 'Adjust photo' });
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '3' } });
    choose(file('other.png', 'image/png'));
    await waitFor(() => expect(crop.loadImage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Zoom' })).toHaveValue('1'));
  });

  it('clears the message when a good file is chosen after a bad one', async () => {
    open();
    choose(file('notes.txt', 'text/plain'));
    choose(file());
    expect(await screen.findByRole('group', { name: 'Adjust photo' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows what the server refused, in the language of the screen, and keeps the dialog open', async () => {
    api.uploadPhoto.mockRejectedValue(refused('photo_not_image', 'x'));
    open();
    choose(file());
    await screen.findByRole('group', { name: 'Adjust photo' });
    fireEvent.click(save());
    expect(await screen.findByText('Please choose a JPEG, PNG or WebP photo.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a message and stays open when the crop cannot be made', async () => {
    crop.cropToFile.mockRejectedValue(new Error('x'));
    open();
    choose(file());
    await screen.findByRole('group', { name: 'Adjust photo' });
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
  });

  it('removes the photo, and offers that only when there is one', async () => {
    const { unmount } = open();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    unmount();
    open('/api/photos/old');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.removePhoto).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ ...saved, photoUrl: null }));
  });

  it('shows Remove as a button with a bin before the word, like the other buttons, not as plain red text', () => {
    open('/api/photos/old');
    const button = screen.getByRole('button', { name: 'Remove' });
    expect(button).toHaveClass('btn', 'btn-secondary');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('closes with Escape and Cancel, and starts empty when opened again', async () => {
    const { rerender } = open();
    choose(file());
    await screen.findByRole('group', { name: 'Adjust photo' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    const dialog = (isOpen: boolean) => (
      <LanguageProvider>
        <ProfilePhotoDialog open={isOpen} name="Aline Uwase" photoUrl={null} onClose={onClose} onChanged={onChanged} />
      </LanguageProvider>
    );
    rerender(dialog(false));
    rerender(dialog(true));
    expect(cropper()).toBeNull();
    expect(save()).toBeDisabled();
  });
});
