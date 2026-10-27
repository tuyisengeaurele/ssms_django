import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ create: vi.fn(), compress: vi.fn() }));
vi.mock('../../services/detection.service', () => ({ detectionService: { create: api.create } }));
vi.mock('../../utils/compressPhoto', () => ({ compressPhoto: api.compress, MAX_SIDE: 1280 }));
// The camera has its own tests. Here it is a pair of buttons that hand over a photo or close.
vi.mock('../../components/ui/CameraCapture', () => ({
  default: ({ onCapture, onClose }: { onCapture: (f: File) => void; onClose: () => void }) => (
    <div>
      <button type="button" onClick={() => onCapture(new File(['x'.repeat(4096)], 'photo.jpg', { type: 'image/jpeg' }))}>Stub shutter</button>
      <button type="button" onClick={onClose}>Stub close</button>
    </div>
  ),
}));

import AddDetectionPage from './AddDetectionPage';

const photo = (name = 'worm.jpg', type = 'image/jpeg') => new File(['x'.repeat(2048)], name, { type });

const outcome = (over: object = {}) => ({
  data: {
    data: {
      id: 'd1', batchId: 'b1', imageUrl: '', result: 'Flacherie', confidence: 0.834, detectedAt: '2026-10-01T00:00:00Z',
      allScores: { Healthy: 0.1, Flacherie: 0.834, Grasserie: 0.04, Muscardine: 0.02, Pebrine: 0.006 },
      ...over,
    },
  },
});

