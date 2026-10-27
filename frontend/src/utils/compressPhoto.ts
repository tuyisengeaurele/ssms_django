/** The longest side a photo is sent at. The disease model looks at 224 pixels, so this is far more than it needs. */
export const MAX_SIDE = 1280;
export const QUALITY = 0.82;
/** A photo under this size and within MAX_SIDE is sent as it is, so a good small photo is never re-encoded. */
const LEAVE_ALONE_BYTES = 1024 * 1024;

interface Options {
  /** Cut the middle square out first. The model squeezes every photo into a square, so a square is what it sees best. */
  square?: boolean;
}

const jpegName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;

/**
 * Makes a phone photo small enough to send over a mobile connection: a JPEG of at most 1280 pixels on the long side.
 * The server turns away anything over 5 MB, and a phone photo is often more than that.
 * When anything is missing or fails, the original file comes back, so the check still works.
 */
export async function compressPhoto(file: File, { square = false }: Options = {}): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    const { width, height } = bitmap;
    if (!square && Math.max(width, height) <= MAX_SIDE && file.size <= LEAVE_ALONE_BYTES) return file;

    let [sx, sy, sw, sh] = [0, 0, width, height];
    if (square) {
      const side = Math.min(width, height);
      [sx, sy, sw, sh] = [Math.round((width - side) / 2), Math.round((height - side) / 2), side, side];
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const [outW, outH] = [Math.round(sw * scale), Math.round(sh * scale)];

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const context = canvas.getContext('2d');
    if (!context) return file;
    // A PNG can be see-through, and JPEG would turn that black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, outW, outH);
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return file;
    // A crop is wanted whatever its size. Otherwise a result that is not smaller is not worth sending.
    if (!square && blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), { type: 'image/jpeg' });
  } finally {
    bitmap.close?.();
  }
}
