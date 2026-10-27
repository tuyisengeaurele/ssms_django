import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { AxiosError } from 'axios';

const create = vi.hoisted(() => vi.fn());
const getPlaces = vi.hoisted(() => vi.fn());
vi.mock('../../services/farm.service', () => ({ farmService: { create } }));
vi.mock('../../services/location.service', () => ({ locationService: { getPlaces, locate: vi.fn() } }));

const TREE: Record<string, { code: string; name: string }[]> = {
  '': [{ code: '5', name: 'Eastern Province' }],
  '5': [{ code: '503', name: 'Gatsibo' }],
  '503': [{ code: '050301', name: 'Kageyo' }],
  '050301': [{ code: '5030101', name: 'Akabare' }],
  '5030101': [{ code: '503010101', name: 'Kabeza' }],
};

/** Picks Eastern Province down to Kabeza village, waiting for each list to load. */
async function chooseThePlace() {
  const pick = async (label: RegExp, code: string, name: string) => {
    const select = screen.getByLabelText(label);
    await within(select).findByRole('option', { name });
    fireEvent.change(select, { target: { value: code } });
  };
  await pick(/^Province/, '5', 'Eastern Province');
  await pick(/^District/, '503', 'Gatsibo');
  await pick(/^Sector/, '050301', 'Kageyo');
  await pick(/^Cell/, '5030101', 'Akabare');
  await pick(/^Village/, '503010101', 'Kabeza');
}

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
  getPlaces.mockImplementation((parent?: string) => Promise.resolve({ data: { data: TREE[parent ?? ''] ?? [] } }));
});

describe('New farm page', () => {
  it('has one title and a way back', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'New farm' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to farms/ })).toHaveAttribute('href', '/farms');
  });

  it('asks for a name and a place chosen from lists, with hints', async () => {
    open();
    expect(screen.getByLabelText(/^Farm name/)).toBeRequired();
    for (const label of ['Province', 'District', 'Sector', 'Cell', 'Village']) expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeRequired();
    expect(screen.getByLabelText(/^Street or landmark/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Farm name/)).toHaveAccessibleDescription(/A name you will recognise/);
    expect(await within(screen.getByLabelText(/^Province/)).findByRole('option', { name: 'Eastern Province' })).toBeInTheDocument();
  });

  it('has no free text box for the location any more', () => {
    open();
    expect(screen.queryByLabelText(/^Location/)).not.toBeInTheDocument();
  });

  it('creates the farm and opens it', async () => {
    create.mockResolvedValue({ data: { data: { id: 'f9' } } });
    open();
    fireEvent.change(screen.getByLabelText(/^Farm name/), { target: { value: 'Karame Silk Farm' } });
    await chooseThePlace();
    fireEvent.change(screen.getByLabelText(/^Street or landmark/), { target: { value: 'KG 9 Ave' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create farm' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      name: 'Karame Silk Farm', provinceCode: '5', districtCode: '503', sectorCode: '050301', cellCode: '5030101', villageCode: '503010101', street: 'KG 9 Ave',
    }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/farms/f9'));
  });

  it('shows what went wrong in plain words', async () => {
    create.mockRejectedValue(new AxiosError('x', '400', undefined, undefined, { data: { message: 'A farm with that name already exists.' }, status: 400, statusText: '', headers: {}, config: {} as never }));
    open();
    fireEvent.change(screen.getByLabelText(/^Farm name/), { target: { value: 'Karame' } });
    await chooseThePlace();
    fireEvent.click(screen.getByRole('button', { name: 'Create farm' }));
    expect(await screen.findByText('A farm with that name already exists.')).toBeInTheDocument();
  });

  it('is one narrow form with nothing beside it', () => {
    const { container } = open();
    expect(screen.queryByRole('list', { name: 'What comes next' })).not.toBeInTheDocument();
    expect(container.querySelector('.next-steps, .form-page')).toBeNull();
    expect(container.querySelector('.page-narrow')).not.toBeNull();
    expect(container.textContent).not.toMatch(/ResNet|AI-powered|\bAI\b/);
  });

  it('keeps the icon tiles and the tip box out', () => {
    const { container } = open();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/var\(--brand-50\)|brand-100/);
  });
});
