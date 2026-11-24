/**
 * Choosing the part of a picture that becomes the profile photo.
 *
 * The picture sits behind a square window. `zoom` is 1 when the shorter side of the picture just fills the window, and `x` and `y`
 * say how far the middle of the picture is from the middle of the window, in window pixels. The picture always covers the
 * window, so there is never an empty corner in the result.
 */

export interface CropState {
  zoom: number;
  x: number;
  y: number;
}

export const MAX_ZOOM = 4;
/** The side of the picture that is uploaded, as the server makes it. */
export const OUTPUT_SIDE = 512;

/** Screen pixels per picture pixel when the shorter side of the picture fills the window. */
export function coverScale(width: number, height: number, window: number): number {
  return Math.max(window / width, window / height);
}

/** The offset kept inside what still lets the picture cover the window. */
export function clampOffset(offset: { x: number; y: number }, width: number, height: number, window: number, zoom: number) {
  const scale = coverScale(width, height, window) * zoom;
  const roomX = Math.max(0, (width * scale - window) / 2);
  const roomY = Math.max(0, (height * scale - window) / 2);
  return {
    x: Math.max(-roomX, Math.min(roomX, offset.x)) || 0,
    y: Math.max(-roomY, Math.min(roomY, offset.y)) || 0,
  };
}

/** The square of the picture, in picture pixels, that the window shows. */
export function sourceRect(offset: { x: number; y: number }, width: number, height: number, window: number, zoom: number) {
  const scale = coverScale(width, height, window) * zoom;
  const { x, y } = clampOffset(offset, width, height, window, zoom);
  const size = window / scale;
  return {
    sx: (width * scale / 2 - window / 2 - x) / scale,
    sy: (height * scale / 2 - window / 2 - y) / scale,
    size,
  };
}

/** Load a picture from an address the browser made for a chosen file. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The picture could not be read.'));
    image.src = url;
  });
}

/** The chosen square as a JPEG file of the output size. The browser turns a sideways photo upright when it draws it. */
export function cropToFile(image: HTMLImageElement, state: CropState, window: number): Promise<File> {
  const { sx, sy, size } = sourceRect(state, image.naturalWidth, image.naturalHeight, window, state.zoom);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIDE;
  canvas.height = OUTPUT_SIDE;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('The picture could not be made.'));
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sx, sy, size, size, 0, 0, OUTPUT_SIDE, OUTPUT_SIDE);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('The picture could not be made.'));
      else resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  });
}
