import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import ValidationMessages from './ValidationMessages';

// The browser's own bubble ("Please fill out this field.") speaks the language of the browser, not of the app. This sets the
// message of an invalid field in the language of the screen, and takes it away as soon as the person edits the field, so
// the browser asks again.

function open(children: ReactNode, locale?: string) {
  localStorage.clear();
  if (locale) localStorage.setItem('ssms_locale', locale);
  return render(
    <LanguageProvider>
      <ValidationMessages />
      <form>{children}</form>
    </LanguageProvider>,
  );
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const message = (el: HTMLInputElement) => { el.checkValidity(); return el.validationMessage; };

/** jsdom flags a length only for text the person typed, and does not check a step at all, so the state is given by hand. */
function invalidWith(el: HTMLInputElement, state: Partial<ValidityState>) {
  Object.defineProperty(el, 'validity', { configurable: true, value: { valid: false, customError: false, ...state } });
  el.dispatchEvent(new Event('invalid', { cancelable: true }));
  return el.validationMessage;
}

beforeEach(() => localStorage.clear());

describe('messages of an invalid field', () => {
  it('says a required field is empty, in English', () => {
    open(<label>Name<input required /></label>);
    expect(message(field('Name'))).toBe('Fill in this field.');
  });

  it('says it in French and in Kinyarwanda', () => {
    open(<label>Name<input required /></label>, 'fr');
    expect(message(field('Name'))).toBe('Remplissez ce champ.');
  });

  it('says it in Kinyarwanda', () => {
    open(<label>Name<input required /></label>, 'rw');
    expect(message(field('Name'))).toBe('Uzuza iki gice.');
  });

  it('asks for an option on a select and for a tick on a checkbox', () => {
    open(
      <>
        <label>Kind<select required defaultValue=""><option value="">Choose</option><option value="x">X</option></select></label>
        <label>Agree<input type="checkbox" required /></label>
      </>,
    );
    expect(message(field('Kind'))).toBe('Choose an option.');
    expect(message(field('Agree'))).toBe('Tick this box to continue.');
  });

  it('says an email address is not valid, and another kind of mismatch is a format problem', () => {
    open(
      <>
        <label>Email<input type="email" defaultValue="not-an-email" /></label>
        <label>Site<input type="url" defaultValue="nope" /></label>
      </>,
    );
    expect(message(field('Email'))).toBe('Enter a valid email address.');
    expect(message(field('Site'))).toBe('Check the format of this field.');
  });

  it('says how small or how large a number may be', () => {
    open(
      <>
        <label>Low<input type="number" min="5" defaultValue="2" /></label>
        <label>High<input type="number" max="9" defaultValue="12" /></label>
      </>,
    );
    expect(message(field('Low'))).toBe('Enter 5 or more.');
    expect(message(field('High'))).toBe('Enter 9 or less.');
  });

  it('says a number is not a number when the step does not fit', () => {
    open(<label>Count<input type="number" step="1" /></label>);
    expect(invalidWith(field('Count'), { stepMismatch: true })).toBe('Enter a valid number.');
    expect(invalidWith(field('Count'), { badInput: true })).toBe('Enter a valid number.');
  });

  it('says how long a text must be, and how long it may be', () => {
    open(
      <>
        <label>Short<input minLength={8} /></label>
        <label>Long<input maxLength={3} /></label>
      </>,
    );
    expect(invalidWith(field('Short'), { tooShort: true })).toBe('Use at least 8 characters.');
    expect(invalidWith(field('Long'), { tooLong: true })).toBe('Use 3 characters or fewer.');
  });

  it('points to the format when a pattern is not matched, using the title the form gives', () => {
    open(
      <>
        <label>Digits<input pattern="[0-9]+" title="Digits only" defaultValue="abc" /></label>
        <label>Plain<input pattern="[0-9]+" defaultValue="abc" /></label>
      </>,
    );
    expect(message(field('Digits'))).toBe('Digits only');
    expect(message(field('Plain'))).toBe('Check the format of this field.');
  });

  it('takes the message away when the person edits the field, so the browser asks again', () => {
    open(<label>Name<input required /></label>);
    const input = field('Name');
    expect(message(input)).toBe('Fill in this field.');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.input(input);
    expect(input.validity.valid).toBe(true);
    expect(input.validationMessage).toBe('');
  });

  it('takes it away on a change as well, as a select or a tick gives one', () => {
    open(<label>Agree<input type="checkbox" required /></label>);
    const box = field('Agree');
    expect(message(box)).toBe('Tick this box to continue.');
    box.checked = true;
    fireEvent.change(box);
    expect(box.validity.valid).toBe(true);
  });

  it('leaves a message that the page set for itself alone', () => {
    open(<label>Name<input required /></label>);
    const input = field('Name');
    input.setCustomValidity('That name is taken.');
    expect(message(input)).toBe('That name is taken.');
  });

  it('follows the language when it changes', () => {
    function Switch() {
      const { setLocale } = useLanguage();
      return <button type="button" onClick={() => setLocale('fr')}>French</button>;
    }
    localStorage.clear();
    render(
      <LanguageProvider>
        <ValidationMessages />
        <Switch />
        <form><label>Name<input required /></label></form>
      </LanguageProvider>,
    );
    expect(message(field('Name'))).toBe('Fill in this field.');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'French' })); });
    fireEvent.input(field('Name'));
    expect(message(field('Name'))).toBe('Remplissez ce champ.');
  });

  it('stops listening when it is removed', () => {
    localStorage.clear();
    const view = render(<LanguageProvider><ValidationMessages /><form><label>Name<input required /></label></form></LanguageProvider>);
    const input = field('Name');
    view.rerender(<LanguageProvider><form><label>Name<input required /></label></form></LanguageProvider>);
    expect(message(input)).not.toBe('Fill in this field.');
  });
});
