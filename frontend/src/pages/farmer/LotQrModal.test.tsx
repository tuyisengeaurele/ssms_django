import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn(), stop: vi.fn() }));
vi.mock('../../services/lot.service', () => ({ lotService: { getShare: api.get, createShare: api.create, stopShare: api.stop } }));
// The picture itself is the library's job. What matters here is what it is asked to encode.
vi.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr" data-value={value} /> }));

import LotQrModal from './LotQrModal';

const RECORD = { id: 'r1', batchId: 'b1', cocoonWeightKg: 18.5, qualityGrade: 'A', harvestedAt: '2026-10-01T09:00:00Z', createdAt: '', farmName: 'Hillside Farm' } as never;
const TOKEN = 'test-link-token';
const LINK = () => `${window.location.origin}/lot/${TOKEN}`;

function open(onClose = vi.fn()) {
  render(
    <LanguageProvider>
      <ToastProvider>
        <LotQrModal record={RECORD} onClose={onClose} />
      </ToastProvider>
    </LanguageProvider>,
  );
  return onClose;
}

const dialog = () => screen.findByRole('dialog', { name: 'QR code for this lot' });
const notShared = () => api.get.mockResolvedValue({ data: { data: { token: null, sharedAt: null } } });
const shared = () => api.get.mockResolvedValue({ data: { data: { token: TOKEN, sharedAt: '2026-10-02T08:00:00Z' } } });

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  notShared();
  api.create.mockResolvedValue({ data: { data: { token: TOKEN, sharedAt: '2026-10-02T08:00:00Z' } } });
  api.stop.mockResolvedValue({ data: { data: null } });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('a lot that is not shared yet', () => {
  it('does not mention the report before there is a code to print', async () => {
    open();
    await dialog();
    expect(screen.queryByText(/also printed on the batch report/)).not.toBeInTheDocument();
  });

  it('asks the server whether the lot has a link, for the right lot', async () => {
    open();
    await dialog();
    expect(api.get).toHaveBeenCalledWith('r1');
  });

  it('says what a buyer will see and what they will never see, before anything is made', async () => {
    open();
    const d = within(await dialog());
    expect(await d.findByText(/farm name and district, the dates, the weight and the grade/)).toBeInTheDocument();
    expect(d.getByText(/never shows your name, your contact details, the street, the exact position of the farm or your notes/)).toBeInTheDocument();
    expect(d.queryByTestId('qr')).not.toBeInTheDocument();
  });

  it('makes the code only when the farmer asks, and then shows it', async () => {
    open();
    const d = within(await dialog());
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.click(await d.findByRole('button', { name: 'Create the QR code' }));
    expect(await d.findByTestId('qr')).toHaveAttribute('data-value', LINK());
    expect(api.create).toHaveBeenCalledWith('r1');
    expect(await screen.findByText('QR code created.')).toBeInTheDocument();
  });

  it('keeps the farmer on the explanation when making the code fails', async () => {
    api.create.mockRejectedValue(new Error('down'));
    open();
    const d = within(await dialog());
    fireEvent.click(await d.findByRole('button', { name: 'Create the QR code' }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(d.queryByTestId('qr')).not.toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Create the QR code' })).toBeEnabled();
  });
});

describe('a lot that is shared', () => {
  beforeEach(shared);

  it('shows the code at once, for the address of the lot page', async () => {
    open();
    const d = within(await dialog());
    expect(await d.findByTestId('qr')).toHaveAttribute('data-value', LINK());
    expect(d.getByLabelText('Link')).toHaveValue(LINK());
  });

  it('says the code is also printed on the batch report', async () => {
    open();
    expect(await screen.findByText('This code is also printed on the batch report.')).toBeInTheDocument();
  });

  it('names the code for screen readers', async () => {
    open();
    expect(await screen.findByRole('img', { name: 'QR code. Scan it to see this lot.' })).toBeInTheDocument();
  });

  it('copies the link', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINK()));
    expect(await screen.findByText('Link copied.')).toBeInTheDocument();
  });

  it('says so when the link cannot be copied', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('blocked'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  });

  it('prints a sheet that names the lot above the code', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    open();
    const d = within(await dialog());
    fireEvent.click(await d.findByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    expect(d.getByText('Scan to see where this lot comes from.')).toBeInTheDocument();
    expect(d.getByText(/Hillside Farm/, { selector: '.lot-print-caption' })).toHaveTextContent('18.5 kg');
  });

  it('offers the code as an image', async () => {
    open();
    expect(await screen.findByRole('button', { name: 'Download image' })).toBeInTheDocument();
  });
});

describe('stopping the sharing', () => {
  beforeEach(shared);

  it('asks first, and says what happens to codes that were printed', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }));
    expect(screen.getByText(/Anyone who has this QR code will see a page that no longer works/)).toBeInTheDocument();
    expect(screen.getByText(/printed codes stop working/)).toBeInTheDocument();
    expect(api.stop).not.toHaveBeenCalled();
  });

  it('can be cancelled', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('qr')).toBeInTheDocument();
    expect(api.stop).not.toHaveBeenCalled();
  });

  it('ends the link and goes back to the explanation', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, stop sharing' }));
    await waitFor(() => expect(api.stop).toHaveBeenCalledWith('r1'));
    expect(await screen.findByRole('button', { name: 'Create the QR code' })).toBeInTheDocument();
    expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
    expect(await screen.findByText('The QR code no longer works.')).toBeInTheDocument();
  });

  it('keeps the code on screen when ending the link fails', async () => {
    api.stop.mockRejectedValue(new Error('down'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, stop sharing' }));
    await waitFor(() => expect(api.stop).toHaveBeenCalled());
    expect(await screen.findByTestId('qr')).toBeInTheDocument();
  });
});

describe('when things go wrong', () => {
  it('says so when the link cannot be read', async () => {
    api.get.mockRejectedValue(new Error('down'));
    open();
    expect(await screen.findByText('We could not load the QR code. Please try again.')).toBeInTheDocument();
  });

  it('closes', async () => {
    const onClose = open();
    await dialog();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows nothing without a lot', () => {
    render(<LanguageProvider><ToastProvider><LotQrModal record={null} onClose={() => {}} /></ToastProvider></LanguageProvider>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('in French', () => {
  it('reads in the language of the screen', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByRole('dialog', { name: 'Code QR de ce lot' })).toBeInTheDocument();
  });
});
