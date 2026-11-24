import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { CropState } from '../../utils/photoCrop';
import PhotoCropper, { CROP_WINDOW } from './PhotoCropper';

// A landscape picture of 800 by 400. In the 240 pixel window it shows 480 by 240 at zoom 1, so it can slide 120 sideways.
const picture = { naturalWidth: 800, naturalHeight: 400, src: 'blob:http://localhost/3f2c1d2e-1111-4222-8333-444455556666' } as HTMLImageElement;
const onChange = vi.fn();

function open(state: CropState = { zoom: 1, x: 0, y: 0 }) {
  return render(
    <LanguageProvider>
      <PhotoCropper image={picture} state={state} onChange={onChange} />
    </LanguageProvider>,
  );
}
const windowEl = () => screen.getByRole('group', { name: 'Adjust photo' });
const slider = () => screen.getByRole('slider', { name: 'Zoom' }) as HTMLInputElement;

beforeAll(() => {
  // jsdom has no pointer events with coordinates, so a mouse event stands in for one.
  if (!('PointerEvent' in window)) {
    class FakePointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
  }
});

beforeEach(() => vi.clearAllMocks());

describe('The photo cropper', () => {
  it('draws the picture at the size the zoom gives, behind a window of a fixed size', () => {
    open();
    const image = windowEl().querySelector('img') as HTMLImageElement;
    expect(image).toHaveAttribute('src', picture.src);
    expect(image).toHaveAttribute('alt', '');
    expect(image.style.width).toBe('480px');
    expect(image.style.height).toBe('240px');
    expect(CROP_WINDOW).toBe(240);
  });

  it('follows the state: the offset moves the picture', () => {
    open({ zoom: 1, x: 50, y: 0 });
    const image = windowEl().querySelector('img') as HTMLImageElement;
    expect(image.style.transform).toContain('50px');
  });

  it('can be reached and used with the keyboard: the arrows move the picture by ten pixels', () => {
    open();
    expect(windowEl()).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(windowEl(), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 1, x: 10, y: 0 });
    fireEvent.keyDown(windowEl(), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 1, x: -10, y: 0 });
  });

  it('does not slide the picture past its edge: a landscape picture has no room to go up or down at zoom 1', () => {
    open();
    fireEvent.keyDown(windowEl(), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 1, x: 0, y: 0 });
  });

  it('zooms with plus and minus, and never below 1 or above 4', () => {
    open({ zoom: 1, x: 0, y: 0 });
    fireEvent.keyDown(windowEl(), { key: '+' });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 1.1, x: 0, y: 0 });
    fireEvent.keyDown(windowEl(), { key: '-' });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 1, x: 0, y: 0 });
    open({ zoom: 4, x: 0, y: 0 });
    fireEvent.keyDown(screen.getAllByRole('group', { name: 'Adjust photo' })[1], { key: '+' });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 4, x: 0, y: 0 });
  });

  it('has a slider for the zoom from 1 to 4, which says what it is for', () => {
    open({ zoom: 2, x: 0, y: 0 });
    expect(slider()).toHaveAttribute('min', '1');
    expect(slider()).toHaveAttribute('max', '4');
    expect(slider()).toHaveValue('2');
    fireEvent.change(slider(), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 3, x: 0, y: 0 });
  });

  it('pulls the picture back inside when zooming out leaves it past its new edge', () => {
    open({ zoom: 2, x: 300, y: 100 });   // at zoom 2 the room is 360 across and 120 up and down
    fireEvent.change(slider(), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 1, x: 120, y: 0 });
  });

  it('moves the picture when it is dragged', () => {
    open();
    const el = windowEl();
    fireEvent(el, createEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 }));
    fireEvent(el, createEvent.pointerMove(el, { clientX: 130, clientY: 100, pointerId: 1 }));
    expect(onChange).toHaveBeenLastCalledWith({ zoom: 1, x: 30, y: 0 });
    fireEvent(el, createEvent.pointerUp(el, { clientX: 130, clientY: 100, pointerId: 1 }));
    onChange.mockClear();
    fireEvent(el, createEvent.pointerMove(el, { clientX: 160, clientY: 100, pointerId: 1 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says how to use it in a few words', () => {
    open();
    expect(screen.getByText('Drag to adjust')).toBeInTheDocument();
  });
});
