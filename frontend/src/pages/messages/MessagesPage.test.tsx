import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { MessagesContext, type ConversationNews, type OpenConversation } from '../../context/MessagesContext';
import { setReducedMotion } from '../../test/setup';
import type { ChatMessage, ConversationRow } from '../../types';

const api = vi.hoisted(() => ({ list: vi.fn(), one: vi.fn(), send: vi.fn(), read: vi.fn(), updates: vi.fn() }));
vi.mock('../../services/message.service', () => ({ messageService: api }));
const team = vi.hoisted(() => ({ getFarmers: vi.fn() }));
vi.mock('../../services/team.service', () => ({ teamService: team }));
const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, acting: null }) }));

import MessagesPage from './MessagesPage';

const FARMER = { id: 'f1', role: 'FARMER', name: 'Fidele', cooperativeId: 'k1', cooperativeName: 'Abahuje', supervisor: { id: 's1', name: 'Sara' } };
const SUPERVISOR = { id: 's1', role: 'SUPERVISOR', name: 'Sara', cooperativeId: 'k1', cooperativeName: 'Abahuje' };

const row = (over: Partial<ConversationRow> = {}): ConversationRow => ({
  id: 'c1', farmer: { id: 'f1', name: 'Fidele Farmer', photoUrl: null, former: false }, cooperative: { id: 'k1', name: 'Abahuje' },
  isOpen: true, unread: 0, lastMessage: { preview: 'I will come today.', fromFarmer: false, mine: false, createdAt: '2026-11-27T09:05:00+00:00' },
  ...over,
});

/** A message as the farmer is sent it. `mine` follows the signed in person in each test that needs the other side. */
const message = (id: string, body: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, body, fromFarmer: true, mine: true, sender: { id: 'f1', name: 'Fidele Farmer', former: false },
  createdAt: '2026-11-27T09:00:00+00:00', ...over,
});
const theirs = (id: string, body: string, over: Partial<ChatMessage> = {}) =>
  message(id, body, { fromFarmer: false, mine: false, sender: { id: 's1', name: 'Sara', former: false }, createdAt: '2026-11-27T09:05:00+00:00', ...over });

const SAID = message('m1', 'The worms stopped eating.');
const ANSWER = theirs('m2', 'I will come today.');

const listed = (rows: ConversationRow[], hasNext = false) => ({ data: { data: rows, pagination: { page: 1, hasNext } } });
const page = (messages: ChatMessage[] = [SAID, ANSWER], over: Record<string, unknown> = {}) =>
  ({ data: { data: { conversation: row(), messages, hasOlder: false, otherReadAt: null, ...over } } });
const sentAs = (m: ChatMessage, conversation = row()) => ({ data: { data: { conversation, message: m } } });

function refused(status: number, code: string, text = 'No.') {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { code, message: text }, headers: {} } as never);
}

// What the layout's shared check would be told, so a test can bring news by hand.
const shared = { watched: null as null | { open: OpenConversation; onNews: (news: ConversationNews) => void }, setUnread: vi.fn() };
const bring = (news: Partial<ConversationNews>) => act(async () => {
  shared.watched!.onNews({ isOpen: true, otherReadAt: null, messages: [], ...news });
});

let where = '';
let goTo: (to: string) => void = () => {};
function Where() {
  const location = useLocation();
  const navigate = useNavigate();
  where = location.pathname + location.search;
  goTo = (to) => navigate(to);
  return null;
}

function tree(path: string, unread = 0) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <MessagesContext.Provider value={{
          unread, setUnread: shared.setUnread,
          watch: (open, onNews) => {
            const mine = open ? { open, onNews } : null;
            shared.watched = mine;
            return () => { if (shared.watched === mine) shared.watched = null; };
          },
        }}
        >
          <Routes><Route path="/messages/:id?" element={<MessagesPage />} /></Routes>
          <Where />
        </MessagesContext.Provider>
      </LanguageProvider>
    </MemoryRouter>
  );
}

async function open(path = '/messages') {
  const view = render(tree(path));
  await act(async () => {});
  return view;
}

