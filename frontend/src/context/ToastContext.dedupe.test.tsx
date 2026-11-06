import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './ToastContext';

// Several requests on one page can fail for the same reason at the same moment. One message says it, four is noise.
function Trigger() {
  const { error, success } = useToast();
  return (
    <>
      <button onClick={() => { error('Same message'); error('Same message'); error('Same message'); error('Another message'); }}>burst</button>
      <button onClick={() => { error('Mixed kinds'); success('Mixed kinds'); }}>mixed</button>
    </>
  );
}

const open = () => render(<ToastProvider><Trigger /></ToastProvider>);

describe('Toasts that repeat', () => {
  it('shows one toast for the same message sent several times at once, and still shows a different one', async () => {
    open();
    await act(async () => { fireEvent.click(screen.getByText('burst')); });
    expect(await screen.findAllByText('Same message', {}, { timeout: 5000 })).toHaveLength(1);
    expect(await screen.findAllByText('Another message')).toHaveLength(1);
  });

  it('keeps the same words of a different kind apart', async () => {
    open();
    await act(async () => { fireEvent.click(screen.getByText('mixed')); });
    expect(await screen.findAllByText('Mixed kinds', {}, { timeout: 5000 })).toHaveLength(2);
  });
});
