import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';
import type { ContactMessage } from '../../types';

// Answering a contact message from inside the app, through the page a person uses.

const base = (over: Partial<ContactMessage>): ContactMessage => ({
  id: 'm1', name: 'Aline Uwase', email: 'aline@coop.rw', subject: 'Message to SSMS', message: 'Can someone visit our farm next week?',
  isRead: true, createdAt: '2026-10-07T09:30:00Z', language: 'en', replies: [], repliedAt: null, repliedBy: null, ...over,
});

const api = vi.hoisted(() => ({ getAll: vi.fn(), markRead: vi.fn(), markReplied: vi.fn(), unmarkReplied: vi.fn(), reply: vi.fn() }));
vi.mock('../../services/contacts.service', () => ({ contactsService: api }));

import AdminContactsPage from './AdminContactsPage';

const me = { id: 'me', name: 'Demo Admin' };
const replied = (message: ContactMessage, body: string, language = message.language): ContactMessage => ({
  ...message, language, isRead: true, repliedAt: '2026-10-08T11:00:00Z', repliedBy: me,
  replies: [{ id: 'r1', body, sentAt: '2026-10-08T11:00:00Z', sentBy: me }],
});
const failure = (status: number) => Object.assign(new Error('x'), { response: { status } });

let inbox: ContactMessage[];

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  inbox = [
    base({}),
    base({ id: 'm2', name: 'Jean Bosco', email: 'jean@x.rw', message: 'Muraho, ndashaka kumenya uko mwadufasha.', language: 'rw' }),
  ];
  api.getAll.mockImplementation(async () => ({ data: { data: inbox } }));
  api.markRead.mockResolvedValue({ data: { data: {} } });
  api.reply.mockImplementation(async (id: string, sent: { body: string; language: 'en' | 'fr' | 'rw' }) => ({
    data: { data: replied(inbox.find((m) => m.id === id) as ContactMessage, sent.body, sent.language) },
  }));
});

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AdminContactsPage />
      </ToastProvider>
    </LanguageProvider>,
  );
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('button') as HTMLElement;
async function openMessage(name = 'Aline Uwase') {
  fireEvent.click(await rowOf(name));
  return screen.findByRole('dialog');
}
const button = (dialog: HTMLElement, name: string) => within(dialog).getByRole('button', { name });
const noButton = (dialog: HTMLElement, name: string) => expect(within(dialog).queryByRole('button', { name })).not.toBeInTheDocument();
const textBox = (dialog: HTMLElement) => within(dialog).getByRole('textbox', { name: 'Your reply' }) as HTMLTextAreaElement;
const languageBox = (dialog: HTMLElement) => within(dialog).getByRole('combobox', { name: 'Email language' }) as HTMLSelectElement;

async function startReply(name = 'Aline Uwase') {
  const dialog = await openMessage(name);
  fireEvent.click(button(dialog, 'Reply'));
  return dialog;
}

const type = (dialog: HTMLElement, value: string) => fireEvent.change(textBox(dialog), { target: { value } });