const box = () => screen.getByRole('textbox', { name: 'Your message' }) as HTMLTextAreaElement;
const write = (words: string) => fireEvent.change(box(), { target: { value: words } });
const sendButton = () => screen.getByRole('button', { name: 'Send' });
const press = () => act(async () => { fireEvent.click(sendButton()); });
const thread = () => screen.getByRole('list', { name: /Conversation with/ });
const texts = () => [...thread().querySelectorAll('.msg-body')].map((el) => el.textContent);
const announced = () => document.querySelector('[data-announcer]')!.textContent;
const scroller = () => document.querySelector<HTMLElement>('.msg-scroll')!;
/** Gives the scrolling box a size, which jsdom does not work out, and says where the reader is in it. */
function readingAt(top: number) {
  Object.defineProperty(scroller(), 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(scroller(), 'clientHeight', { configurable: true, get: () => 400 });
  scroller().scrollTop = top;
  act(() => { fireEvent.scroll(scroller()); });
}

let visibility: DocumentVisibilityState = 'visible';
const turn = (to: DocumentVisibilityState) => act(async () => { visibility = to; document.dispatchEvent(new Event('visibilitychange')); });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setReducedMotion(true);
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  shared.watched = null;
  where = '';
  auth.user = { ...FARMER };
  api.list.mockResolvedValue(listed([row()]));
  api.one.mockResolvedValue(page());
  api.send.mockResolvedValue(sentAs(message('m3', 'Hello.', { createdAt: '2026-11-27T09:10:00+00:00' })));
  api.read.mockResolvedValue({ data: { data: { unreadTotal: 0 } } });
  team.getFarmers.mockResolvedValue({ data: { data: [{ id: 'f2', name: 'Aline Uwase', photoUrl: null }] } });
});

afterEach(() => { Reflect.deleteProperty(document, 'visibilityState'); });

