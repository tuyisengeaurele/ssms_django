import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({ count: 0 }));

vi.mock('framer-motion', async (importOriginal) => {
  loaded.count += 1;
  return importOriginal<typeof import('framer-motion')>();
});

import { ToastProvider, useToast } from './ToastContext';

function Trigger() {
  const { success } = useToast();
  return <button onClick={() => success('Saved your batch')}>go</button>;
}

describe('ToastProvider', () => {
  it('does not load the animation library until a toast is shown', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    expect(loaded.count).toBe(0);
  });

  it('shows a toast and lets the reader close it', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('go'));
    });
    expect(await screen.findByText('Saved your batch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(screen.queryByText('Saved your batch')).not.toBeInTheDocument());
  });
});
