import { MotionConfigContext } from 'framer-motion';
import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setReducedMotion } from '../../test/setup';
import Modal from './Modal';

// The provider of the reduced motion setting used to sit at the root of the app. It now sits inside the dialog itself, so a
// dialog opened from anywhere (a page, a toast action, the sign in screen) still honours "reduce motion".

function Setting() {
  return <p data-testid="setting">{useContext(MotionConfigContext).reducedMotion}</p>;
}

beforeEach(() => setReducedMotion(false));

describe('a dialog and the reduce motion setting', () => {
  it('lets its animations play for a person who did not ask for less motion', () => {
    render(<Modal open onClose={() => {}} title="Question"><Setting /></Modal>);
    expect(screen.getByTestId('setting')).toHaveTextContent('never');
  });

  it('turns movement off inside it for a person who asked for less motion', () => {
    setReducedMotion(true);
    render(<Modal open onClose={() => {}} title="Question"><Setting /></Modal>);
    expect(screen.getByTestId('setting')).toHaveTextContent('always');
  });
});
