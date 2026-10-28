import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'SUPERVISOR' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const api = vi.hoisted(() => ({ getComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn() }));
vi.mock('../../services/alert.service', () => ({ alertService: api }));

import AlertThread from './AlertThread';

const comment = (id: string, body: string, over: object = {}) => ({
  id, body, createdAt: new Date(Date.now() - 3600_000).toISOString(), author: { id: 'u1', name: 'Claire Mukamana' }, canDelete: false, ...over,
});

const onCount = vi.fn();

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AlertThread alertId="a1" onCountChange={onCount} />
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
  auth.role = 'SUPERVISOR';
  api.getComments.mockResolvedValue({ data: { data: [comment('c1', 'Please open the windows.'), comment('c2', 'Done, thank you.', { author: { id: 'u2', name: 'Mugisha Serge' }, canDelete: true })] } });
  api.addComment.mockImplementation((_id: string, body: string) => Promise.resolve({ data: { data: comment('c9', body, { canDelete: true }) } }));
  api.deleteComment.mockResolvedValue({ data: { data: null } });
});

describe('Alert thread', () => {
  it('asks for the comments of its alert and lists them, with who wrote them and when', async () => {
    open();
    expect(await screen.findByText('Please open the windows.')).toBeInTheDocument();
    expect(api.getComments).toHaveBeenCalledWith('a1');
    expect(screen.getByText('Claire Mukamana')).toBeInTheDocument();
    expect(screen.getByText('Mugisha Serge')).toBeInTheDocument();
    expect(screen.getAllByText(/1 hour ago/).length).toBe(2);
  });

  it('says so when nobody has written yet', async () => {
    api.getComments.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
  });

  it('shows what a person wrote as text, with its line breaks, and never as markup', async () => {
    api.getComments.mockResolvedValue({ data: { data: [comment('c1', '<b>Hi</b> & <script>x</script>\nSecond line')] } });
    const { container } = open();
    await screen.findByText(/Second line/);
    expect(container.querySelector('.thread-body')).toHaveTextContent('<b>Hi</b> & <script>x</script> Second line');
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows an error and a way to try again when the comments cannot be loaded', async () => {
    api.getComments.mockRejectedValueOnce(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the comments. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Please open the windows.')).toBeInTheDocument();
  });

  describe('writing', () => {
    it('adds a comment to the end of the thread, empties the box and tells the page', async () => {
      open();
      await screen.findByText('Please open the windows.');
      fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: '  Thank you.  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
      await waitFor(() => expect(api.addComment).toHaveBeenCalledWith('a1', 'Thank you.'));
      expect(await screen.findByText('Thank you.')).toBeInTheDocument();
      expect(screen.getByLabelText('Write a comment')).toHaveValue('');
      expect(onCount).toHaveBeenCalledWith(1);
    });

    it('does not offer to send an empty comment', async () => {
      open();
      await screen.findByText('Please open the windows.');
      const add = screen.getByRole('button', { name: 'Add comment' });
      expect(add).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: '   ' } });
      expect(add).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'ok' } });
      expect(add).toBeEnabled();
    });

    it('counts the characters against the limit and stops at the limit', async () => {
      open();
      await screen.findByText('Please open the windows.');
      const box = screen.getByLabelText('Write a comment');
      expect(box).toHaveAttribute('maxlength', '1000');
      fireEvent.change(box, { target: { value: 'Hello' } });
      expect(screen.getByText('5 / 1000')).toBeInTheDocument();
    });

    it('keeps the words and says kindly when the comment cannot be saved', async () => {
      api.addComment.mockRejectedValueOnce(new Error('x'));
      open();
      await screen.findByText('Please open the windows.');
      fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Thank you.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
      expect(await screen.findByText("We couldn't add your comment. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByLabelText('Write a comment')).toHaveValue('Thank you.');
      expect(onCount).not.toHaveBeenCalled();
    });

    it('holds the button while the comment is being saved, so it cannot be sent twice', async () => {
      let finish: (v: unknown) => void = () => {};
      api.addComment.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      open();
      await screen.findByText('Please open the windows.');
      fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'Once' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled());
      fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
      expect(api.addComment).toHaveBeenCalledTimes(1);
      finish({ data: { data: comment('c9', 'Once') } });
    });

    it('tells a supervisor that the farm owner is told by email, and a farmer nothing of the kind', async () => {
      open();
      expect(await screen.findByText('The farm owner is told by email.')).toBeInTheDocument();
    });

    it('does not say that to the farmer who is writing', async () => {
      auth.role = 'FARMER';
      open();
      await screen.findByText('Please open the windows.');
      expect(screen.queryByText('The farm owner is told by email.')).not.toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    it('offers Delete only on the comments the person may delete', async () => {
      open();
      await screen.findByText('Please open the windows.');
      const first = screen.getByText('Please open the windows.').closest('li') as HTMLElement;
      const second = screen.getByText('Done, thank you.').closest('li') as HTMLElement;
      expect(within(first).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(within(second).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('asks first, and keeps the comment when the person changes their mind', async () => {
      open();
      const second = (await screen.findByText('Done, thank you.')).closest('li') as HTMLElement;
      fireEvent.click(within(second).getByRole('button', { name: 'Delete' }));
      expect(within(second).getByText('Delete this comment?')).toBeInTheDocument();
      fireEvent.click(within(second).getByRole('button', { name: 'Keep' }));
      expect(within(second).queryByText('Delete this comment?')).not.toBeInTheDocument();
      expect(api.deleteComment).not.toHaveBeenCalled();
    });

    it('deletes after the person confirms, takes it off the list and tells the page', async () => {
      open();
      const second = (await screen.findByText('Done, thank you.')).closest('li') as HTMLElement;
      fireEvent.click(within(second).getByRole('button', { name: 'Delete' }));
      fireEvent.click(within(second).getByRole('button', { name: 'Yes, delete' }));
      await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith('a1', 'c2'));
      await waitFor(() => expect(screen.queryByText('Done, thank you.')).not.toBeInTheDocument());
      expect(onCount).toHaveBeenCalledWith(-1);
      expect(await screen.findByText('Comment deleted.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('says kindly when the comment cannot be deleted and keeps it', async () => {
      api.deleteComment.mockRejectedValueOnce(new Error('x'));
      open();
      const second = (await screen.findByText('Done, thank you.')).closest('li') as HTMLElement;
      fireEvent.click(within(second).getByRole('button', { name: 'Delete' }));
      fireEvent.click(within(second).getByRole('button', { name: 'Yes, delete' }));
      expect(await screen.findByText("We couldn't delete the comment. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.getByText('Done, thank you.')).toBeInTheDocument();
    });
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByLabelText('Écrire un commentaire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });

  it('reads in Kinyarwanda', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(await screen.findByLabelText('Andika igitekerezo')).toBeInTheDocument();
  });
});
