import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SectionHeader from './SectionHeader';

describe('SectionHeader', () => {
  it('is a second level heading, because the page already has its title', () => {
    render(<SectionHeader title="Audit log" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Audit log' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('shows what the section is for when it is given, and the actions beside it', () => {
    render(<SectionHeader title="Audit log" subtitle="Who did what." actions={<button type="button">Export</button>} />);
    expect(screen.getByText('Who did what.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('leaves out the subtitle and the actions when there are none', () => {
    const { container } = render(<SectionHeader title="Activity" />);
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('.section-actions')).toBeNull();
  });
});
