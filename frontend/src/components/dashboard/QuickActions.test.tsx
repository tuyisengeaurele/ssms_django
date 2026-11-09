import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import QuickActions from './QuickActions';

const open = (role: 'FARMER' | 'SUPERVISOR' | 'ADMIN' | 'ADMIN_MONITOR', counts?: { alerts?: number; decisions?: number }) => render(
  <MemoryRouter><LanguageProvider><QuickActions role={role} counts={counts} /></LanguageProvider></MemoryRouter>,
);
const links = () => within(screen.getByRole('navigation', { name: 'Quick actions' })).getAllByRole('link');
const summary = () => links().map((l) => [l.textContent?.replace(/\d+$/, '').trim(), l.getAttribute('href')]);

describe('QuickActions', () => {
  it('is a labelled list of links', () => {
    open('FARMER');
    const nav = screen.getByRole('navigation', { name: 'Quick actions' });
    expect(within(nav).getAllByRole('listitem').length).toBe(within(nav).getAllByRole('link').length);
  });

  it('offers a farmer the places they use most, in order', () => {
    open('FARMER');
    expect(summary()).toEqual([
      ['Farms', '/farms'], ['Batches', '/batches'], ['Disease checks', '/detections/reports'],
      ['Harvests', '/harvests'], ['Alerts', '/alerts'], ['Compare batches', '/batches/compare'],
    ]);
  });

  it('offers a supervisor what waits for them first', () => {
    open('SUPERVISOR');
    expect(summary()).toEqual([
      ['Decisions', '/decisions'], ['Supply', '/supply'], ['My cooperative', '/supervisor/cooperative'],
      ['Alerts', '/alerts'], ['Disease checks', '/detections/reports'], ['Compare batches', '/batches/compare'],
    ]);
  });

  it('offers an admin the places they run', () => {
    open('ADMIN');
    expect(summary()).toEqual([
      ['Users', '/admin/users'], ['Cooperatives', '/admin/cooperatives'], ['Messages', '/admin/contacts'],
      ['System', '/admin/system'], ['Disease checks', '/detections/reports'], ['Farm monitoring', '/supervisor'],
    ]);
  });

  it('offers an admin looking at every farm what a supervisor has, with the cooperatives', () => {
    open('ADMIN_MONITOR', { alerts: 4 });
    expect(summary()).toEqual([
      ['Decisions', '/decisions'], ['Supply', '/supply'], ['Alerts', '/alerts'],
      ['Disease checks', '/detections/reports'], ['Compare batches', '/batches/compare'], ['Cooperatives', '/admin/cooperatives'],
    ]);
    expect(screen.getByRole('link', { name: /Alerts.*4/ })).toBeInTheDocument();
  });

  it('shows how many alerts and decisions wait, as text and in the name of the link', () => {
    open('SUPERVISOR', { alerts: 3, decisions: 5 });
    expect(screen.getByRole('link', { name: /Decisions.*5/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alerts.*3/ })).toHaveTextContent('3');
  });

  it('shows no number when nothing waits', () => {
    open('FARMER', { alerts: 0 });
    expect(screen.getByRole('link', { name: 'Alerts' })).not.toHaveTextContent(/\d/);
  });

  it('puts a count only where it belongs', () => {
    open('FARMER', { alerts: 2, decisions: 9 });
    expect(screen.getByRole('link', { name: /Alerts.*2/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Decisions/ })).not.toBeInTheDocument();
    expect(screen.queryByText('9')).not.toBeInTheDocument();
  });

  it('follows the language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open('FARMER');
    expect(screen.getByRole('navigation', { name: 'Actions rapides' })).toBeInTheDocument();
    localStorage.removeItem('ssms_locale');
  });
});
