import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';

const api = vi.hoisted(() => ({ sendFeedback: vi.fn() }));
vi.mock('../../services/detection.service', () => ({ detectionService: { sendFeedback: api.sendFeedback } }));

import DetectionFeedback from './DetectionFeedback';

const show = (props: Partial<React.ComponentProps<typeof DetectionFeedback>> = {}) => render(
  <LanguageProvider>
    <ToastProvider>
      <DetectionFeedback detectionId="d1" {...props} />
    </ToastProvider>
  </LanguageProvider>,
);

const group = () => screen.getByRole('group', { name: 'Was this result correct?' });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.sendFeedback.mockResolvedValue({ data: { data: {} } });
});

describe('Detection feedback', () => {
  it('asks the question with a yes and a no', () => {
    show();
    expect(within(group()).getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(within(group()).getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('saves a yes at once and says thank you', async () => {
    show();
    fireEvent.click(within(group()).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(api.sendFeedback).toHaveBeenCalledWith('d1', { isCorrect: true }));
    expect(await screen.findByText('Thank you. Your answer was saved.')).toBeInTheDocument();
  });

  it('asks what it really was after a no, and sends it', async () => {
    show();
    fireEvent.click(within(group()).getByRole('button', { name: 'No' }));
    expect(api.sendFeedback).not.toHaveBeenCalled();
    const select = screen.getByLabelText('What was it?');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'I am not sure', 'Healthy', 'Grasserie', 'Something else',
    ]);
    fireEvent.change(select, { target: { value: 'Grasserie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send my answer' }));
    await waitFor(() => expect(api.sendFeedback).toHaveBeenCalledWith('d1', { isCorrect: false, actualResult: 'Grasserie' }));
    expect(await screen.findByText('Thank you. Your answer was saved.')).toBeInTheDocument();
  });

  it('accepts a no without saying what it was', async () => {
    show();
    fireEvent.click(within(group()).getByRole('button', { name: 'No' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send my answer' }));
    await waitFor(() => expect(api.sendFeedback).toHaveBeenCalledWith('d1', { isCorrect: false }));
  });

  it('shows which answer is chosen to a screen reader', () => {
    show();
    const no = within(group()).getByRole('button', { name: 'No' });
    expect(no).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(no);
    expect(no).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the person change a saved answer', async () => {
    show();
    fireEvent.click(within(group()).getByRole('button', { name: 'Yes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change my answer' }));
    expect(within(group()).getByRole('button', { name: 'No' })).toBeEnabled();
    expect(screen.queryByText('Thank you. Your answer was saved.')).not.toBeInTheDocument();
  });

  it('shows an answer that was given before', () => {
    show({ initial: { isCorrect: false, actualResult: 'Grasserie' } });
    expect(screen.getByText('Thank you. Your answer was saved.')).toBeInTheDocument();
  });

  it('says what went wrong and keeps the question open when saving fails', async () => {
    api.sendFeedback.mockRejectedValue(new AxiosError('x', '500', undefined, undefined, { status: 500, data: { message: 'Something went wrong on our side. Please try again.' } } as never));
    show();
    fireEvent.click(within(group()).getByRole('button', { name: 'Yes' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(within(group()).getByRole('button', { name: 'Yes' })).toBeEnabled();
    expect(screen.queryByText('Thank you. Your answer was saved.')).not.toBeInTheDocument();
  });

  it('cannot be pressed twice while it is saving', async () => {
    let finish: (v: unknown) => void = () => undefined;
    api.sendFeedback.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    show();
    fireEvent.click(within(group()).getByRole('button', { name: 'Yes' }));
    expect(within(group()).getByRole('button', { name: 'Yes' })).toBeDisabled();
    expect(within(group()).getByRole('button', { name: 'No' })).toBeDisabled();
    finish({ data: { data: {} } });
    await screen.findByText('Thank you. Your answer was saved.');
    expect(api.sendFeedback).toHaveBeenCalledTimes(1);
  });
});
