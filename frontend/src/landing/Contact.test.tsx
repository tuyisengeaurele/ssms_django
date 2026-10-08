import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { Contact, submitContact } from './Contact';
import { Cta } from './Cta';
import { Footer } from './Footer';
import { Turnstile } from './Turnstile';

function wrap(node: JSX.Element) {
  return render(
    <MemoryRouter>
      <LanguageProvider>{node}</LanguageProvider>
    </MemoryRouter>,
  );
}

function reply(status: number, body: unknown = { success: status < 400 }) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText('Name'), 'Aline');
  await userEvent.type(screen.getByLabelText('Email'), 'aline+test@example.rw');
  await userEvent.type(screen.getByLabelText('Subject'), 'Cooperative setup');
  await userEvent.type(screen.getByLabelText('Message'), 'We would like to start with twelve farmers.');
}

describe('Contact form', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for every field before sending anything', async () => {
    wrap(<Contact />);
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getAllByText('This field is required.')).toHaveLength(4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the email address', async () => {
    wrap(<Contact />);
    await userEvent.type(screen.getByLabelText('Name'), 'Aline');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Subject'), 'Hello');
    await userEvent.type(screen.getByLabelText('Message'), 'A message that is long enough.');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for at least ten characters in the message', async () => {
    wrap(<Contact />);
    await userEvent.type(screen.getByLabelText('Name'), 'Aline');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.rw');
    await userEvent.type(screen.getByLabelText('Subject'), 'Hello');
    await userEvent.type(screen.getByLabelText('Message'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByText('Write at least 10 characters.')).toBeInTheDocument();
  });

  it('posts the form as JSON to the contact endpoint', async () => {
    fetchMock.mockResolvedValue(reply(201));
    wrap(<Contact />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/contact$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Aline',
      email: 'aline+test@example.rw',
      subject: 'Cooperative setup',
      message: 'We would like to start with twelve farmers.',
      website: '',
    });
  });

  it('sends only once when the button is pressed twice', async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
    wrap(<Contact />);
    await fillValid();
    const button = screen.getByRole('button', { name: 'Send message' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Sending' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(reply(201));
    expect(await screen.findByText('Message received.')).toBeInTheDocument();
  });

  it('shows the confirmation with the typed address as plain text', async () => {
    fetchMock.mockResolvedValue(reply(201));
    wrap(<Contact />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Message received.')).toBeInTheDocument();
    expect(screen.getByText('We sent a confirmation to aline+test@example.rw. We will reply soon.')).toBeInTheDocument();
  });

  it('explains a rate limit', async () => {
    fetchMock.mockResolvedValue(reply(429, { success: false }));
    wrap(<Contact />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many messages. Please wait a bit.');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });

  it('explains a server error and keeps what was typed', async () => {
    fetchMock.mockResolvedValue(reply(500, { success: false }));
    wrap(<Contact />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send your message. Please try again.');
    expect(screen.getByLabelText('Name')).toHaveValue('Aline');
  });

  it('explains a lost connection', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    wrap(<Contact />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection. Check your network and try again.');
  });

  it('has a hidden trap field that people never reach', () => {
    const { container } = wrap(<Contact />);
    const trap = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap).toHaveAttribute('autocomplete', 'off');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('still posts what a bot typed into the trap so the server can drop it', async () => {
    fetchMock.mockResolvedValue(reply(201));
    const { container } = wrap(<Contact />);
    fireEvent.change(container.querySelector('input[name="website"]') as HTMLInputElement, { target: { value: 'http://spam.example' } });
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).website).toBe('http://spam.example');
  });
});

describe('submitContact', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports ok for a success reply and the status for a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(201)).mockResolvedValueOnce(reply(429, { success: false })));
    const payload = { name: 'a', email: 'a@b.rw', subject: 's', message: 'long enough message', website: '' };
    expect(await submitContact(payload)).toEqual({ ok: true, status: 201 });
    expect(await submitContact(payload)).toEqual({ ok: false, status: 429 });
  });

  it('reports status 0 when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const payload = { name: 'a', email: 'a@b.rw', subject: 's', message: 'long enough message', website: '' };
    expect(await submitContact(payload)).toEqual({ ok: false, status: 0 });
  });

  it('adds the bot check token when there is one', async () => {
    const mock = vi.fn().mockResolvedValue(reply(201));
    vi.stubGlobal('fetch', mock);
    await submitContact({ name: 'a', email: 'a@b.rw', subject: 's', message: 'long enough message', website: '' }, 'tok123');
    expect(JSON.parse(mock.mock.calls[0][1].body).turnstileToken).toBe('tok123');
  });
});

describe('Turnstile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    document.querySelectorAll('script[data-turnstile]').forEach((el) => el.remove());
  });

  it('renders nothing without a site key', () => {
    const { container } = render(<Turnstile onToken={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('script[data-turnstile]')).toBeNull();
  });

  it('loads the Cloudflare script once when a site key is set', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
    render(<Turnstile onToken={() => {}} />);
    render(<Turnstile onToken={() => {}} />);
    expect(document.querySelectorAll('script[data-turnstile]')).toHaveLength(1);
  });
});

describe('Call to action and footer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has one clear button to register', () => {
    wrap(<Cta />);
    expect(screen.getByRole('heading', { level: 2, name: 'Ready to raise healthier silkworms?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get started/ })).toHaveAttribute('href', '/register');
  });

  it('names the project, links the legal pages and credits the photos', () => {
    wrap(<Footer />);
    expect(screen.getByText('Smart Sericulture Management System')).toBeInTheDocument();
    expect(screen.getByText('Built in Rwanda.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByText('Photos from Pexels.')).toBeInTheDocument();
  });
});
