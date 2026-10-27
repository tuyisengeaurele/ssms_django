import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import CameraCapture from './CameraCapture';

const stop = vi.fn();
const getUserMedia = vi.fn();
let drawImage: ReturnType<typeof vi.fn>;
let canvasSize = { width: 0, height: 0 };

function open(props: Partial<React.ComponentProps<typeof CameraCapture>> = {}) {
  const onCapture = vi.fn();
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <CameraCapture onCapture={onCapture} onClose={onClose} {...props} />
    </LanguageProvider>,
  );
  return { onCapture, onClose };
}

const video = () => screen.getByLabelText('Camera view') as HTMLVideoElement;
const ready = async () => {
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  fireEvent.loadedMetadata(await screen.findByLabelText('Camera view'));
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  stop.mockClear();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1920 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1080 });
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    canvasSize = { width: this.width, height: this.height };
    return { drawImage } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
    canvasSize = { width: this.width, height: this.height };
    cb(new Blob(['jpeg'], { type }));
  } as never);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoWidth');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoHeight');
});

describe('Camera capture', () => {
  it('asks for the back camera, without sound', async () => {
    open();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false }));
  });

  it('shows the live view with a square frame to line the subject up in, and says how', async () => {
    open();
    await ready();
    expect(video()).toHaveAttribute('playsinline');
    expect(video()).toHaveProperty('muted', true);
    expect(screen.getByTestId('frame-guide')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Fill the square with one worm or leaf. Only what is inside it is sent.')).toBeInTheDocument();
  });

  it('keeps the shutter off until the camera is showing a picture', async () => {
    open();
    await screen.findByLabelText('Camera view');
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeDisabled();
    fireEvent.loadedMetadata(video());
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled();
  });

  it('takes the middle square of the picture and hands it over as a JPEG file', async () => {
    const { onCapture } = open();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(onCapture).toHaveBeenCalled());
    const file = onCapture.mock.calls[0][0] as File;
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('photo.jpg');
    // The picture is 1920 by 1080, so the square is 1080 wide and starts 420 pixels in.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 420, 0, 1080, 1080, 0, 0, 1080, 1080);
    expect(canvasSize).toEqual({ width: 1080, height: 1080 });
  });

  it('never sends more than 1280 pixels', async () => {
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 4000 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 3000 });
    const { onCapture } = open();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(onCapture).toHaveBeenCalled());
    expect(canvasSize).toEqual({ width: 1280, height: 1280 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0, 3000, 3000, 0, 0, 1280, 1280);
  });

  it('switches the camera off after the photo', async () => {
    const { onCapture } = open();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(onCapture).toHaveBeenCalled());
    expect(stop).toHaveBeenCalled();
  });

  it('switches the camera off when it is cancelled, closed with Escape or taken off the page', async () => {
    const first = open();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(first.onClose).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);

    stop.mockClear();
    const second = open();
    await waitFor(() => expect(screen.getAllByLabelText('Camera view')).toHaveLength(2));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second.onClose).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('switches the camera off when the page leaves, even before it has started', async () => {
    let grant: (stream: unknown) => void = () => undefined;
    getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    const { unmount } = render(
      <LanguageProvider>
        <CameraCapture onCapture={vi.fn()} onClose={vi.fn()} />
      </LanguageProvider>,
    );
    unmount();
    grant({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  describe('when the camera cannot be used', () => {
    const fails = (name: string) => getUserMedia.mockRejectedValue(Object.assign(new Error(name), { name }));

    it('says it is blocked and offers the file picker instead', async () => {
      fails('NotAllowedError');
      const { onClose } = open();
      expect(await screen.findByRole('alert')).toHaveTextContent('The camera is blocked. Allow it in your browser, or choose a photo instead.');
      expect(screen.queryByLabelText('Camera view')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Choose a photo instead' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('says when there is no camera', async () => {
      fails('NotFoundError');
      open();
      expect(await screen.findByRole('alert')).toHaveTextContent('No camera was found on this device. You can choose a photo instead.');
    });

    it('says something plain for anything else', async () => {
      fails('AbortError');
      open();
      expect(await screen.findByRole('alert')).toHaveTextContent('The camera could not start. You can choose a photo instead.');
    });

    it('says so when the device has no camera support at all', async () => {
      Reflect.deleteProperty(navigator, 'mediaDevices');
      open();
      expect(await screen.findByRole('alert')).toHaveTextContent('The camera could not start. You can choose a photo instead.');
    });
  });
});
