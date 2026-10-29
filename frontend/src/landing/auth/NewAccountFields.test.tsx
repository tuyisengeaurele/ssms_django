import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import NewAccountFields, { newAccountProblem, passwordRules } from './NewAccountFields';

function Harness({ start = { password: '', confirm: '', accepted: false } }: { start?: { password: string; confirm: string; accepted: boolean } }) {
  const [values, setValues] = useState(start);
  return <NewAccountFields idPrefix="t" {...values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />;
}

const open = (start?: { password: string; confirm: string; accepted: boolean }) =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <Harness start={start} />
      </LanguageProvider>
    </MemoryRouter>,
  );

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const rule = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => localStorage.clear());

describe('passwordRules', () => {
  it.each([
    ['', { length: false, upper: false, lower: false, digit: false }],
    ['abc', { length: false, upper: false, lower: true, digit: false }],
    ['Secret123', { length: true, upper: true, lower: true, digit: true }],
    ['ABCDEFGH', { length: true, upper: true, lower: false, digit: false }],
    ['12345678', { length: true, upper: false, lower: false, digit: true }],
    ['Ab1', { length: false, upper: true, lower: true, digit: true }],
  ])('judges %j', (password, expected) => {
    expect(passwordRules(password)).toEqual(expected);
  });

  it('counts eight characters as enough and seven as not', () => {
    expect(passwordRules('Abcdef1').length).toBe(false);
    expect(passwordRules('Abcdef12').length).toBe(true);
  });
});

describe('newAccountProblem', () => {
  const ok = { password: 'Secret123', confirm: 'Secret123', accepted: true };

  it('finds nothing wrong with a good set', () => {
    expect(newAccountProblem(ok)).toBeNull();
  });

  it('asks for a stronger password first', () => {
    expect(newAccountProblem({ ...ok, password: 'secret', confirm: 'secret', accepted: false })).toBe('regNeedStrong');
  });

  it('then for the two passwords to match', () => {
    expect(newAccountProblem({ ...ok, confirm: 'Secret124', accepted: false })).toBe('regMismatch');
  });

  it('then for the terms', () => {
    expect(newAccountProblem({ ...ok, accepted: false })).toBe('regNeedTerms');
  });
});

describe('New account fields', () => {
  it('has a password, a confirmation and a box for the terms', () => {
    open();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('checkbox', { name: /I agree to the/ })).not.toBeChecked();
  });

  it('lists the four password rules, each saying in words whether it is met', () => {
    open();
    const list = screen.getByRole('list', { name: 'Your password needs' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent?.trim())).toEqual([
      'At least 8 characters (not yet)', 'An uppercase letter (not yet)', 'A lowercase letter (not yet)', 'A number (not yet)',
    ]);
  });

  it('ticks each rule as the password is typed', () => {
    open();
    type('Password', 'abc');
    expect(rule('A lowercase letter')).toHaveTextContent('(met)');
    expect(rule('At least 8 characters')).toHaveTextContent('(not yet)');
    type('Password', 'Secret123');
    for (const name of ['At least 8 characters', 'An uppercase letter', 'A lowercase letter', 'A number']) {
      expect(rule(name)).toHaveTextContent('(met)');
    }
  });

  it('marks a met rule, so it can be drawn as a tick and not only coloured', () => {
    open();
    type('Password', 'abc');
    expect(rule('A lowercase letter')).toHaveClass('is-met');
    expect(rule('A number')).not.toHaveClass('is-met');
  });

  it('ties the rules to the password field for a screen reader', () => {
    open();
    const list = screen.getByRole('list', { name: 'Your password needs' });
    expect(screen.getByLabelText('Password').getAttribute('aria-describedby')).toContain(list.id);
  });

  it('says the two passwords differ once something is typed in the second box', () => {
    open();
    type('Password', 'Secret123');
    expect(screen.queryByText('The two passwords do not match.')).not.toBeInTheDocument();
    type('Confirm password', 'Secret12');
    expect(screen.getByText('The two passwords do not match.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true');
    type('Confirm password', 'Secret123');
    expect(screen.queryByText('The two passwords do not match.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).not.toHaveAttribute('aria-invalid');
  });

  it('says nothing about a mismatch while the second box is empty', () => {
    open();
    type('Password', 'Secret123');
    expect(screen.queryByText('The two passwords do not match.')).not.toBeInTheDocument();
  });

  it('links the terms and the privacy policy, opening them beside the form so nothing typed is lost', () => {
    open();
    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(terms).toHaveAttribute('href', '/terms');
    expect(privacy).toHaveAttribute('href', '/privacy');
    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('ticks the box', () => {
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }));
    expect(screen.getByRole('checkbox', { name: /I agree to the/ })).toBeChecked();
  });

  it('is written in French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByLabelText('Confirmez le mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Votre mot de passe doit contenir' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "conditions d'utilisation" })).toBeInTheDocument();
  });

  it('is written in Kinyarwanda', () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(screen.queryByText('Confirm password')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });
});
