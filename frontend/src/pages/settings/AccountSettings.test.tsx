import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({
  user: { id: 'c19de39a0e5czzvf7u2sak0w3ttf', name: 'Auris Tuyisenge', email: 'auris@ssms.com', role: 'ADMIN', cooperativeId: null as string | null, cooperativeName: null as string | null, createdAt: '2026-05-01T10:00:00Z', phone: null as string | null },
  refreshUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock('../../services/auth.service', () => ({ authService: api }));
const account = vi.hoisted(() => ({ getEmailChange: vi.fn(), cancelEmailChange: vi.fn(), startEmailChange: vi.fn(), closeAccount: vi.fn(), uploadPhoto: vi.fn(), removePhoto: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: account }));
const crop = vi.hoisted(() => ({ loadImage: vi.fn(), cropToFile: vi.fn() }));
vi.mock('../../utils/photoCrop', async () => ({ ...(await vi.importActual<object>('../../utils/photoCrop')), loadImage: crop.loadImage, cropToFile: crop.cropToFile }));
const farms = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock('../../services/farm.service', () => ({ farmService: farms }));
const coop = vi.hoisted(() => ({ mine: vi.fn(), options: vi.fn(), ask: vi.fn(), withdraw: vi.fn() }));
vi.mock('../../services/cooperativeRequest.service', () => ({ cooperativeRequestService: coop }));
const supply = vi.hoisted(() => ({ getAllowance: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: supply }));

import AccountSettings from './AccountSettings';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AccountSettings />
      </ToastProvider>
    </LanguageProvider>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.user.cooperativeId = null;
  auth.user.cooperativeName = null;
  auth.user.phone = null;
  api.updateProfile.mockResolvedValue({ data: { data: { ...auth.user, name: 'Auris T' } } });
  account.getEmailChange.mockResolvedValue({ data: { data: null } });
  account.cancelEmailChange.mockResolvedValue({ data: { data: null } });
  auth.user.role = 'ADMIN';
  coop.mine.mockResolvedValue({ data: { data: null } });
  coop.options.mockResolvedValue({ data: { data: [{ id: 'c1', name: 'Old Coop' }, { id: 'c2', name: 'New Coop' }] } });
  coop.withdraw.mockResolvedValue({ data: { data: null } });
  farms.getAll.mockResolvedValue({ data: { data: [] } });
  supply.getAllowance.mockResolvedValue({ data: { data: { boxes: 4, source: 'default', since: null, history: [], openRequest: null } } });
});

