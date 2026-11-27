import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({ role: 'SUPERVISOR' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: auth.role } }) }));

import MessageButton from './MessageButton';

const open = (props: { farmerId: string; name: string }) =>
  render(<MemoryRouter><LanguageProvider><MessageButton {...props} /></LanguageProvider></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  auth.role = 'SUPERVISOR';
});

describe('The Message button beside a farmer', () => {
  it('is a button with an icon that goes to writing to that farmer, and says who', () => {
    open({ farmerId: 'f 1', name: 'Aline Uwase' });
    const button = screen.getByRole('link', { name: 'Message Aline Uwase' });
    expect(button).toHaveAttribute('href', '/messages?to=f%201');
    expect(button).toHaveClass('btn');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).toHaveTextContent('Message');
  });

  // A farmer writes from their own Messages page, and an admin has no conversations at all.
  it.each(['ADMIN', 'FARMER'])('is not there for a %s', (role) => {
    auth.role = role;
    open({ farmerId: 'f1', name: 'Aline Uwase' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('wraps beside Call and WhatsApp instead of pushing the row wider than a phone', () => {
    const css = readFileSync(join(__dirname, '../../styles/components.css'), 'utf8');
    const rule = /\n\.person-actions\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
  });
});