describe('opening the reply box', () => {
  it('opens under the message with the cursor in it, and the buttons become Cancel and Send reply', async () => {
    open();
    const dialog = await openMessage();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(button(dialog, 'Reply'));
    expect(textBox(dialog)).toHaveFocus();
    const message = within(dialog).getByText('Can someone visit our farm next week?');
    expect(message.compareDocumentPosition(textBox(dialog)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button(dialog, 'Cancel')).toBeInTheDocument();
    expect(button(dialog, 'Send reply')).toBeInTheDocument();
    noButton(dialog, 'Reply');
  });

  it('says who gets it, and in which language, starting from the language of the message', async () => {
    open();
    const dialog = await startReply('Jean Bosco');
    expect(within(dialog).getByText('To jean@x.rw')).toBeInTheDocument();
    expect(languageBox(dialog).value).toBe('rw');
    expect(Array.from(languageBox(dialog).options).map((o) => o.textContent)).toEqual(['English', 'Français', 'Kinyarwanda']);
  });

  it('keeps Send off while there is nothing but spaces', async () => {
    open();
    const dialog = await startReply();
    expect(button(dialog, 'Send reply')).toBeDisabled();
    type(dialog, '   \n ');
    expect(button(dialog, 'Send reply')).toBeDisabled();
    type(dialog, 'Hello');
    expect(button(dialog, 'Send reply')).toBeEnabled();
  });

  it('counts the characters only near the limit', async () => {
    open();
    const dialog = await startReply();
    expect(textBox(dialog)).toHaveAttribute('maxlength', '5000');
    type(dialog, 'x'.repeat(4500));
    expect(within(dialog).queryByText(/of 5000/)).not.toBeInTheDocument();
    type(dialog, 'x'.repeat(4501));
    expect(within(dialog).getByText('4501 of 5000')).toBeInTheDocument();
  });

  it('gives the cursor back to the Reply button after Cancel', async () => {
    open();
    const dialog = await startReply();
    fireEvent.click(button(dialog, 'Cancel'));
    await waitFor(() => expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument());
    expect(button(dialog, 'Reply')).toHaveFocus();
  });
});

describe('the keyboard in the reply box', () => {
  it.each([['Control'], ['Meta']])('sends with %s and Enter', async (key) => {
    const user = userEvent.setup();
    open();
    const dialog = await startReply();
    await user.type(textBox(dialog), 'Thank you.');
    await user.keyboard(`{${key}>}{Enter}{/${key}}`);
    await waitFor(() => expect(api.reply).toHaveBeenCalledTimes(1));
  });

  it('adds a line with Enter alone', async () => {
    const user = userEvent.setup();
    open();
    const dialog = await startReply();
    await user.type(textBox(dialog), 'One{Enter}Two');
    expect(textBox(dialog).value).toBe('One\nTwo');
    expect(api.reply).not.toHaveBeenCalled();
  });

  it('closes the box at the first Escape, and the message at the second', async () => {
    const user = userEvent.setup();
    open();
    const dialog = await startReply();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('a draft', () => {
  it('is still there, with its language, after the message was closed by mistake', async () => {
    open();
    let dialog = await startReply();
    type(dialog, 'Half written');
    fireEvent.change(languageBox(dialog), { target: { value: 'fr' } });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    dialog = await openMessage();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(button(dialog, 'Reply'));
    expect(textBox(dialog).value).toBe('Half written');
    expect(languageBox(dialog).value).toBe('fr');
  });

  it('belongs to one message only', async () => {
    open();
    const first = await startReply();
    type(first, 'For Aline');
    fireEvent.click(within(first).getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const second = await startReply('Jean Bosco');
    expect(textBox(second).value).toBe('');
  });
});

describe('sending', () => {
  it('holds still while it goes: no second send, no typing, no closing', async () => {
    const user = userEvent.setup();
    let finish: (v: unknown) => void = () => {};
    api.reply.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    open();
    const dialog = await startReply();
    type(dialog, 'Thank you.');
    const send = button(dialog, 'Send reply');
    fireEvent.click(send);
    fireEvent.click(send);
    const busy = await within(dialog).findByRole('button', { name: 'Sending' });
    expect(busy).toBeDisabled();
    expect(busy.querySelector('.spinner')).not.toBeNull();
    expect(button(dialog, 'Cancel')).toBeDisabled();
    expect(textBox(dialog)).toHaveAttribute('readonly');
    expect(languageBox(dialog)).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(textBox(dialog)).toBeInTheDocument();
    expect(api.reply).toHaveBeenCalledTimes(1);
    finish({ data: { data: replied(inbox[0], 'Thank you.') } });
    expect(await within(dialog).findByText(/Replied by Demo Admin, /)).toBeInTheDocument();
  });

  it('shows the reply under the message, says so, and counts the message as answered', async () => {
    open();
    const dialog = await startReply();
    type(dialog, '  Thank you.\nWe can visit.  ');
    fireEvent.change(languageBox(dialog), { target: { value: 'fr' } });
    fireEvent.click(button(dialog, 'Send reply'));
    await waitFor(() => expect(api.reply).toHaveBeenCalledWith('m1', { body: 'Thank you.\nWe can visit.', language: 'fr' }));
    expect(await within(dialog).findByText(/Replied by Demo Admin, /)).toBeInTheDocument();
    expect(within(dialog).getByText(/We can visit\./)).toHaveClass('message-body');
    expect(within(dialog).getByText('The talk goes on in the SSMS mailbox.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    noButton(dialog, 'Reply');
    noButton(dialog, 'Send reply');
    expect(await screen.findByText('Reply sent.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Answered (1)' })).toBeInTheDocument();
  });

  it('keeps the text and says so beside Send when the reply did not go', async () => {
    api.reply.mockRejectedValueOnce(failure(502));
    open();
    const dialog = await startReply();
    type(dialog, 'Thank you.');
    fireEvent.click(button(dialog, 'Send reply'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The reply was not sent. Try again.');
    expect(textBox(dialog).value).toBe('Thank you.');
    expect(button(dialog, 'Send reply')).toBeEnabled();
    expect(screen.getByRole('tab', { name: 'Answered (0)' })).toBeInTheDocument();
    type(dialog, 'Thank you!');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when too many replies went out', async () => {
    api.reply.mockRejectedValueOnce(failure(429));
    open();
    const dialog = await startReply();
    type(dialog, 'Thank you.');
    fireEvent.click(button(dialog, 'Send reply'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many replies. Try later.');
  });

  it('says that someone else answered first, and shows their reply', async () => {
    api.reply.mockImplementationOnce(async () => {
      inbox = [replied(inbox[0], 'Answered by a colleague.'), inbox[1]];
      throw failure(409);
    });
    open();
    const dialog = await startReply();
    type(dialog, 'Thank you.');
    fireEvent.click(button(dialog, 'Send reply'));
    expect(await within(dialog).findByText('Someone already replied.')).toBeInTheDocument();
    expect(await within(dialog).findByText('Answered by a colleague.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(api.getAll).toHaveBeenCalledTimes(2);
  });
});

describe('what an opened message shows', () => {
  it('shows a reply sent earlier, and offers no second one', async () => {
    inbox = [replied(inbox[0], 'We came on Tuesday.')];
    open();
    const dialog = await openMessage();
    expect(within(dialog).getByText(/Replied by Demo Admin, /)).toBeInTheDocument();
    expect(within(dialog).getByText('We came on Tuesday.')).toBeInTheDocument();
    noButton(dialog, 'Reply');
  });

  it('shows a reply whose writer has since been removed', async () => {
    inbox = [base({ repliedAt: '2026-10-08T11:00:00Z', replies: [{ id: 'r1', body: 'Still here.', sentAt: '2026-10-08T11:00:00Z', sentBy: null }] })];
    open();
    const dialog = await openMessage();
    expect(within(dialog).getByText(/^Replied /)).toBeInTheDocument();
    expect(within(dialog).getByText('Still here.')).toBeInTheDocument();
  });

  it('keeps a mark made by hand, and still offers a reply, because none was sent from the app', async () => {
    inbox = [base({ repliedAt: '2026-10-08T10:00:00Z', repliedBy: { id: 'u1', name: 'Eric Niyonzima' } })];
    open();
    const dialog = await openMessage();
    expect(within(dialog).getByText(/Answered by Eric Niyonzima, /)).toBeInTheDocument();
    expect(button(dialog, 'Reply')).toBeInTheDocument();
  });

  it.each([
    ['fr', 'Répondre', 'Votre réponse', 'Envoyer la réponse'],
    ['rw', 'Subiza', 'Igisubizo cyawe', 'Ohereza igisubizo'],
  ])('reads in %s', async (locale, reply, label, send) => {
    localStorage.setItem('ssms_locale', locale);
    open();
    const dialog = await openMessage();
    fireEvent.click(button(dialog, reply));
    expect(within(dialog).getByRole('textbox', { name: label })).toBeInTheDocument();
    expect(button(dialog, send)).toBeInTheDocument();
  });
});
