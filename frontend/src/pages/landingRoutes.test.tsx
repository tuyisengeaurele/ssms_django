import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { landingRoutes } from './landingRoutes';

// The landing page has an address in each language. /en is not a page, but people will type it, so it goes to the root.

const Landing = () => <p>the landing page</p>;
const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {landingRoutes(Landing)}
        <Route path="*" element={<p>not found</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );

describe('the landing page routes', () => {
  it.each(['/', '/fr', '/rw'])('show the landing page at %s', (path) => {
    at(path);
    expect(screen.getByText('the landing page')).toBeInTheDocument();
  });

  it('send /en to the root', () => {
    at('/en');
    expect(screen.getByText('the landing page')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it.each(['/de', '/fr/privacy', '/rw/login', '/FR'])('leave %s to the rest of the app', (path) => {
    at(path);
    expect(screen.getByText('not found')).toBeInTheDocument();
  });
});
