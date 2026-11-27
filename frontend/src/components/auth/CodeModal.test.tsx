import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import CodeModal from './CodeModal';

// The dialog stays in the page between uses, so it still holds what happened last time. What it holds the first time it is
// drawn again is what a person can see, so these look at that very drawing: after React has changed the page, and before
// anything that runs afterwards has had a chance to tidy it.

interface Drawing {
  code: string;
  button: string;
  disabled: boolean;
  complaint: string;
  markedWrong: boolean;
}

function now(): Drawing {
  const box = document.querySelector('.modal-box')!;
  const button = box.querySelector<HTMLButtonElement>('button[type=submit]')!;
  return {
    code: box.querySelector('input')!.value,
    button: button.textContent ?? '',
    disabled: button.disabled,
    complaint: box.querySelector('[role=alert]')?.textContent ?? '',
    markedWrong: box.querySelector('.code-input')!.hasAttribute('data-invalid'),
  };
}

const CLEAN: Drawing = { code: '', button: 'Confirm', disabled: true, complaint: '', markedWrong: false };

let drawings: Drawing[] | null = null;
function Watch() {
  useLayoutEffect(() => {
    if (drawings && document.querySelector('.modal-box')) drawings.push(now());
  });
  return null;
}

function dialog(onSubmit: () => Promise<void>) {
  const page = (open: boolean) => (
    <LanguageProvider>
      <CodeModal open={open} title="Confirm with a code" body="Type a code." confirmLabel="Confirm" onSubmit={onSubmit} onCancel={() => {}} />
      <Watch />
    </LanguageProvider>
  );
  const view = render(page(true));
  return { show: (open: boolean) => view.rerender(page(open)) };
}

const send = (code: string) => {
  fireEvent.change(screen.getByLabelText('6 digit code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
};
const gone = () => waitFor(() => expect(document.querySelector('.modal-box')).toBeNull());

function firstDrawingAfterOpening(show: (open: boolean) => void): Drawing {
  drawings = [];
  show(true);
  const first = drawings[0];
  drawings = null;
  return first;
}

beforeEach(() => {
  localStorage.clear();
  setReducedMotion(true);
});

describe('The code dialog, opened again', () => {
  it('is clean from its first drawing after a code was accepted', async () => {
    const { show } = dialog(async () => {});
    send('123456');
    await waitFor(() => expect(document.querySelector('.spinner')).not.toBeNull());
    show(false);
    await gone();
    expect(firstDrawingAfterOpening(show)).toEqual(CLEAN);
  });

  it('is clean from its first drawing after a code was refused', async () => {
    const wrong = new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 422, data: {}, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
    });
    const { show } = dialog(async () => { throw wrong; });
    send('000000');
    await screen.findByRole('alert');
    show(false);
    await gone();
    expect(firstDrawingAfterOpening(show)).toEqual(CLEAN);
  });

  // It fades out as it was. Emptying it on the way out would be seen too.
  it('keeps what it showed while it is leaving', async () => {
    const { show } = dialog(async () => {});
    send('123456');
    await waitFor(() => expect(document.querySelector('.spinner')).not.toBeNull());
    show(false);
    expect(now()).toMatchObject({ code: '123456', disabled: true });
  });
});
