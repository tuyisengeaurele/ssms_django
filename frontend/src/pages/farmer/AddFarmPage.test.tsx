import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { AxiosError } from 'axios';

const create = vi.hoisted(() => vi.fn());
vi.mock('../../services/farm.service', () => ({ farmService: { create } }));

import AddFarmPage from './AddFarmPage';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function open() {
  return render(
    <MemoryRouter initialEntries={['/farms/new']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/farms/new" element={<AddFarmPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('New farm page', () => {
  it('has one title and a way back', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'New farm' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to farms/ })).toHaveAttribute('href', '/farms');
  });

  it('asks for a name and a place, with hints', () => {
    open();
    expect(screen.getByLabelText(/^Farm name/)).toBeRequired();
    expect(screen.getByLabelText(/^Location/)).toBeRequired();
    expect(screen.getByLabelText(/^Farm name/)).toHaveAccessibleDescription(/A name you will recognise/);
  });

  it('creates the farm and opens it', async () => {
    create.mockResolvedValue({ data: { data: { id: 'f9' } } });
    open();
    fireEvent.change(screen.getByLabelText(/^Farm name/), { target: { value: 'Karame Silk Farm' } });
    fireEvent.change(screen.getByLabelText(/^Location/), { target: { value: 'Gatsibo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create farm' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'Karame Silk Farm', location: 'Gatsibo' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/farms/f9'));
  });

  it('shows what went wrong in plain words', async () => {
    create.mockRejectedValue(new AxiosError('x', '400', undefined, undefined, { data: { message: 'A farm with that name already exists.' }, status: 400, statusText: '', headers: {}, config: {} as never }));
    open();
    fireEvent.change(screen.getByLabelText(/^Farm name/), { target: { value: 'Karame' } });
    fireEvent.change(screen.getByLabelText(/^Location/), { target: { value: 'Gatsibo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create farm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A farm with that name already exists.');
  });

  it('lists what comes next without naming the model', () => {
    const { container } = open();
    const steps = screen.getByRole('list', { name: 'What comes next' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(4);
    expect(container.textContent).not.toMatch(/ResNet|AI-powered|\bAI\b/);
  });

  it('keeps the icon tiles and the tip box out', () => {
    const { container } = open();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/var\(--brand-50\)|brand-100/);
  });
});
