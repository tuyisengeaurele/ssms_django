import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): JSX.Element {
  throw new Error('secret detail from deep inside the code');
}

beforeEach(() => {
  // React and the boundary both print the error. Keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows the page as usual when nothing goes wrong', () => {
    render(<ErrorBoundary><p>All well</p></ErrorBoundary>);
    expect(screen.getByText('All well')).toBeInTheDocument();
  });

  it('says plainly that the page ran into a problem and what to do', () => {
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole('heading', { level: 1, name: 'This page ran into a problem' })).toBeInTheDocument();
    expect(screen.getByText("We're sorry. Please refresh the page.")).toBeInTheDocument();
  });

  it('does not send the person to a dashboard they may not be able to reach', () => {
    const { container } = render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(container.textContent).not.toMatch(/dashboard/i);
  });

  it('shows no technical details to the person', () => {
    const { container } = render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.queryByText(/technical details/i)).not.toBeInTheDocument();
    expect(container.querySelector('details, pre')).toBeNull();
    expect(container.textContent).not.toContain('secret detail');
  });

  it('still records the error for whoever reads the console', () => {
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(console.error).toHaveBeenCalledWith('ErrorBoundary caught:', expect.any(Error), expect.any(String));
  });

  it('offers a way to refresh and a way home', () => {
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole('button', { name: 'Refresh page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });
});
