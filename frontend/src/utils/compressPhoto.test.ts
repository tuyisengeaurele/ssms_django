import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressPhoto, MAX_SIDE, QUALITY } from './compressPhoto';

const KB = 1024;
const file = (bytes: number, name = 'IMG_0001.JPG', type = 'image/jpeg') => new File([new Uint8Array(bytes)], name, { type });

interface Setup { width: number; height: number; encoded?: number | null }

let drawImage: ReturnType<typeof vi.fn>;
let fillRect: ReturnType<typeof vi.fn>;
let toBlob: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;
let canvasSize: { width: number; height: number };

function setup({ width, height, encoded = 150 * KB }: Setup) {
  close = vi.fn();
  drawImage = vi.fn();
  fillRect = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    canvasSize = { width: this.width, height: this.height };
    return { drawImage, fillRect, fillStyle: '' } as unknown as CanvasRenderingContext2D;
  } as never);
  toBlob = vi.fn(function (this: HTMLCanvasElement, callback: BlobCallback, type?: string) {
    canvasSize = { width: this.width, height: this.height };
    callback(encoded === null ? null : new Blob([new Uint8Array(encoded)], { type }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob as never);
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('compressPhoto', () => {
  it('leaves a photo alone when it is small in size and in pixels', async () => {
    setup({ width: 1000, height: 800 });
    const original = file(300 * KB);
    expect(await compressPhoto(original)).toBe(original);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('shrinks a large photo to a long side of 1280 pixels and keeps its shape', async () => {
    setup({ width: 4000, height: 3000 });
    const out = await compressPhoto(file(4 * 1024 * KB));
    expect(canvasSize).toEqual({ width: 1280, height: 960 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4000, 3000, 0, 0, 1280, 960);
    expect(out.size).toBe(150 * KB);
  });

  it('does the same for a photo held upright', async () => {
    setup({ width: 3000, height: 4000 });
    await compressPhoto(file(4 * 1024 * KB));
    expect(canvasSize).toEqual({ width: 960, height: 1280 });
  });

  it('writes a JPEG with the chosen quality and a .jpg name', async () => {
    setup({ width: 4000, height: 3000 });
    const out = await compressPhoto(file(4 * 1024 * KB, 'IMG_0001.PNG', 'image/png'));
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', QUALITY);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
  });

  it('gives a name to a file that has none', async () => {
    setup({ width: 4000, height: 3000 });
    expect((await compressPhoto(file(4 * 1024 * KB, ''))).name).toBe('photo.jpg');
  });

  it('re-encodes a heavy photo that is already small in pixels, without scaling it', async () => {
    setup({ width: 1000, height: 800, encoded: 200 * KB });
    const out = await compressPhoto(file(3 * 1024 * KB));
    expect(canvasSize).toEqual({ width: 1000, height: 800 });
    expect(out.size).toBe(200 * KB);
  });

  it('keeps the original when the new file would not be smaller', async () => {
    setup({ width: 1000, height: 800, encoded: 4 * 1024 * KB });
    const original = file(3 * 1024 * KB);
    expect(await compressPhoto(original)).toBe(original);
  });

  it('puts a PNG on white first, so a see-through photo does not turn black', async () => {
    setup({ width: 4000, height: 3000 });
    await compressPhoto(file(4 * 1024 * KB, 'a.png', 'image/png'));
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1280, 960);
    expect(fillRect.mock.invocationCallOrder[0]).toBeLessThan(drawImage.mock.invocationCallOrder[0]);
  });

  it('cuts the middle square when asked, so the model sees the part that was framed', async () => {
    setup({ width: 4000, height: 3000 });
    await compressPhoto(file(4 * 1024 * KB), { square: true });
    expect(canvasSize).toEqual({ width: 1280, height: 1280 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0, 3000, 3000, 0, 0, 1280, 1280);
  });

  it('cuts the square even from a photo that was small enough to leave alone', async () => {
    setup({ width: 1000, height: 800 });
    await compressPhoto(file(100 * KB), { square: true });
    expect(canvasSize).toEqual({ width: 800, height: 800 });
  });

  it('frees the decoded picture', async () => {
    setup({ width: 4000, height: 3000 });
    await compressPhoto(file(4 * 1024 * KB));
    expect(close).toHaveBeenCalled();
  });

  describe('when something is missing or goes wrong, the original is used so the check still works', () => {
    it('no way to decode pictures', async () => {
      setup({ width: 4000, height: 3000 });
      vi.stubGlobal('createImageBitmap', undefined);
      const original = file(4 * 1024 * KB);
      expect(await compressPhoto(original)).toBe(original);
    });

    it('a picture that cannot be decoded', async () => {
      setup({ width: 4000, height: 3000 });
      vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad'); }));
      const original = file(4 * 1024 * KB);
      expect(await compressPhoto(original)).toBe(original);
    });

    it('no canvas', async () => {
      setup({ width: 4000, height: 3000 });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      const original = file(4 * 1024 * KB);
      expect(await compressPhoto(original)).toBe(original);
      expect(close).toHaveBeenCalled();
    });

    it('a canvas that gives nothing back', async () => {
      setup({ width: 4000, height: 3000, encoded: null });
      const original = file(4 * 1024 * KB);
      expect(await compressPhoto(original)).toBe(original);
    });
  });

  it('uses the limits it documents', () => {
    expect(MAX_SIDE).toBe(1280);
    expect(QUALITY).toBe(0.82);
  });
});
