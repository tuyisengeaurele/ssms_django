import { KeyboardEvent, PointerEvent, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { clampOffset, coverScale, CropState, MAX_ZOOM } from '../../utils/photoCrop';

/** The side of the window in CSS pixels. The crop is worked out against this size. */
export const CROP_WINDOW = 240;
const STEP = 10;
const ZOOM_STEP = 0.1;

interface Props {
  image: HTMLImageElement;
  state: CropState;
  onChange: (state: CropState) => void;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The picture behind a round window. It is moved by dragging or with the arrow keys and zoomed with the slider or with plus and
 * minus. The picture always covers the window, so the result has no empty corner.
 */
export default function PhotoCropper({ image, state, onChange }: Props) {
  const { t } = useLanguage();
  const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const scale = coverScale(width, height, CROP_WINDOW) * state.zoom;

  const move = (next: Partial<CropState>) => {
    const zoom = round(Math.max(1, Math.min(MAX_ZOOM, next.zoom ?? state.zoom)));
    const offset = clampOffset({ x: next.x ?? state.x, y: next.y ?? state.y }, width, height, CROP_WINDOW, zoom);
    onChange({ zoom, ...offset });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, Partial<CropState>> = {
      ArrowLeft: { x: state.x - STEP },
      ArrowRight: { x: state.x + STEP },
      ArrowUp: { y: state.y - STEP },
      ArrowDown: { y: state.y + STEP },
      '+': { zoom: state.zoom + ZOOM_STEP },
      '=': { zoom: state.zoom + ZOOM_STEP },
      '-': { zoom: state.zoom - ZOOM_STEP },
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    move(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { pointerX: e.clientX, pointerY: e.clientY, x: state.x, y: state.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start) move({ x: start.x + e.clientX - start.pointerX, y: start.y + e.clientY - start.pointerY });
  };
  const stop = () => { drag.current = null; };

  return (
    <div className="photo-crop">
      <div
        className="photo-crop__window"
        style={{ width: CROP_WINDOW, height: CROP_WINDOW }}
        role="group"
        aria-label={t('ppAdjustLabel')}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <img
          src={image.src}
          alt=""
          draggable={false}
          style={{ width: width * scale, height: height * scale, transform: `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px))` }}
        />
      </div>
      <p className="form-hint">{t('ppAdjust')}</p>
      <input
        className="photo-crop__zoom"
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={state.zoom}
        aria-label={t('ppZoom')}
        onChange={(e) => move({ zoom: Number(e.target.value) })}
      />
    </div>
  );
}
