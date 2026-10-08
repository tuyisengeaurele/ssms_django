import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from './AuthShell';

const DASHES = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']');

function renderShell(node: JSX.Element) {
  return render(
    <MemoryRouter>
      <LanguageProvider>{node}</LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('AuthShell', () => {
  it('has one page title, the form content and a skip link', () => {
    renderShell(
      <AuthShell title="Welcome back" subtitle="Sign in to your account">
        <p>form here</p>
      </AuthShell>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByText('form here')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('names the product in the panel and shows the new logo', () => {
    const { container } = renderShell(<AuthShell title="Hello">x</AuthShell>);
    const aside = container.querySelector('.l-auth__aside') as HTMLElement;
    expect(within(aside).getByText('Smart Sericulture Management System')).toBeInTheDocument();
    expect(within(aside).getByText('Raise healthier silkworms.')).toBeInTheDocument();
    const logo = aside.querySelector('img[src="/logo-on-dark.png"]');
    expect(logo).not.toBeNull();
    expect(container.querySelector('img[src*="worm"]')).toBeNull();
  });

  it('uses a plain color panel with no photo', () => {
    const { container } = renderShell(<AuthShell title="Hello">x</AuthShell>);
    const aside = container.querySelector('.l-auth__aside') as HTMLElement;
    expect(aside.querySelector('picture, img[src*="images"], .l-auth__photo, .l-auth__shade')).toBeNull();
  });

  it('links back home, to the legal pages, and switches language', () => {
    renderShell(<AuthShell title="Hello">x</AuthShell>);
    expect(screen.getByRole('link', { name: /Back to home/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'fr' } });
    expect(screen.getByRole('link', { name: /Retour à l'accueil/ })).toBeInTheDocument();
  });

  it('prints no statistics and no dashes', () => {
    const { container } = renderShell(<AuthShell title="Hello">x</AuthShell>);
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).not.toMatch(DASHES);
  });
});

describe('AuthField', () => {
  it('connects the label and the input', () => {
    renderShell(<AuthField id="email" label="Email address" type="email" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
  });

  it('shows and hides a password', () => {
    renderShell(<AuthField id="pw" label="Password" type="password" value="secret" onChange={() => {}} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows a hint under the field', () => {
    renderShell(<AuthField id="n" label="Name" value="" onChange={() => {}} hint="Use your full name" />);
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Use your full name');
  });
});

describe('AuthAlert and AuthButton', () => {
  it('announces an error', () => {
    renderShell(<AuthAlert>Wrong password</AuthAlert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password');
  });

  it('disables the button and shows the busy label while loading', () => {
    renderShell(
      <AuthButton loading loadingLabel="Signing in">
        Sign in
      </AuthButton>,
    );
    const button = screen.getByRole('button', { name: /Signing in/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
