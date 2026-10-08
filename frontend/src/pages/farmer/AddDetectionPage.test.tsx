import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../services/detection.service', () => ({ detectionService: { create: api.create } }));

import AddDetectionPage from './AddDetectionPage';

const photo = (name = 'worm.jpg', type = 'image/jpeg') => new File(['x'.repeat(2048)], name, { type });

const outcome = (over: object = {}) => ({
  data: {
    data: {
      id: 'd1', batchId: 'b1', imageUrl: '', result: 'Flacherie', confidence: 0.834, detectedAt: '2026-10-01T00:00:00Z',
      allScores: { Healthy: 0.1, Flacherie: 0.834, Grasserie: 0.04, Muscardine: 0.02, Pebrine: 0.006 },
      ...over,
    },
  },
});

function open() {
  return render(
    <MemoryRouter initialEntries={['/batches/b1/detect']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/batches/:id/detect" element={<AddDetectionPage />} />
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const choose = (file: File) => fireEvent.change(screen.getByLabelText(/^Choose a photo/), { target: { files: [file] } });

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
});

describe('Disease check page', () => {
  it('has one title and a way back to the batch', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Disease check' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to the batch/ })).toHaveAttribute('href', '/batches/b1');
  });

  it('lets the keyboard reach the file field and keeps the check button off until a photo is chosen', () => {
    open();
    expect(screen.getByLabelText(/^Choose a photo/)).toHaveAttribute('type', 'file');
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeDisabled();
  });

  it('shows the chosen photo with its name and size', async () => {
    open();
    choose(photo());
    expect(await screen.findByRole('img', { name: 'The photo you chose' })).toBeInTheDocument();
    expect(screen.getByText('worm.jpg (2.0 KB)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeEnabled();
  });

  it('refuses a file that is not a photo and says what to do', () => {
    open();
    choose(photo('notes.pdf', 'application/pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose a JPEG, PNG or WebP photo.');
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeDisabled();
  });

  it('sends the photo and the notes, then shows the result with a plain percentage', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    const file = photo();
    choose(file);
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: 'Second tray' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('b1', file, 'Second tray'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Flacherie' })).toBeInTheDocument();
    expect(screen.getByText('83% sure')).toBeInTheDocument();
  });

  it('asks for care when a disease may be present, and says the check can be wrong', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    choose(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    expect(await screen.findByText(/may be present/)).toBeInTheDocument();
    expect(screen.getByText(/can make mistakes/)).toBeInTheDocument();
  });

  it('is calm when the worm looks healthy', async () => {
    api.create.mockResolvedValue(outcome({ result: 'Healthy', confidence: 0.97 }));
    open();
    choose(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    expect(await screen.findByText(/No sign of disease/)).toBeInTheDocument();
    expect(screen.queryByText(/may be present/)).not.toBeInTheDocument();
  });

  it('lists every score as a bar list, highest first', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    choose(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    const list = await screen.findByRole('list', { name: 'How likely each condition is' });
    const names = within(list).getAllByRole('listitem').map((li) => li.querySelector('.barlist-label')?.textContent);
    expect(names).toEqual(['Flacherie', 'Healthy', 'Grasserie', 'Muscardine', 'Pebrine']);
    expect(within(list).getByText('83%')).toBeInTheDocument();
  });

  it('starts over with another photo', async () => {
    api.create.mockResolvedValue(outcome());
    open();
    choose(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check another photo' }));
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeDisabled();
    expect(screen.queryByRole('heading', { level: 2, name: 'Flacherie' })).not.toBeInTheDocument();
  });

  it('shows a friendly message when the check fails and keeps the photo', async () => {
    api.create.mockRejectedValue(new Error('x'));
    open();
    choose(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeEnabled();
  });

  it('gives tips for a good photo and names the conditions it knows', () => {
    open();
    const tips = screen.getByRole('list', { name: 'Tips for a good photo' });
    expect(within(tips).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText(/Healthy, Flacherie, Grasserie, Muscardine and Pebrine/)).toBeInTheDocument();
  });

  it('keeps the model name, the AI wording, the tip box and the old colours out', async () => {
    api.create.mockResolvedValue(outcome());
    const { container } = open();
    choose(photo());
    fireEvent.click(screen.getByRole('button', { name: 'Check this photo' }));
    await screen.findByText('83% sure');
    expect(container.textContent).not.toMatch(/\bAI\b|ResNet|Instant|under 5 seconds|powered/i);
    expect(container.querySelector('.progress-bar, .progress-fill')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#dc2626|#16a34a|#d97706|#7c3aed|#db2777|brand-50|warning-bg/);
  });
});
