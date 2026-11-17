import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { ToastProvider } from '../context/ToastContext';
import { fakeCatalog as fake } from '../test/fakeCatalog';
import { useLanguagePicker } from './useLanguagePicker';

// A switch that has to download can be slow, and with no signal it can fail. The person is told in both cases.

vi.mock('../i18n/catalog', async () => (await import('../test/fakeCatalog')).fakeCatalogModule);

function Harness() {
  const { locale, choose, pending } = useLanguagePicker();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="pending">{pending ?? 'none'}</span>
      <button onClick={() => void choose('fr')}>French</button>
    </div>
  );
}

const withToasts = () =>
  render(
    <LanguageProvider>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  fake.reset();
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});

describe('a switch that fails to download', () => {
  it('says so in a toast, in the language still on screen, naming the one that did not load', async () => {
    withToasts();
    await userEvent.click(screen.getByRole('button', { name: 'French' }));
    await act(async () => fake.fail('fr'));
    expect(await screen.findByText('Could not load Français. Check your connection and try again.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });

  it('offers to try again, and the second try can succeed', async () => {
    withToasts();
    await userEvent.click(screen.getByRole('button', { name: 'French' }));
    await act(async () => fake.fail('fr'));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }, { timeout: 5000 }));
    expect(screen.getByTestId('pending')).toHaveTextContent('fr');
    await act(async () => fake.arrive('fr'));
    expect(screen.getByTestId('locale')).toHaveTextContent('fr');
  });

  it('does not break where there is no toast list to show it in', async () => {
    render(
      <LanguageProvider>
        <Harness />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'French' }));
    await act(async () => fake.fail('fr'));
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });
});

describe('a switch that works', () => {
  it('shows no toast', async () => {
    withToasts();
    await userEvent.click(screen.getByRole('button', { name: 'French' }));
    await act(async () => fake.arrive('fr'));
    expect(screen.getByTestId('locale')).toHaveTextContent('fr');
    expect(screen.queryByText(/Impossible de charger|Could not load/)).not.toBeInTheDocument();
  });

  it('reports the language on its way while it downloads', async () => {
    withToasts();
    await userEvent.click(screen.getByRole('button', { name: 'French' }));
    expect(screen.getByTestId('pending')).toHaveTextContent('fr');
    await act(async () => fake.arrive('fr'));
    expect(screen.getByTestId('pending')).toHaveTextContent('none');
  });
});
