import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import EmptyState from './EmptyState';

describe('The next step of an empty list', () => {
  it('is a button with its icon before the words, whether it goes somewhere or does something', () => {
    render(
      <MemoryRouter>
        <EmptyState title="Nothing here" action={{ label: 'Go to your farms', to: '/farms', icon: 'farms' }} />
        <EmptyState title="Could not load" action={{ label: 'Try again', onClick: vi.fn(), icon: 'refresh' }} />
      </MemoryRouter>,
    );
    for (const name of ['Go to your farms', 'Try again']) {
      const action = screen.getByRole(name === 'Try again' ? 'button' : 'link', { name });
      expect(action).toHaveClass('btn');
      expect(action.querySelector('svg')).not.toBeNull();
    }
  });

  it('draws no icon when none is given', () => {
    render(<EmptyState title="Nothing" action={{ label: 'Retry', onClick: vi.fn() }} />);
    expect(screen.getByRole('button', { name: 'Retry' }).querySelector('svg')).toBeNull();
  });
});
