import { MotionConfigContext } from 'framer-motion';
import { act, render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it } from 'vitest';
import { setReducedMotion } from '../test/setup';
import MotionProvider from './MotionProvider';

function Setting() {
  return <p data-testid="setting">{useContext(MotionConfigContext).reducedMotion}</p>;
}
const setting = () => screen.getByTestId('setting').textContent;

describe('MotionProvider', () => {
  it('lets animations play for a person who did not ask for less motion', () => {
    render(<MotionProvider><Setting /></MotionProvider>);
    expect(setting()).toBe('never');
  });

  it('turns movement off for a person who asked for less motion', () => {
    setReducedMotion(true);
    render(<MotionProvider><Setting /></MotionProvider>);
    expect(setting()).toBe('always');
  });

  it('follows the setting while the page is open', () => {
    render(<MotionProvider><Setting /></MotionProvider>);
    act(() => setReducedMotion(true));
    expect(setting()).toBe('always');
    act(() => setReducedMotion(false));
    expect(setting()).toBe('never');
  });

  it('shows its children', () => {
    render(<MotionProvider><p>Inside</p></MotionProvider>);
    expect(screen.getByText('Inside')).toBeInTheDocument();
  });
});
