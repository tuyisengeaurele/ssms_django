import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import PhoneLink from './PhoneLink';

const open = (props: { phone?: string | null; name?: string }) => render(<LanguageProvider><PhoneLink {...props} /></LanguageProvider>);

beforeEach(() => localStorage.clear());

describe('PhoneLink', () => {
  it('writes the number the way a person writes it', () => {
    open({ phone: '+250788123456', name: 'Aline Uwase' });
    expect(screen.getByText('0788123456')).toBeInTheDocument();
  });

  it('shows Call and WhatsApp as buttons with an icon before the words, not as plain links', () => {
    open({ phone: '+250788123456', name: 'Aline Uwase' });
    for (const name of ['Call Aline Uwase', 'Message Aline Uwase on WhatsApp']) {
      const action = screen.getByRole('link', { name });
      expect(action).toHaveClass('btn');
      expect(action.querySelector('svg')).not.toBeNull();
    }
  });

  it('links to a call and to WhatsApp, with the exact numbers', () => {
    open({ phone: '+250788123456', name: 'Aline Uwase' });
    expect(screen.getByRole('link', { name: 'Call Aline Uwase' })).toHaveAttribute('href', 'tel:+250788123456');
    const chat = screen.getByRole('link', { name: 'Message Aline Uwase on WhatsApp' });
    expect(chat).toHaveAttribute('href', 'https://wa.me/250788123456');
    expect(chat).toHaveAttribute('target', '_blank');
    expect(chat.getAttribute('rel')).toContain('noopener');
    expect(chat.getAttribute('rel')).toContain('noreferrer');
  });

  it('shows short visible words for the two links', () => {
    open({ phone: '+250788123456', name: 'Aline Uwase' });
    expect(screen.getByRole('link', { name: 'Call Aline Uwase' })).toHaveTextContent('Call');
    expect(screen.getByRole('link', { name: 'Message Aline Uwase on WhatsApp' })).toHaveTextContent('WhatsApp');
  });

  it('still has names for the links when no person is named', () => {
    open({ phone: '+250788123456' });
    expect(screen.getByRole('link', { name: 'Call' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeInTheDocument();
  });

  it.each([undefined, null, ''])('renders nothing for %j', (phone) => {
    const { container } = open({ phone, name: 'Aline' });
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves a value that is not a stored number as text, and makes no link out of it', () => {
    const { container } = open({ phone: 'call me', name: 'Aline' });
    expect(container).toBeEmptyDOMElement();
  });

  it('is written in French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open({ phone: '+250788123456', name: 'Aline Uwase' });
    expect(screen.getByRole('link', { name: 'Appeler Aline Uwase' })).toHaveAttribute('href', 'tel:+250788123456');
    expect(screen.getByRole('link', { name: 'Écrire à Aline Uwase sur WhatsApp' })).toBeInTheDocument();
  });

  it('is written in Kinyarwanda with no English left on it', () => {
    localStorage.setItem('ssms_locale', 'rw');
    const { container } = open({ phone: '+250788123456', name: 'Aline Uwase' });
    expect(container.textContent).not.toMatch(/Call|Message/);
  });
});