describe('Account settings', () => {
  it('refreshes the account from the server, so nothing shown is stale', () => {
    open();
    expect(auth.refreshUser).toHaveBeenCalled();
  });

  it('shows who you are, in words', () => {
    open();
    const card = screen.getByRole('region', { name: 'About you' });
    expect(within(card).getByText('Auris Tuyisenge')).toBeInTheDocument();
    expect(within(card).getByText('auris@ssms.com')).toBeInTheDocument();
    expect(within(card).getByText('Administrator')).toBeInTheDocument();
    expect(within(card).getByText('May 1, 2026')).toBeInTheDocument();
    expect(within(card).getByText('Not assigned')).toBeInTheDocument();
  });

  it('shows a farmer their supervisor with a call and a WhatsApp link', () => {
    (auth.user as Record<string, unknown>).supervisor = { id: 's1', name: 'Claire Uwimana', phone: '+250722000111' };
    open();
    const card = screen.getByRole('region', { name: 'About you' });
    expect(within(card).getByText('Claire Uwimana')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Call Claire Uwimana' })).toHaveAttribute('href', 'tel:+250722000111');
    delete (auth.user as Record<string, unknown>).supervisor;
  });

  it('shows no supervisor row when the account has none', () => {
    open();
    expect(screen.queryByText('Your supervisor')).not.toBeInTheDocument();
  });

  it('shows the cooperative when there is one', () => {
    auth.user.cooperativeName = 'Gatsibo Sericulture 1';
    open();
    expect(screen.getByText('Gatsibo Sericulture 1')).toBeInTheDocument();
  });

  describe('the email address', () => {
    const pending = { id: 'c1', newEmail: 'n***@example.rw', createdAt: '2026-11-23T10:00:00Z', expiresAt: '2026-11-24T10:00:00Z' };

    it('is shown as a field nobody can type over, with a Change button and no note about who to contact', () => {
      open();
      expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: 'Change email address' })).toBeInTheDocument();
      // Closing the account says who to contact, further down. The email field itself says nothing about it.
      const field = screen.getByLabelText('Email address').closest('.form-group') as HTMLElement;
      expect(within(field).queryByText(/Contact the SSMS team/)).not.toBeInTheDocument();
    });

    it('opens the dialog from the button', async () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
      expect(await screen.findByRole('dialog', { name: 'Change your email address' })).toBeInTheDocument();
    });

    it('shows nothing about a request when none is pending', async () => {
      open();
      await waitFor(() => expect(account.getEmailChange).toHaveBeenCalled());
      expect(screen.queryByText(/We sent a link to/)).not.toBeInTheDocument();
    });

    it('says where the link went when a request is pending, with a way to cancel it', async () => {
      account.getEmailChange.mockResolvedValue({ data: { data: pending } });
      open();
      expect(await screen.findByText('We sent a link to n***@example.rw. Your email changes when you open it.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
    });

    it('cancels the request and the notice goes', async () => {
      account.getEmailChange.mockResolvedValue({ data: { data: pending } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel request' }));
      await waitFor(() => expect(account.cancelEmailChange).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText(/We sent a link to/)).not.toBeInTheDocument());
      expect(await screen.findByText('The request was cancelled.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('shows the pending notice and a toast after the dialog sends the link', async () => {
      account.startEmailChange.mockResolvedValue({ data: { data: pending } });
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
      const dialog = await screen.findByRole('dialog', { name: 'Change your email address' });
      fireEvent.change(within(dialog).getByLabelText('New email address'), { target: { value: 'new@example.rw' } });
      fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'Secret123' } });
      fireEvent.change(within(dialog).getByLabelText('Type auris@ssms.com to confirm'), { target: { value: 'auris@ssms.com' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send the link' }));
      expect(await screen.findByText('We sent a link to n***@example.rw. Your email changes when you open it.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(await screen.findByText('We sent a link to n***@example.rw.', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  it.each([
    ['en', /SSMS team/],
    ['fr', /l'équipe SSMS/],
    ['rw', /itsinda rya SSMS/],
  ])('does not tell the person what the SSMS team sets, or send them to it (%s)', (locale, pattern) => {
    localStorage.setItem('ssms_locale', locale as string);
    auth.user.cooperativeId = null;
    auth.user.role = 'FARMER';
    const { container } = open();
    expect(container.textContent).not.toMatch(pattern as RegExp);
    auth.user.role = 'ADMIN';
  });

  it('saves a new name, and only when it changed', async () => {
    open();
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Auris T' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Auris T' }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalled());
    expect(await screen.findByText('Your profile is updated.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  describe('the phone number', () => {
    const save = () => screen.getByRole('button', { name: 'Save changes' });

    it('shows the number as text with a Change button, and no field to type over it', () => {
      auth.user.phone = '+250788123456';
      open();
      const card = screen.getByRole('group', { name: 'Phone number' });
      expect(within(card).getByText('0788123456')).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Change' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Phone number' })).not.toBeInTheDocument();
      expect(screen.getByText('A Rwandan mobile number, for example 0788123456.')).toBeInTheDocument();
      expect(screen.queryByText(/can see it/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Leave it empty to remove/)).not.toBeInTheDocument();
    });

    it('opens the confirmation dialog from Change, and takes the new number into the account', async () => {
      auth.user.phone = '+250788123456';
      api.updateProfile.mockResolvedValue({ data: { data: { ...auth.user, phone: '+250733000000' } } });
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      const dialog = await screen.findByRole('dialog', { name: 'Change your phone number' });
      fireEvent.change(within(dialog).getByLabelText('New phone number'), { target: { value: '0733 000 000' } });
      fireEvent.change(within(dialog).getByLabelText('Type 0788123456 to confirm'), { target: { value: '0788 123 456' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Change number' }));
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: '0733 000 000', confirmPhone: '0788 123 456' }));
      await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ phone: '+250733000000' })));
      expect(await screen.findByText('Your phone number is changed.', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('leaves the saved number alone when the dialog is cancelled', async () => {
      auth.user.phone = '+250788123456';
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.updateProfile).not.toHaveBeenCalled();
    });

    it('saving the name never sends the number', async () => {
      auth.user.phone = '+250788123456';
      open();
      fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Auris T' } });
      fireEvent.click(save());
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Auris T' }));
    });

    it('lets an account that has no number type one and save it, with no confirmation to give', async () => {
      open();
      const field = screen.getByLabelText('Phone number');
      expect(field).toHaveValue('');
      expect(field).toHaveAttribute('type', 'tel');
      expect(field).toHaveAttribute('autocomplete', 'tel');
      expect(save()).toBeDisabled();
      fireEvent.change(field, { target: { value: '0733 000 000' } });
      fireEvent.click(save());
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: '0733 000 000' }));
    });

    it('says beside the field when that number is not a Rwandan mobile, and keeps what was typed', async () => {
      api.updateProfile.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422, data: { code: 'invalid_phone', message: 'Please check what you entered.', errors: { phone: ['Enter a Rwandan mobile number, for example 0788123456.'] } },
      } as never));
      open();
      const field = screen.getByLabelText('Phone number');
      fireEvent.change(field, { target: { value: '12345' } });
      fireEvent.click(save());
      const message = await screen.findByText('Enter a Rwandan mobile number, for example 0788123456.');
      expect(message).toHaveAttribute('role', 'alert');
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveValue('12345');
      expect(auth.updateUser).not.toHaveBeenCalled();
      fireEvent.change(field, { target: { value: '0788 123 456' } });
      expect(field).not.toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('the cooperative', () => {
    const asked = (over = {}) => ({
      id: 'r1', status: 'requested', reason: 'Closer to my farm', from: { id: 'c1', name: 'Old Coop' }, to: { id: 'c2', name: 'New Coop' },
      decisionNote: '', createdAt: '2026-11-20T10:00:00Z', decidedAt: null, ...over,
    });
    const asFarmer = () => { auth.user.role = 'FARMER'; auth.user.cooperativeId = 'c1'; auth.user.cooperativeName = 'Old Coop'; };
    const change = () => screen.queryByRole('button', { name: 'Request change' });

    it('has a Request change button for a farmer and for a supervisor, and never for an admin', async () => {
      open();
      expect(change()).not.toBeInTheDocument();
      cleanup();
      asFarmer();
      open();
      expect(change()).toBeInTheDocument();
      cleanup();
      auth.user.role = 'SUPERVISOR';
      open();
      expect(change()).toBeInTheDocument();
      expect(coop.mine).toHaveBeenCalledTimes(2);
    });

    it('keeps the profile card to facts: no button next to the cooperative, and the request has a section of its own before Close your account', () => {
      asFarmer();
      open();
      const card = screen.getByRole('region', { name: 'About you' });
      const fact = within(card).getByText('Old Coop').closest('div') as HTMLElement;
      expect(within(fact).queryByRole('button')).not.toBeInTheDocument();
      const section = screen.getByRole('heading', { name: 'Change cooperative' }).closest('section') as HTMLElement;
      expect(within(section).getByRole('button', { name: 'Request change' })).toBeInTheDocument();
      const close = screen.getByRole('heading', { name: 'Close your account' }).closest('section') as HTMLElement;
      expect(section.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows a farmer the allowance in its own section, above Change cooperative', async () => {
      asFarmer();
      open();
      const allowance = (await screen.findByRole('heading', { name: 'Your allowance' })).closest('section') as HTMLElement;
      expect(within(allowance).getByRole('button', { name: /Ask for a different amount/ })).toBeInTheDocument();
      const section = screen.getByRole('heading', { name: 'Change cooperative' }).closest('section') as HTMLElement;
      expect(allowance.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows no allowance to a supervisor or an admin, and does not ask for it', () => {
      auth.user.role = 'SUPERVISOR';
      open();
      expect(screen.queryByRole('heading', { name: 'Your allowance' })).not.toBeInTheDocument();
      expect(supply.getAllowance).not.toHaveBeenCalled();
    });

    it('says in one short line what the section is for, when no request is waiting', () => {
      asFarmer();
      open();
      const section = screen.getByRole('heading', { name: 'Change cooperative' }).closest('section') as HTMLElement;
      expect(within(section).getByText('Ask to join another cooperative.')).toBeInTheDocument();
    });

    it('has no cooperative section for an admin', () => {
      open();
      expect(screen.queryByRole('heading', { name: 'Change cooperative' })).not.toBeInTheDocument();
    });

    it('does not ask the server for a request when the person is an admin', () => {
      open();
      expect(coop.mine).not.toHaveBeenCalled();
    });

    it('opens the modal from the button', async () => {
      asFarmer();
      open();
      fireEvent.click(change()!);
      expect(await screen.findByRole('dialog', { name: 'Ask to change cooperative' })).toBeInTheDocument();
    });

    it('shows a waiting request with its date and the cooperative, and a way to withdraw it', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked() } });
      open();
      expect(await screen.findByText(/Request waiting since .+, to join New Coop\./)).toBeInTheDocument();
      expect(change()).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    });

    it('says a request to leave in its own words', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked({ to: null }) } });
      open();
      expect(await screen.findByText(/Request waiting since .+, to leave your cooperative\./)).toBeInTheDocument();
    });

    it('withdraws the request, says so, and brings the button back', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked() } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
      await waitFor(() => expect(coop.withdraw).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText(/Request waiting since/)).not.toBeInTheDocument());
      expect(change()).toBeInTheDocument();
      expect(await screen.findByText('Your request was withdrawn.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('shows a refusal with its note once, and Got it takes it away for good', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked({ status: 'declined', decisionNote: 'Please talk to your supervisor first.', decidedAt: '2026-11-21T10:00:00Z' }) } });
      open();
      expect(await screen.findByText(/Your request was not approved on /)).toBeInTheDocument();
      expect(screen.getByText('Note from the SSMS team: Please talk to your supervisor first.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText(/Your request was not approved on /)).not.toBeInTheDocument();
      cleanup();
      open();
      await waitFor(() => expect(coop.mine).toHaveBeenCalledTimes(2));
      expect(screen.queryByText(/Your request was not approved on /)).not.toBeInTheDocument();
    });

    it('shows an approval in the words of a move, or of a leave', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked({ status: 'approved', decidedAt: '2026-11-21T10:00:00Z' }) } });
      open();
      expect(await screen.findByText(/Your request to join New Coop was approved on /)).toBeInTheDocument();
      cleanup();
      localStorage.clear();
      coop.mine.mockResolvedValue({ data: { data: asked({ id: 'r2', status: 'approved', to: null, decidedAt: '2026-11-21T10:00:00Z' }) } });
      open();
      expect(await screen.findByText(/Your request to leave your cooperative was approved on /)).toBeInTheDocument();
    });
  });

  describe('your data', () => {
    it('gives every role a Your data section with a Download my data button', () => {
      for (const role of ['FARMER', 'SUPERVISOR', 'ADMIN']) {
        auth.user.role = role;
        open();
        const section = screen.getByRole('heading', { name: 'Your data' }).closest('section') as HTMLElement;
        expect(within(section).getByText(/Download a copy of what SSMS holds about you/)).toBeInTheDocument();
        expect(within(section).getByRole('button', { name: 'Download my data' })).toBeInTheDocument();
        cleanup();
      }
    });

    it('opens the password dialog from the button', async () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
      expect(await screen.findByRole('dialog', { name: 'Download your data' })).toBeInTheDocument();
    });
  });

  describe('your photo', () => {
    const withPhoto = (url: string | null) => { (auth.user as Record<string, unknown>).photoUrl = url; };

    it('shows the initials and an Add photo button when there is no photo', () => {
      withPhoto(null);
      open();
      const card = screen.getByRole('region', { name: 'About you' });
      expect(card.querySelector('.identity-avatar img')).toBeNull();
      expect(within(card).getByRole('button', { name: 'Add photo' })).toBeInTheDocument();
    });

    it('shows the photo as a button that opens a larger view, with no text button beside it', () => {
      withPhoto('/api/photos/mine');
      open();
      const card = screen.getByRole('region', { name: 'About you' });
      expect(card.querySelector('.identity-avatar img')).toHaveAttribute('src', '/api/photos/mine');
      expect(within(card).getByRole('button', { name: 'View photo' })).toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: 'Change photo' })).not.toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: 'Add photo' })).not.toBeInTheDocument();
      withPhoto(null);
    });

    it('does not make the initials a button when there is no photo to view', () => {
      withPhoto(null);
      open();
      expect(screen.queryByRole('button', { name: 'View photo' })).not.toBeInTheDocument();
    });

    it('shows the photo larger, with a pencil button and no words on it, and the pencil opens the change dialog', async () => {
      withPhoto('/api/photos/mine');
      open();
      fireEvent.click(screen.getByRole('button', { name: 'View photo' }));
      const viewer = await screen.findByRole('dialog', { name: 'Your photo' });
      expect(viewer.querySelector('.photo-large img')).toHaveAttribute('src', '/api/photos/mine');
      const pencil = within(viewer).getByRole('button', { name: 'Change photo' });
      expect(pencil.textContent).toBe('');
      expect(pencil.querySelector('svg')).not.toBeNull();
      expect(pencil).toHaveClass('btn');
      fireEvent.click(pencil);
      expect(await screen.findByRole('dialog', { name: 'Profile photo' })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Your photo' })).not.toBeInTheDocument());
      withPhoto(null);
    });

    it('opens the photo dialog, and hands the account the server answers with to the app when it is saved', async () => {
      withPhoto(null);
      const answered = { ...auth.user, photoUrl: '/api/photos/new' };
      account.uploadPhoto.mockResolvedValue({ data: { data: answered } });
      crop.loadImage.mockResolvedValue({ naturalWidth: 800, naturalHeight: 400, src: 'blob:http://localhost/3f2c1d2e-1111-4222-8333-444455556666' });
      crop.cropToFile.mockResolvedValue(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
      URL.createObjectURL = vi.fn(() => 'blob:http://localhost/3f2c1d2e-1111-4222-8333-444455556666');
      URL.revokeObjectURL = vi.fn();
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Add photo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Profile photo' });
      fireEvent.change(within(dialog).getByLabelText('Choose photo'), { target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] } });
      await within(dialog).findByRole('group', { name: 'Adjust photo' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith(answered));
      expect(await screen.findByText('Photo saved', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('shows Add photo as a button with a camera before the words', () => {
      withPhoto(null);
      open();
      const button = screen.getByRole('button', { name: 'Add photo' });
      expect(button).toHaveClass('btn');
      expect(button.querySelector('svg')).not.toBeNull();
    });
  });

  describe('closing the account', () => {
    const asFarmer = () => { auth.user.role = 'FARMER'; auth.user.cooperativeId = 'c1'; auth.user.cooperativeName = 'Old Coop'; };
    const closeButton = () => screen.queryByRole('button', { name: 'Close account' });

    it('gives a farmer a Close account section', async () => {
      asFarmer();
      open();
      const section = screen.getByRole('heading', { name: 'Close your account' }).closest('section') as HTMLElement;
      expect(within(section).getByText(/You can close your account yourself/)).toBeInTheDocument();
      expect(closeButton()).toBeInTheDocument();
    });

    it('tells a supervisor and an admin to contact the SSMS team, with a link, and gives them no button', () => {
      for (const role of ['SUPERVISOR', 'ADMIN']) {
        auth.user.role = role;
        open();
        expect(screen.getByText('To close your account, contact the SSMS team.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Send us a message' })).toHaveAttribute('href', '/#contact');
        // The sentence says who to contact once, and the link says what to do, so the same words are not read twice.
        expect(screen.getAllByText(/contact the SSMS team/i)).toHaveLength(1);
        expect(closeButton()).not.toBeInTheDocument();
        cleanup();
      }
    });

    it('opens the dialog, and names the batches that are still running', async () => {
      asFarmer();
      farms.getAll.mockResolvedValue({ data: { data: [{ id: 'f1', counts: { batches: 2 } }, { id: 'f2', counts: { batches: 1 } }, { id: 'f3' }] } });
      open();
      await waitFor(() => expect(farms.getAll).toHaveBeenCalled());
      fireEvent.click(closeButton() as HTMLElement);
      const dialog = await screen.findByRole('dialog', { name: 'Close your account?' });
      expect(await within(dialog).findByText(/^3 of your batches are still running/)).toBeInTheDocument();
    });

    it('does not ask the farms of someone who is not a farmer', () => {
      open();
      expect(farms.getAll).not.toHaveBeenCalled();
    });

    it('hands the account with its date to the app when the closure is scheduled, which shows the closure screen', async () => {
      asFarmer();
      account.closeAccount.mockResolvedValue({ data: { data: { deletionDate: '2026-12-24' } } });
      open();
      fireEvent.click(closeButton() as HTMLElement);
      const dialog = await screen.findByRole('dialog', { name: 'Close your account?' });
      fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'Secret123' } });
      fireEvent.change(within(dialog).getByLabelText(/^Type your email, /), { target: { value: auth.user.email } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close my account' }));
      await waitFor(() => expect(account.closeAccount).toHaveBeenCalledWith({ confirmEmail: auth.user.email, password: 'Secret123' }));
      await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ id: auth.user.id, deletionDate: '2026-12-24' })));
    });
  });

  it('does not repeat the title of the page, which the Settings page already has', () => {
    open();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
