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

function Undoable({ onUndo }: { onUndo: () => void }) {
  const { success } = useToast();
  return <button onClick={() => success('Marked as read.', { label: 'Undo', onClick: onUndo })}>mark</button>;
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
    // The animation library loads on the first toast, which is slow while other tests run.
    expect(await screen.findByText('Saved your batch', {}, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(screen.queryByText('Saved your batch')).not.toBeInTheDocument(), { timeout: 5000 });
  });

  it('shows an Undo button on a toast that has an action, and runs it once', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Undoable onUndo={onUndo} />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('mark'));
    });
    const undo = await screen.findByRole('button', { name: 'Undo' }, { timeout: 5000 });
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(screen.queryByText('Marked as read.')).not.toBeInTheDocument(), { timeout: 5000 });
  });

  it('shows no action button on an ordinary toast', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('go'));
    });
    await screen.findByText('Saved your batch', {}, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  describe('how each kind is told apart', () => {
    function Every() {
      const { success, error, warning, toast } = useToast();
      return (
        <>
          <button onClick={() => success('It worked')}>ok</button>
          <button onClick={() => error('It failed')}>bad</button>
          <button onClick={() => warning('Careful')}>warn</button>
          <button onClick={() => toast('Just so you know')}>note</button>
        </>
      );
    }

    async function show(button: string, message: string) {
      const view = render(
        <ToastProvider>
          <Every />
        </ToastProvider>,
      );
      await act(async () => {
        fireEvent.click(screen.getByText(button));
      });
      const element = (await screen.findByText(message, {}, { timeout: 5000 })).closest('.toast') as HTMLElement;
      return { view, element };
    }

    it('shows a failure with one cross only, the one that closes it', async () => {
      const { element } = await show('bad', 'It failed');
      expect(element.textContent?.match(/✕/g) ?? []).toHaveLength(1);
      expect(element.querySelector('.toast-close')?.textContent).toBe('✕');
      expect(element.querySelector('.toast-icon')).toBeNull();
    });

    it('shows a success with no tick', async () => {
      const { element } = await show('ok', 'It worked');
      expect(element.textContent).not.toContain('✓');
      expect(element.querySelector('.toast-icon')).toBeNull();
    });

    it.each([['warn', 'Careful'], ['note', 'Just so you know']])('draws no symbol on the %s toast either', async (button, message) => {
      const { element } = await show(button, message);
      expect(element.querySelector('.toast-icon')).toBeNull();
      expect(element.textContent).toBe(`${message}✕`);
    });

    it.each([['ok', 'It worked', 'toast-success'], ['bad', 'It failed', 'toast-error'], ['warn', 'Careful', 'toast-warning'], ['note', 'Just so you know', 'toast-info']])(
      'tells the %s toast apart by its colour class',
      async (button, message, expected) => {
        const { element } = await show(button, message);
        expect(element).toHaveClass('toast', expected);
      },
    );

    it('still closes from the cross', async () => {
      const { element } = await show('bad', 'It failed');
      fireEvent.click(element.querySelector('.toast-close') as HTMLElement);
      await vi.waitFor(() => expect(screen.queryByText('It failed')).not.toBeInTheDocument(), { timeout: 5000 });
    });
  });
});
