import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const api = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { decisionCount: api.count } }));

import DecisionsCard from './DecisionsCard';

const answer = (count: number) => api.count.mockResolvedValue({ data: { data: { count, rooms: count, allowance: 0 } } });
const show = () => render(<MemoryRouter><LanguageProvider><DecisionsCard /></LanguageProvider></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DecisionsCard', () => {
  it('says how many decisions wait, and links to them', async () => {
    answer(3);
    show();
    const link = await screen.findByRole('link', { name: '3 decisions wait for you' });
    expect(link).toHaveAttribute('href', '/decisions');
  });

  it('says it in the singular for one', async () => {
    answer(1);
    show();
    expect(await screen.findByRole('link', { name: '1 decision waits for you' })).toBeInTheDocument();
  });

  it('shows nothing when nothing waits, or when the count cannot be had', async () => {
    answer(0);
    const first = show();
    await waitFor(() => expect(api.count).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    first.unmount();
    api.count.mockRejectedValue(new Error('down'));
    show();
    await waitFor(() => expect(api.count).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
