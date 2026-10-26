import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setCoarsePointer, setReducedMotion } from '../../test/setup';
import { useMagnetic } from './useMagnetic';

function Button() {
  const ref = useMagnetic<HTMLButtonElement>(0.5);
  return <button ref={ref}>Go</button>;
}

function stubBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 100, top: 100, width: 100, height: 40, right: 200, bottom: 140, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
}

describe('useMagnetic', () => {
  it('pulls the element toward the pointer and lets go on leave', () => {
    render(<Button />);
    const el = screen.getByRole('button');
    stubBox(el);

    fireEvent.pointerMove(el, { clientX: 190, clientY: 120 });
    expect(el.style.transform).toBe('translate3d(20px, 0px, 0)');

    fireEvent.pointerLeave(el);
    expect(el.style.transform).toBe('');
  });

  it('does nothing for people who prefer reduced motion', () => {
    setReducedMotion(true);
    render(<Button />);
    const el = screen.getByRole('button');
    stubBox(el);
    fireEvent.pointerMove(el, { clientX: 190, clientY: 120 });
    expect(el.style.transform).toBe('');
  });

  it('does nothing on touch screens', () => {
    setCoarsePointer(true);
    render(<Button />);
    const el = screen.getByRole('button');
    stubBox(el);
    fireEvent.pointerMove(el, { clientX: 190, clientY: 120 });
    expect(el.style.transform).toBe('');
  });
});
