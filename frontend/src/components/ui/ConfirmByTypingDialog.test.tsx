import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import ConfirmByTypingDialog from './ConfirmByTypingDialog';

const onSubmit = vi.fn();
const onClose = vi.fn();
const onTypedEdit = vi.fn();

type Props = Partial<React.ComponentProps<typeof ConfirmByTypingDialog>>;

function open(props: Props = {}) {
  return render(
    <LanguageProvider>
      <ConfirmByTypingDialog
        open
        title="Close your account"
        confirmLabel="Type aline@example.rw to confirm"
        expected="aline@example.rw"
        submitLabel="Close account"
        onSubmit={onSubmit}
        onClose={onClose}
        {...props}
      />
    </LanguageProvider>,
  );
}
const typed = () => screen.getByLabelText('Type aline@example.rw to confirm');
const submit = () => screen.getByRole('button', { name: 'Close account' });
const type = (value: string) => fireEvent.change(typed(), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
});

describe('The typed confirmation dialog', () => {
  it('is a dialog with a title, and the submit button is off until the text is typed', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Close your account' })).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it.each(['aline@example.rw', 'ALINE@EXAMPLE.RW', '  aline@example.rw  '])('turns the button on when %j is typed', (text) => {
    open();
    type(text);
    expect(submit()).toBeEnabled();
  });

  it.each(['', 'aline@example', 'bruce@example.rw', 'aline @example.rw'])('keeps the button off for %j', (text) => {
    open();
    type(text);
    expect(submit()).toBeDisabled();
  });

  it('uses the matcher it is given instead of the default one', () => {
    open({ expected: '+250788123456', confirmLabel: 'Type the number', matches: (typedText) => typedText.replace(/\D/g, '') === '250788123456' });
    fireEvent.change(screen.getByLabelText('Type the number'), { target: { value: '0788 123 456' } });
    expect(submit()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type the number'), { target: { value: '+250 788 123 456' } });
    expect(submit()).toBeEnabled();
  });

  it('shows the extra fields above the typed field', () => {
    open({ children: <label>Password<input type="password" /></label> });
    const password = screen.getByLabelText('Password');
    expect(password.compareDocumentPosition(typed()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the button off while the parent says the rest of the form is not ready, even when the text matches', () => {
    open({ canSubmit: false });
    type('aline@example.rw');
    expect(submit()).toBeDisabled();
  });

  it('sends the typed text, as typed, when the button is pressed', () => {
    open();
    type(' Aline@Example.rw ');
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledWith(' Aline@Example.rw ');
  });

  it('also sends it when Enter is pressed in a field, and never while the text is wrong', () => {
    open();
    type('nobody');
    fireEvent.submit(typed().closest('form') as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
    type('aline@example.rw');
    fireEvent.submit(typed().closest('form') as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the intro and the hint', () => {
    open({ intro: <p>This cannot be undone.</p>, hint: 'This stops a stray click.' });
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.').closest('.cbt-intro')).not.toBeNull();
    expect(screen.getByText('This stops a stray click.')).toBeInTheDocument();
  });

  it('shows a refusal of the typed text beside its field, and tells the parent when the person types again', () => {
    open({ typedError: 'Type it exactly as shown.', onTypedEdit });
    const message = screen.getByText('Type it exactly as shown.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(typed()).toHaveAttribute('aria-invalid', 'true');
    expect(typed().getAttribute('aria-describedby')).toContain(message.id);
    type('a');
    expect(onTypedEdit).toHaveBeenCalled();
  });

  it('puts the focus on the first field, and Escape and Cancel close it', () => {
    open({ children: <label>Password<input type="password" /></label> });
    expect(screen.getByLabelText('Password')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('puts the focus on the typed field when there is nothing before it', () => {
    open();
    expect(typed()).toHaveFocus();
  });

  it('gives the submit button the danger look when asked', () => {
    open({ danger: true });
    expect(submit()).toHaveClass('btn-danger');
    expect(submit()).not.toHaveClass('btn-primary');
  });

  it('is the ordinary primary button otherwise', () => {
    open();
    expect(submit()).toHaveClass('btn-primary');
  });

  it('shows a spinner and the busy label, and turns both buttons off, while busy', () => {
    open({ busy: true, busyLabel: 'Closing' });
    type('aline@example.rw');
    expect(screen.getByRole('button', { name: /Closing/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('starts empty each time it is opened', () => {
    function Harness() {
      const [shown, setShown] = useState(true);
      return (
        <LanguageProvider>
          <button onClick={() => setShown((v) => !v)}>toggle</button>
          <ConfirmByTypingDialog
            open={shown}
            title="Close your account"
            confirmLabel="Type aline@example.rw to confirm"
            expected="aline@example.rw"
            submitLabel="Close account"
            onSubmit={onSubmit}
            onClose={onClose}
          />
        </LanguageProvider>
      );
    }
    render(<Harness />);
    type('aline@example.rw');
    expect(submit()).toBeEnabled();
    fireEvent.click(screen.getByText('toggle'));
    fireEvent.click(screen.getByText('toggle'));
    expect(typed()).toHaveValue('');
    expect(submit()).toBeDisabled();
  });

  it('is written in French and Kinyarwanda, with no English left on the buttons', () => {
    localStorage.setItem('ssms_locale', 'fr');
    const { unmount } = open();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    unmount();
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});
