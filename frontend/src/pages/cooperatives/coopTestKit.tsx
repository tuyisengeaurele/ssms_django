/** Shared by the tests of the cooperative pages: sample data, and a way to open the routes as a person would. */
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { cooperativeRoutes } from './cooperativeRoutes';

export const farm = (id: string, name: string, level: 'HIGH' | 'MEDIUM' | 'OK', over: object = {}) => ({
  id, name, ownerName: `Owner of ${name}`, location: 'Gatsibo', level, score: 0, diseaseAlerts: 0, openAirAlerts: 0, offlineDevices: 0,
  activeBatches: 2, harvestKg: 0, alerts: 0, ...over,
});

export const report = (over: object = {}) => ({
  generatedAt: '2026-10-28T12:00:00Z',
  cooperative: { id: 'c1', name: 'Gatsibo Silk' },
  period: { from: '2026-09-29', to: '2026-10-28' },
  totals: { farms: 3, farmers: 2, batchesRunning: 6, batchesStarted: 4 },
  harvest: { records: 3, totalKg: 24.5, silkG: 900, byGrade: [{ grade: 'A', count: 2, totalKg: 20.5 }, { grade: 'B', count: 1, totalKg: 4 }] },
  checks: { total: 3, found: 1, byResult: [{ result: 'Healthy', count: 2 }, { result: 'Pebrine', count: 1 }] },
  alerts: { total: 3, acknowledged: 1, resolved: 1, byType: [{ type: 'DISEASE', count: 2 }, { type: 'TEMPERATURE', count: 1 }] },
  farms: [
    farm('f1', 'Hill Farm', 'HIGH', { diseaseAlerts: 1, harvestKg: 20.5, alerts: 2 }),
    farm('f2', 'River Farm', 'MEDIUM', { offlineDevices: 2, harvestKg: 4, alerts: 1 }),
    farm('f3', 'Quiet Farm', 'OK'),
  ],
  ...over,
});

export const detail = (over: object = {}) => ({
  id: 'c1', name: 'Gatsibo Sericulture 1', location: 'Gatsibo District, Rwanda', description: 'The first silk cooperative.',
  isActive: true, createdAt: '2026-05-08T10:00:00Z', updatedAt: '2026-05-08T10:00:00Z', memberCount: 1, farmCount: 1,
  members: [{ id: 'm1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', role: 'FARMER', createdAt: '2026-05-01T00:00:00Z' }],
  farms: [{ id: 'f1', name: "Bruce's Farm", location: 'Gatsibo', ownerId: 'm1', ownerName: 'Bruce Ishimwe' }],
  ...over,
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

/** Opens a path of the cooperative pages, with the language and the toasts, and a place to land for the other routes. */
export function renderCoop(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            {cooperativeRoutes()}
            <Route path="/unauthorized" element={<p>Not allowed here</p>} />
          </Routes>
          <Where />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}