function open() {
  return render(
    <MemoryRouter initialEntries={['/batches/b1/detect']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/batches/:id/detect" element={<AddDetectionPage />} />
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const choose = (file: File) => fireEvent.change(screen.getByLabelText(/^Choose a photo/), { target: { files: [file] } });
/** Chooses a photo and waits until it has been prepared and shown, which is when the check can be started. */
const chooseReady = async (file: File) => {
  choose(file);
  await screen.findByRole('img', { name: 'The photo you chose' });
};

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  // By default a photo is already small enough, so it is sent as it is.
  api.compress.mockImplementation(async (f: File) => f);
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('Disease check page', () => {
  it('has one title and a way back to the batch', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Disease check' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to the batch/ })).toHaveAttribute('href', '/batches/b1');
  });

  it('lets the keyboard reach the file field and keeps the check button off until a photo is chosen', () => {
    open();
    expect(screen.getByLabelText(/^Choose a photo/)).toHaveAttribute('type', 'file');
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeDisabled();
  });

  it('shows the chosen photo with its name and size', async () => {
    open();
    choose(photo());
    expect(await screen.findByRole('img', { name: 'The photo you chose' })).toBeInTheDocument();
    expect(screen.getByText('worm.jpg (2.0 KB)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeEnabled();
  });

  it('refuses a file that is not a photo and says what to do', () => {
    open();
    choose(photo('notes.pdf', 'application/pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a JPEG, PNG or WebP photo.');
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeDisabled();
  });

  it('sends the photo and the notes, then shows the result with a plain percentage', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    const file = photo();
    await chooseReady(file);
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: 'Second tray' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('b1', file, 'Second tray'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Flacherie' })).toBeInTheDocument();
    expect(screen.getByText('83% sure')).toBeInTheDocument();
  });

  it('asks for care when a disease may be present, and says the check can be wrong', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    await chooseReady(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    expect(await screen.findByText(/may be present/)).toBeInTheDocument();
    expect(screen.getByText(/can make mistakes/)).toBeInTheDocument();
  });

  it('is calm when the worm looks healthy', async () => {
    api.create.mockResolvedValue(outcome({ result: 'Healthy', confidence: 0.97 }));
    open();
    await chooseReady(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    expect(await screen.findByText(/No sign of disease/)).toBeInTheDocument();
    expect(screen.queryByText(/may be present/)).not.toBeInTheDocument();
  });

  it('lists every score as a bar list, highest first', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    await chooseReady(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    const list = await screen.findByRole('list', { name: 'How likely each condition is' });
    const names = within(list).getAllByRole('listitem').map((li) => li.querySelector('.barlist-label')?.textContent);
    expect(names).toEqual(['Flacherie', 'Healthy', 'Grasserie', 'Muscardine', 'Pebrine']);
    expect(within(list).getByText('83%')).toBeInTheDocument();
  });

  it('starts over with another photo', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    await chooseReady(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check another photo' }));
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeDisabled();
    expect(screen.queryByRole('heading', { level: 2, name: 'Flacherie' })).not.toBeInTheDocument();
  });

  it('shows a friendly message when the check fails and keeps the photo', async () => {
    api.create.mockRejectedValue(new Error('x'));
    open();
    await chooseReady(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeEnabled();
  });

  describe('taking the photo with the camera', () => {
    const withCamera = () => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });

    it('offers the camera only on a device that has one', () => {
      open();
      expect(screen.queryByRole('button', { name: 'Use the camera' })).not.toBeInTheDocument();
      cleanup();
      withCamera();
      open();
      expect(screen.getByRole('button', { name: 'Use the camera' })).toBeInTheDocument();
    });

    it('swaps the choose box for the live camera, and back when it is closed', () => {
      withCamera();
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Use the camera' }));
      expect(screen.getByRole('button', { name: 'Stub shutter' })).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Choose a photo/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Stub close' }));
      expect(screen.getByLabelText(/^Choose a photo/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Stub shutter' })).not.toBeInTheDocument();
    });

    it('uses the photo from the camera as the one to check', async () => {
      api.create.mockResolvedValue(outcome());
      withCamera();
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Use the camera' }));
      fireEvent.click(screen.getByRole('button', { name: 'Stub shutter' }));
      expect(await screen.findByText('photo.jpg (4.0 KB)')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Stub shutter' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith('b1', expect.objectContaining({ name: 'photo.jpg' }), undefined));
    });
  });

  describe('making a large photo smaller before it is sent', () => {
    const MB = 1024 * 1024;
    const big = () => new File([new Uint8Array(5 * MB)], 'IMG_2201.JPG', { type: 'image/jpeg' });
    const small = () => new File([new Uint8Array(180 * 1024)], 'IMG_2201.jpg', { type: 'image/jpeg' });

    it('sends the smaller file and says how much smaller it got', async () => {
      api.compress.mockResolvedValue(small());
      api.create.mockResolvedValue(outcome());
      open();
      choose(big());
      expect(await screen.findByText('IMG_2201.jpg (180.0 KB)')).toBeInTheDocument();
      expect(screen.getByText('Photo ready, 180 KB. It was 5.0 MB, and was made smaller to send faster.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith('b1', expect.objectContaining({ size: 180 * 1024 }), undefined));
    });

    it('does not mention it when the photo was left as it was', async () => {
      open();
      choose(photo());
      await screen.findByText('worm.jpg (2.0 KB)');
      expect(screen.queryByText(/made smaller/)).not.toBeInTheDocument();
    });

    it('shows that it is working and keeps the check button off meanwhile', async () => {
      let finish: (f: File) => void = () => undefined;
      api.compress.mockReturnValue(new Promise<File>((resolve) => { finish = resolve; }));
      open();
      choose(big());
      expect(await screen.findByText('Preparing the photo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Preparing the photo/ })).toBeDisabled();
      finish(small());
      await screen.findByText('IMG_2201.jpg (180.0 KB)');
      expect(screen.getByRole('button', { name: 'Check this photo' })).toBeEnabled();
    });

    it('does not cut a square from a photo chosen from the gallery', async () => {
      open();
      const file = big();
      choose(file);
      await waitFor(() => expect(api.compress).toHaveBeenCalledWith(file));
    });

    it('stays usable when the photo cannot be prepared at all', async () => {
      api.compress.mockRejectedValue(new Error('no memory'));
      api.create.mockResolvedValue(outcome());
      open();
      const file = big();
      choose(file);
      expect(await screen.findByText('IMG_2201.JPG (5.0 MB)')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith('b1', file, undefined));
    });

    it('no longer promises 10 MB, which the server would refuse', () => {
      open();
      expect(screen.queryByText(/10 MB/)).not.toBeInTheDocument();
      expect(screen.getByText(/A large photo is made smaller for you/)).toBeInTheDocument();
    });
  });

  it('keeps the advice on framing folded away until it is wanted', () => {
    open();
    const summary = screen.getByText('How to take a photo the check can read');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    for (const tip of [/Get close/, /Use daylight/, /Hold still/]) expect(within(details).getByText(tip)).toBeInTheDocument();
  });

  it('has no tips panel or list of conditions beside the form', () => {
    const { container } = open();
    expect(screen.queryByRole('list', { name: 'Tips for a good photo' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Healthy, Flacherie, Grasserie, Muscardine and Pebrine/)).not.toBeInTheDocument();
    expect(container.querySelector('.next-steps, .form-page')).toBeNull();
    expect(container.querySelector('.page-narrow')).not.toBeNull();
  });

  it('keeps the model name, the AI wording, the tip box and the old colours out', async () => {
    api.create.mockResolvedValue(outcome());
    const { container } = open();
    await chooseReady(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    await screen.findByText('83% sure');
    expect(container.textContent).not.toMatch(/\bAI\b|ResNet|Instant|under 5 seconds|powered/i);
    expect(container.querySelector('.progress-bar, .progress-fill')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#dc2626|#16a34a|#d97706|#7c3aed|#db2777|brand-50|warning-bg/);
  });
});
