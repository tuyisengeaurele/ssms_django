import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampOffset, coverScale, cropToFile, MAX_ZOOM, OUTPUT_SIDE, sourceRect } from './photoCrop';

// A square window of 200 on a landscape picture of 800 by 400.
const WINDOW = 200;

describe('coverScale', () => {
  it('scales the shorter side of the picture to fill the window', () => {
    expect(coverScale(800, 400, WINDOW)).toBe(0.5);
    expect(coverScale(400, 800, WINDOW)).toBe(0.5);
    expect(coverScale(100, 100, WINDOW)).toBe(2);
  });
});

describe('clampOffset', () => {
  it('lets a landscape picture move sideways only as far as it still covers the window', () => {
    // At zoom 1 the picture is 400 by 200 on screen: 100 spare on each side, none above or below.
    expect(clampOffset({ x: 500, y: 500 }, 800, 400, WINDOW, 1)).toEqual({ x: 100, y: 0 });
    expect(clampOffset({ x: -500, y: -500 }, 800, 400, WINDOW, 1)).toEqual({ x: -100, y: 0 });
  });

  it('allows more room as the zoom grows', () => {
    expect(clampOffset({ x: 999, y: 999 }, 800, 400, WINDOW, 2)).toEqual({ x: 300, y: 100 });
  });

  it('leaves a position that is already inside alone', () => {
    expect(clampOffset({ x: 40, y: 0 }, 800, 400, WINDOW, 1)).toEqual({ x: 40, y: 0 });
  });
});

describe('sourceRect', () => {
  it('is the middle square of the picture at zoom 1 with no offset', () => {
    // 400 high picture, window shows its middle 400 by 400 of the 800 wide.
    expect(sourceRect({ x: 0, y: 0 }, 800, 400, WINDOW, 1)).toEqual({ sx: 200, sy: 0, size: 400 });
  });

  it('shrinks to the middle of the picture as the zoom grows', () => {
    expect(sourceRect({ x: 0, y: 0 }, 800, 400, WINDOW, 2)).toEqual({ sx: 300, sy: 100, size: 200 });
  });

  it('follows the picture: dragging it right shows more of its left side', () => {
    expect(sourceRect({ x: 100, y: 0 }, 800, 400, WINDOW, 1)).toEqual({ sx: 0, sy: 0, size: 400 });
  });

  it('never reaches outside the picture, even for an offset that is too big', () => {
    const rect = sourceRect({ x: 9999, y: -9999 }, 800, 400, WINDOW, 3);
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.size).toBeLessThanOrEqual(800);
    expect(rect.sy + rect.size).toBeLessThanOrEqual(400);
  });
});

describe('cropToFile', () => {
  const draw = vi.fn();
  const picture = { naturalWidth: 800, naturalHeight: 400 } as HTMLImageElement;

  afterEach(() => vi.restoreAllMocks());

  function fakeCanvas(blob: Blob | null) {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: draw, imageSmoothingQuality: '' })),
      toBlob: vi.fn((done: (b: Blob | null) => void) => done(blob)),
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (tag === 'canvas' ? canvas : document.createElementNS('http://www.w3.org/1999/xhtml', tag))) as never);
    return canvas;
  }

  it('draws the chosen square onto a canvas of the output size and returns it as a JPEG file', async () => {
    draw.mockClear();
    const canvas = fakeCanvas(new Blob(['x'], { type: 'image/jpeg' }));
    const file = await cropToFile(picture, { zoom: 1, x: 0, y: 0 }, WINDOW);
    expect(canvas.width).toBe(OUTPUT_SIDE);
    expect(canvas.height).toBe(OUTPUT_SIDE);
    expect(draw).toHaveBeenCalledWith(picture, 200, 0, 400, 400, 0, 0, OUTPUT_SIDE, OUTPUT_SIDE);
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toBe('photo.jpg');
    expect(OUTPUT_SIDE).toBe(512);
  });

  it('says so when the browser cannot make the file', async () => {
    fakeCanvas(null);
    await expect(cropToFile(picture, { zoom: 1, x: 0, y: 0 }, WINDOW)).rejects.toThrow();
  });

  it('knows the most the person can zoom in', () => {
    expect(MAX_ZOOM).toBe(4);
  });
});
