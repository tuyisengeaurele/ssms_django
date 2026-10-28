import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import type { FarmRisk } from '../../types';

import FarmMap from './FarmMap';

const row = (id: string, name: string, level: FarmRisk['level'], position: FarmRisk['position'], over: Partial<FarmRisk> = {}): FarmRisk => ({
  id, name, ownerName: `Owner of ${name}`, location: 'Gatsibo', level, score: 0,
  diseaseAlerts: 0, openAirAlerts: 0, offlineDevices: 0, activeBatches: 1, position, ...over,
});

const rows = [
  row('f1', 'Hill Farm', 'HIGH', { lat: -1.6, lng: 30.4, precision: 'exact' }, { diseaseAlerts: 2, offlineDevices: 1 }),
  row('f2', 'River Farm', 'MEDIUM', { lat: -1.7, lng: 30.5, precision: 'village' }, { offlineDevices: 1 }),
  row('f3', 'Quiet Farm', 'OK', { lat: -1.8, lng: 30.6, precision: 'sector' }),
  row('f4', 'Old Farm', 'OK', null),
];

function open(list = rows) {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <FarmMap rows={list} />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const pins = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('.leaflet-marker-icon'));

beforeEach(() => {
  localStorage.clear();
  setReducedMotion(true);
  // jsdom has no layout, and a map with no size cannot work out where to look.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 420 });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

describe('Farm map', () => {
  it('draws a real map, with its credit line', () => {
    const { container } = open();
    expect(container.querySelector('.leaflet-container')).not.toBeNull();
    expect(container.querySelector('.leaflet-control-attribution')).toHaveTextContent('OpenStreetMap');
  });

  it('puts one pin on the map for each farm that has a position, and none for the others', () => {
    const { container } = open();
    expect(pins(container)).toHaveLength(3);
  });

  it('names each pin with the farm, its level in words, and whether the spot is only approximate', () => {
    const { container } = open();
    const labels = pins(container).map((p) => p.getAttribute('aria-label'));
    expect(labels).toContain('Hill Farm, High');
    expect(labels).toContain('River Farm, Medium, approximate position');
    expect(labels).toContain('Quiet Farm, OK, approximate position');
  });

  it('tells the levels apart by shape as well as by colour', () => {
    const { container } = open();
    const byName = (name: string) => pins(container).find((p) => p.getAttribute('aria-label')?.startsWith(name)) as HTMLElement;
    expect(byName('Hill Farm').querySelector('.farm-pin')).toHaveClass('farm-pin--high');
    expect(byName('River Farm').querySelector('.farm-pin')).toHaveClass('farm-pin--medium');
    expect(byName('Quiet Farm').querySelector('.farm-pin')).toHaveClass('farm-pin--ok');
    expect(byName('Hill Farm').querySelector('.farm-pin')).toHaveTextContent('!');
  });

  it('marks an approximate spot differently from an exact one', () => {
    const { container } = open();
    const byName = (name: string) => pins(container).find((p) => p.getAttribute('aria-label')?.startsWith(name)) as HTMLElement;
    expect(byName('Hill Farm').querySelector('.farm-pin')).not.toHaveClass('farm-pin--approx');
    expect(byName('River Farm').querySelector('.farm-pin')).toHaveClass('farm-pin--approx');
  });

  it('can be reached with the keyboard', () => {
    const { container } = open();
    for (const pin of pins(container)) {
      expect(pin).toHaveAttribute('tabindex', '0');
      expect(pin).toHaveAttribute('role', 'button');
    }
  });

  it('shows a card for the farm that is chosen, with the owner, the level, the reasons and a link', () => {
    const { container } = open();
    expect(screen.queryByRole('region', { name: 'Hill Farm' })).not.toBeInTheDocument();
    fireEvent.click(pins(container).find((p) => p.getAttribute('aria-label') === 'Hill Farm, High') as HTMLElement);
    const card = screen.getByRole('region', { name: 'Hill Farm' });
    expect(within(card).getByRole('link', { name: 'Hill Farm' })).toHaveAttribute('href', '/farms/f1');
    expect(within(card).getByText('Owner of Hill Farm')).toBeInTheDocument();
    expect(within(card).getByText('High')).toBeInTheDocument();
    expect(within(card).getByText('2 disease alerts in the last 14 days')).toBeInTheDocument();
    expect(within(card).getByText('1 sensor offline')).toBeInTheDocument();
    expect(within(card).queryByText(/approximate/i)).not.toBeInTheDocument();
  });

  it('says plainly that a farm is placed at its village, not exactly', () => {
    const { container } = open();
    fireEvent.click(pins(container).find((p) => p.getAttribute('aria-label')?.startsWith('River Farm')) as HTMLElement);
    expect(within(screen.getByRole('region', { name: 'River Farm' })).getByText('Placed at the middle of its village. The farmer has not saved an exact position.')).toBeInTheDocument();
  });

  it('says plainly that a farm is placed at its sector', () => {
    const { container } = open();
    fireEvent.click(pins(container).find((p) => p.getAttribute('aria-label')?.startsWith('Quiet Farm')) as HTMLElement);
    expect(within(screen.getByRole('region', { name: 'Quiet Farm' })).getByText('Placed at the middle of its sector. The farmer has not saved an exact position.')).toBeInTheDocument();
  });

  it('chooses a farm with the Enter key', () => {
    const { container } = open();
    const pin = pins(container).find((p) => p.getAttribute('aria-label') === 'Hill Farm, High') as HTMLElement;
    pin.focus();
    fireEvent.keyPress(pin, { key: 'Enter', code: 'Enter', keyCode: 13, charCode: 13 });
    expect(screen.getByRole('region', { name: 'Hill Farm' })).toBeInTheDocument();
  });

  it('chooses a farm with the Space bar too, because a pin is a button', () => {
    const { container } = open();
    const pin = pins(container).find((p) => p.getAttribute('aria-label')?.startsWith('River Farm')) as HTMLElement;
    fireEvent.keyPress(pin, { key: ' ', code: 'Space', keyCode: 32, charCode: 32 });
    expect(screen.getByRole('region', { name: 'River Farm' })).toBeInTheDocument();
  });

  it('ignores other keys', () => {
    const { container } = open();
    const pin = pins(container).find((p) => p.getAttribute('aria-label') === 'Hill Farm, High') as HTMLElement;
    fireEvent.keyPress(pin, { key: 'a', code: 'KeyA', keyCode: 65, charCode: 97 });
    expect(screen.queryByRole('region', { name: 'Hill Farm' })).not.toBeInTheDocument();
  });

  it('shows the chosen pin as chosen', () => {
    const { container } = open();
    const pin = pins(container).find((p) => p.getAttribute('aria-label') === 'Hill Farm, High') as HTMLElement;
    expect(pin).not.toHaveClass('is-selected');
    fireEvent.click(pin);
    expect(pin).toHaveClass('is-selected');
  });

  it('lists the farms that cannot be put on the map, with a way to open each', () => {
    open();
    const list = screen.getByRole('list', { name: 'Not on the map' });
    expect(within(list).getByRole('link', { name: 'Old Farm' })).toHaveAttribute('href', '/farms/f4');
    expect(screen.getByText('These farms have no place chosen yet, so they cannot be shown on the map.')).toBeInTheDocument();
  });

  it('has no "not on the map" list when every farm has a place', () => {
    open(rows.slice(0, 3));
    expect(screen.queryByRole('list', { name: 'Not on the map' })).not.toBeInTheDocument();
  });

  it('shows no map, and says why, when no farm can be placed', () => {
    const { container } = open([rows[3]]);
    expect(container.querySelector('.leaflet-container')).toBeNull();
    expect(screen.getByText('No farm can be shown on the map yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Old Farm' })).toBeInTheDocument();
  });

  it('offers to show all of Rwanda and to come back to the farms', () => {
    open();
    const toggle = screen.getByRole('button', { name: 'Show all of Rwanda' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Zoom to the farms' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom to the farms' }));
    expect(screen.getByRole('button', { name: 'Show all of Rwanda' })).toBeInTheDocument();
  });

  it('tells a keyboard user how to use the pins', () => {
    open();
    expect(screen.getByText('Tab to a farm and press Enter to see its details.')).toBeInTheDocument();
  });

  it('keeps the map and drops the old pins when the farms change', () => {
    const { container, rerender } = open();
    expect(pins(container)).toHaveLength(3);
    act(() => {
      rerender(
        <MemoryRouter>
          <LanguageProvider>
            <FarmMap rows={rows.slice(0, 1)} />
          </LanguageProvider>
        </MemoryRouter>,
      );
    });
    expect(pins(container)).toHaveLength(1);
  });

  it('cleans up after itself when it is closed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = open();
    unmount();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reads in French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    const { container } = open();
    expect(pins(container).map((p) => p.getAttribute('aria-label'))).toContain('Hill Farm, Élevé');
    expect(screen.getByRole('button', { name: 'Afficher tout le Rwanda' })).toBeInTheDocument();
  });
});