describe('A farmer', () => {
  it('with one conversation lands in it, ready to write', async () => {
    await open();
    expect(where).toBe('/messages/c1');
    expect(api.one).toHaveBeenCalledWith('c1');
    expect(screen.getByRole('heading', { name: 'Abahuje' })).toBeInTheDocument();
    expect(texts()).toEqual(['The worms stopped eating.', 'I will come today.']);
    const items = within(thread()).getAllByRole('listitem').filter((li) => li.classList.contains('msg'));
    expect(items[0]).toHaveTextContent('You');
    expect(items[1]).toHaveTextContent('Sara');
    expect(box()).toBeInTheDocument();
  });

  it('with none writes the first one without naming anybody', async () => {
    api.list.mockResolvedValue(listed([]));
    await open();
    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
    api.send.mockResolvedValue(sentAs(message('m9', 'Hello.')));
    write('Hello.');
    await press();
    expect(api.send).toHaveBeenCalledWith({ body: 'Hello.', clientId: expect.stringMatching(/^[A-Za-z0-9-]{8,36}$/) });
    expect(where).toBe('/messages/c1');
    // The page it was written on stays: nothing is loaded over it, so nothing typed since is lost.
    expect(api.one).not.toHaveBeenCalled();
    expect(texts()).toEqual(['Hello.']);
  });

  it('with no cooperative is told to join one, and has no box', async () => {
    auth.user = { ...FARMER, cooperativeId: null, cooperativeName: null, supervisor: null };
    api.list.mockResolvedValue(listed([]));
    await open();
    expect(screen.getByText('Join a cooperative to send messages.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('who has moved sees the old conversation and can start one with the new cooperative', async () => {
    auth.user = { ...FARMER, cooperativeId: 'k2', cooperativeName: 'Twisungane' };
    api.list.mockResolvedValue(listed([row({ isOpen: false })]));
    await open();
    expect(where).toBe('/messages');
    expect(screen.getByRole('link', { name: /Abahuje/ })).toHaveTextContent('Closed');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Write to Twisungane' })); });
    expect(screen.getByRole('heading', { name: 'Twisungane' })).toBeInTheDocument();
    expect(box()).toBeInTheDocument();
  });

  // On a phone the list and the writing screen are two views, so Back has to bring the list back.
  it('who started to write to the new cooperative can go back to the list', async () => {
    auth.user = { ...FARMER, cooperativeId: 'k2', cooperativeName: 'Twisungane' };
    api.list.mockResolvedValue(listed([row({ isOpen: false })]));
    await open();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Write to Twisungane' })); });
    expect(document.querySelector('.msg-layout')).toHaveAttribute('data-view', 'thread');
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Back' })); });
    expect(document.querySelector('.msg-layout')).toHaveAttribute('data-view', 'list');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('is told when nobody can answer yet, and not when that is not known', async () => {
    auth.user = { ...FARMER, supervisor: null };
    const view = await open();
    expect(screen.getByText('Your cooperative has no supervisor yet, so nobody can answer.')).toBeInTheDocument();
    view.unmount();
    auth.user = { ...FARMER, supervisor: undefined };
    await open();
    expect(screen.queryByText(/has no supervisor yet/)).not.toBeInTheDocument();
  });
});

describe('A supervisor', () => {
  beforeEach(() => {
    auth.user = { ...SUPERVISOR };
    api.list.mockResolvedValue(listed([
      row({ unread: 2 }),
      row({
        id: 'c2', isOpen: false, farmer: { id: 'f9', name: '', photoUrl: null, former: true },
        lastMessage: { preview: 'Thank you.', fromFarmer: false, mine: true, createdAt: '2026-11-26T09:00:00+00:00' },
      }),
    ]));
  });

  it('sees who wrote, what came last and how many are unread, and picks one', async () => {
    await open();
    const list = screen.getByRole('list', { name: 'Conversations' });
    const [first, second] = within(list).getAllByRole('link');
    expect(first).toHaveAttribute('href', '/messages/c1');
    expect(first).toHaveTextContent('Fidele Farmer');
    expect(first).toHaveTextContent('I will come today.');
    expect(within(first).getByText('2')).toHaveAttribute('aria-label', '2 unread');
    expect(second).toHaveTextContent('Former member');
    expect(second).toHaveTextContent('You: Thank you.');
    expect(second).toHaveTextContent('Closed');
    expect(screen.getByText('Choose a conversation.')).toBeInTheDocument();
    expect(api.one).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(first); });
    expect(screen.getByRole('heading', { name: 'Fidele Farmer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fidele Farmer/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/messages');
  });

  it('with none is shown where to start one', async () => {
    api.list.mockResolvedValue(listed([]));
    await open();
    expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My farmers' })).toHaveAttribute('href', '/supervisor/cooperative/farmers');
  });

  it('can ask for more than the first page of them', async () => {
    api.list.mockResolvedValueOnce(listed([row()], true)).mockResolvedValueOnce(listed([row({ id: 'c7', farmer: { id: 'f7', name: 'Page Two', photoUrl: null, former: false } })]));
    await open();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show more' })); });
    expect(api.list).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole('link', { name: /Page Two/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fidele Farmer/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('choosing Message for a farmer they have written with goes to that conversation', async () => {
    api.list.mockImplementation(async (_: number, farmer?: string) => listed(farmer ? [row()] : []));
    await open('/messages?to=f1');
    expect(api.list).toHaveBeenCalledWith(1, 'f1');
    expect(where).toBe('/messages/c1');
  });

  it('choosing Message for a new farmer writes the first one to them', async () => {
    api.list.mockResolvedValue(listed([]));
    await open('/messages?to=f2');
    expect(screen.getByRole('heading', { name: 'Aline Uwase' })).toBeInTheDocument();
    write('Welcome.');
    await press();
    expect(api.send).toHaveBeenCalledWith(expect.objectContaining({ body: 'Welcome.', farmerId: 'f2' }));
  });

  it('is told when that farmer is not in the cooperative', async () => {
    api.list.mockResolvedValue(listed([]));
    await open('/messages?to=nobody');
    expect(screen.getByText("We couldn't find that farmer.")).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('The words of a conversation', () => {
  it('are shown as typed: markup and links as plain words', async () => {
    api.one.mockResolvedValue(page([message('m1', '<img src=x onerror=alert(1)> see http://evil.example\n\nsecond line')]));
    await open('/messages/c1');
    expect(texts()).toEqual(['<img src=x onerror=alert(1)> see http://evil.example\n\nsecond line']);
    expect(thread().querySelector('img, a')).toBeNull();
  });

  it('name a closed or missing account as a former member', async () => {
    api.one.mockResolvedValue(page([
      theirs('m1', 'One.', { sender: { id: 's9', name: '', former: true } }),
      theirs('m2', 'Two.', { sender: null }),
    ]));
    await open('/messages/c1');
    expect(within(thread()).getAllByText('Former member')).toHaveLength(2);
  });

  it('have a line for each day', async () => {
    api.one.mockResolvedValue(page([
      message('m1', 'Monday.', { createdAt: '2026-11-23T10:00:00+00:00' }),
      message('m2', 'Monday again.', { createdAt: '2026-11-23T11:00:00+00:00' }),
      message('m3', 'Friday.', { createdAt: '2026-11-27T10:00:00+00:00' }),
    ]));
    await open('/messages/c1');
    expect(thread().querySelectorAll('.msg-day')).toHaveLength(2);
  });

  it('say Read under the last of my messages the other side has seen', async () => {
    api.one.mockResolvedValue(page([
      message('m1', 'First.', { createdAt: '2026-11-27T09:00:00+00:00' }),
      message('m2', 'Second.', { createdAt: '2026-11-27T09:02:00+00:00' }),
      message('m3', 'Third.', { createdAt: '2026-11-27T09:04:00+00:00' }),
    ], { otherReadAt: '2026-11-27T09:03:00+00:00' }));
    await open('/messages/c1');
    const [mark] = within(thread()).getAllByText('Read');
    expect(within(thread()).getAllByText('Read')).toHaveLength(1);
    expect(mark.closest('li')).toHaveTextContent('Second.');
    await bring({ otherReadAt: '2026-11-27T09:04:00+00:00', messages: [] });
    expect(within(thread()).getByText('Read').closest('li')).toHaveTextContent('Third.');
  });

  it('can be read further back, and the button goes at the start', async () => {
    api.one.mockResolvedValueOnce(page([ANSWER], { hasOlder: true })).mockResolvedValueOnce(page([SAID]));
    await open('/messages/c1');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show earlier messages' })); });
    expect(api.one).toHaveBeenLastCalledWith('c1', 'm2');
    expect(texts()).toEqual(['The worms stopped eating.', 'I will come today.']);
    expect(screen.queryByRole('button', { name: 'Show earlier messages' })).not.toBeInTheDocument();
  });

  it('offer another try when they do not load, and never read as empty', async () => {
    api.one.mockRejectedValueOnce(new Error('no'));
    await open('/messages/c1');
    expect(screen.queryByText('No messages yet.')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(within(screen.getByRole('alert')).getByRole('button')); });
    expect(texts()).toHaveLength(2);
  });

  it('offer another try when the list does not load, and never read as none', async () => {
    auth.user = { ...SUPERVISOR };
    api.list.mockRejectedValueOnce(new Error('no'));
    await open();
    expect(screen.queryByText('No conversations yet.')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(within(screen.getByRole('alert')).getByRole('button')); });
    expect(screen.getByRole('link', { name: /Fidele Farmer/ })).toBeInTheDocument();
  });

  it('say when a conversation cannot be found', async () => {
    api.one.mockRejectedValue(refused(404, 'not_found'));
    await open('/messages/zzz');
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't find that conversation.");
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('Writing', () => {
  it('cannot send nothing, and Enter alone makes a new line', async () => {
    await open('/messages/c1');
    expect(sendButton()).toBeDisabled();
    write('   \n ');
    expect(sendButton()).toBeDisabled();
    write('Hello.');
    expect(sendButton()).toBeEnabled();
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }); });
    expect(api.send).not.toHaveBeenCalled();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])('sends with Ctrl or Cmd and Enter (%o)', async (held) => {
    await open('/messages/c1');
    write('Hello.');
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter', ...held }); });
    expect(api.send).toHaveBeenCalledWith(expect.objectContaining({ body: 'Hello.', conversationId: 'c1' }));
  });

  it('counts down near the limit and stops at it, without cutting what was pasted', async () => {
    await open('/messages/c1');
    expect(box()).not.toHaveAttribute('maxlength');
    write('x'.repeat(1799));
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
    write('x'.repeat(1800));
    expect(box()).toHaveAccessibleDescription('200 left');
    write('x'.repeat(2000));
    expect(sendButton()).toBeEnabled();
    write('x'.repeat(2003));
    expect(box()).toHaveAccessibleDescription('3 too many');
    expect(sendButton()).toBeDisabled();
    expect(box().value).toHaveLength(2003);
  });

  it('shows what is on its way at once, and empties the box', async () => {
    api.send.mockReturnValue(new Promise(() => {}));
    await open('/messages/c1');
    write('On my way.');
    await press();
    expect(box().value).toBe('');
    const bubble = within(thread()).getByText('On my way.').closest('li')!;
    expect(bubble).toHaveTextContent('Sending');
  });

  // The message may have arrived and the answer been lost. Sending it again with the same number saves nothing twice.
  it('keeps a message that did not go, and tries again with the same number', async () => {
    api.send.mockRejectedValueOnce(new AxiosError('x', 'ERR_NETWORK'));
    await open('/messages/c1');
    write('Are you there?');
    await press();
    const bubble = within(thread()).getByText('Are you there?').closest('li')!;
    expect(bubble).toHaveTextContent('Not sent');
    api.send.mockResolvedValue(sentAs(message('m3', 'Are you there?', { createdAt: '2026-11-27T09:10:00+00:00' })));
    await act(async () => { fireEvent.click(within(bubble).getByRole('button', { name: 'Try again' })); });
    expect(api.send.mock.calls[1][0].clientId).toBe(api.send.mock.calls[0][0].clientId);
    expect(texts().filter((t) => t === 'Are you there?')).toHaveLength(1);
    expect(screen.queryByText('Not sent')).not.toBeInTheDocument();
  });

  it('gives each new message its own number', async () => {
    await open('/messages/c1');
    write('One.');
    await press();
    write('Two.');
    await press();
    expect(api.send.mock.calls[0][0].clientId).not.toBe(api.send.mock.calls[1][0].clientId);
  });

  it('says why a message was refused', async () => {
    api.send.mockRejectedValue(refused(429, 'throttled'));
    await open('/messages/c1');
    write('Too fast.');
    await press();
    expect(within(thread()).getByText('Too fast.').closest('li')!.querySelector('.msg-problem')!.textContent).not.toBe('');
  });

  // The farmer moved while the supervisor had the conversation open.
  it('says the conversation closed when a send is refused for it, and keeps the words', async () => {
    api.send.mockRejectedValue(refused(409, 'conversation_closed'));
    await open('/messages/c1');
    write('Please call me.');
    await press();
    expect(screen.getByText('This conversation is closed.', { selector: '.msg-closed p' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(thread()).getByText('Please call me.')).toBeInTheDocument();
  });

  // Closing changes no count, so nothing else would make the list say so.
  it('reads the list again when a send finds it closed', async () => {
    api.send.mockRejectedValue(refused(409, 'conversation_closed'));
    await open('/messages/c1');
    const before = api.list.mock.calls.length;
    write('Too late.');
    await press();
    expect(api.list.mock.calls.length).toBe(before + 1);
  });

  it('reads the list again once when the check finds it closed, and not at every check after', async () => {
    await open('/messages/c1');
    const before = api.list.mock.calls.length;
    await bring({ isOpen: false });
    await bring({ isOpen: false });
    expect(api.list.mock.calls.length).toBe(before + 1);
  });

  it('keeps what was being typed when the check finds it closed', async () => {
    await open('/messages/c1');
    write('Half a sentence');
    await bring({ isOpen: false });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Half a sentence')).toHaveClass('msg-unsent');
  });

  it('leaves no draft on the device', async () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem');
    await open('/messages/c1');
    write('A private half sentence');
    expect(stored.mock.calls.flat().join(' ')).not.toContain('private half');
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain('private half');
    stored.mockRestore();
  });

  it('starts with an empty box after leaving and coming back', async () => {
    auth.user = { ...SUPERVISOR };
    api.list.mockResolvedValue(listed([row(), row({ id: 'c2', farmer: { id: 'f2', name: 'Aline Uwase', photoUrl: null, former: false } })]));
    api.one.mockImplementation(async (id: string) => page([SAID], { conversation: row({ id }) }));
    await open('/messages/c1');
    write('Not finished');
    await act(async () => { goTo('/messages/c2'); });
    expect(box().value).toBe('');
    await act(async () => { goTo('/messages/c1'); });
    expect(box().value).toBe('');
  });
});

describe('News from the shared check', () => {
  it('is asked for from the latest message held', async () => {
    await open('/messages/c1');
    expect(shared.watched!.open.id).toBe('c1');
    expect(shared.watched!.open.since()).toBe(ANSWER.createdAt);
    await bring({ messages: [theirs('m3', 'Bring leaves.', { createdAt: '2026-11-27T09:20:00+00:00' })] });
    expect(shared.watched!.open.since()).toBe('2026-11-27T09:20:00+00:00');
  });

  // The check looks a little further back than asked, so what the page has comes again.
  it('draws each message once, in order, however often it comes', async () => {
    await open('/messages/c1');
    const later = theirs('m4', 'Second thing.', { createdAt: '2026-11-27T09:21:00+00:00' });
    const slow = theirs('m3', 'First thing.', { createdAt: '2026-11-27T09:20:00+00:00' });
    await bring({ messages: [ANSWER, later] });
    await bring({ messages: [ANSWER, slow, later] });
    expect(texts()).toEqual(['The worms stopped eating.', 'I will come today.', 'First thing.', 'Second thing.']);
  });

  it('is said to a screen reader once, and the focus stays where it was', async () => {
    await open('/messages/c1');
    expect(announced()).toBe('');
    box().focus();
    const next = theirs('m3', 'Bring leaves.', { createdAt: '2026-11-27T09:20:00+00:00' });
    await bring({ messages: [next] });
    expect(announced()).toBe('New message from Sara: Bring leaves.');
    expect(box()).toHaveFocus();
    expect(thread()).not.toHaveAttribute('aria-live');
  });

  it('reads the list again when the count changes', async () => {
    const view = await open('/messages/c1');
    const before = api.list.mock.calls.length;
    await act(async () => { view.rerender(tree('/messages/c1', 4)); });
    expect(api.list.mock.calls.length).toBe(before + 1);
  });
});

describe('Marking what has been read', () => {
  const unreadPage = () => api.one.mockResolvedValue(page([SAID, ANSWER], { conversation: row({ unread: 1 }) }));

  it('marks up to the newest message once it is on a screen somebody is looking at', async () => {
    unreadPage();
    await open('/messages/c1');
    expect(api.read.mock.calls).toEqual([['c1', 'm2']]);
    await waitFor(() => expect(shared.setUnread).toHaveBeenCalledWith(0));
  });

  it('marks nothing when there is nothing new from the other side', async () => {
    await open('/messages/c1');
    await bring({ messages: [message('m3', 'My own, from my other phone.', { createdAt: '2026-11-27T09:20:00+00:00' })] });
    expect(api.read).not.toHaveBeenCalled();
  });

  it('marks nothing while the tab is hidden, and does when it is looked at', async () => {
    await open('/messages/c1');
    await turn('hidden');
    await bring({ messages: [theirs('m3', 'While you were away.', { createdAt: '2026-11-27T09:20:00+00:00' })] });
    expect(api.read).not.toHaveBeenCalled();
    await turn('visible');
    expect(api.read.mock.calls).toEqual([['c1', 'm3']]);
  });

  it('keeps the reader’s place when they have scrolled up, and marks once they come down', async () => {
    await open('/messages/c1');
    readingAt(100);
    await bring({ messages: [theirs('m3', 'Further down.', { createdAt: '2026-11-27T09:20:00+00:00' })] });
    expect(scroller().scrollTop).toBe(100);
    expect(api.read).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'New messages' })); });
    expect(scroller().scrollTop).toBe(1000);
    expect(api.read.mock.calls).toEqual([['c1', 'm3']]);
    expect(screen.queryByRole('button', { name: 'New messages' })).not.toBeInTheDocument();
  });

  it('tries again later when the mark did not arrive', async () => {
    unreadPage();
    api.read.mockRejectedValueOnce(new Error('no'));
    await open('/messages/c1');
    await turn('hidden');
    await turn('visible');
    expect(api.read.mock.calls).toEqual([['c1', 'm2'], ['c1', 'm2']]);
  });
});

describe('With a keyboard alone', () => {
  it('a supervisor goes from the list to a sent message', async () => {
    auth.user = { ...SUPERVISOR };
    const user = userEvent.setup();
    await open();
    await user.tab();
    expect(screen.getByRole('link', { name: /Fidele Farmer/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(box()).toBeInTheDocument());
    for (let i = 0; i < 8 && document.activeElement !== box(); i += 1) await user.tab();
    expect(box()).toHaveFocus();
    await user.keyboard('On my way.');
    await user.tab();
    expect(sendButton()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(api.send).toHaveBeenCalledWith(expect.objectContaining({ body: 'On my way.', conversationId: 'c1' }));
  });
});
