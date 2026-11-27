import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

// The banners are a separate file of the site. On a poor connection, or just after a new release, it may not arrive.
vi.mock('./SiteAnnouncements', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

import LazyAnnouncements from './LazyAnnouncements';

describe('LazyAnnouncements when its file does not arrive', () => {
  it('leaves the page standing, with no banner and no message', async () => {
    const view = render(
      <MemoryRouter><LanguageProvider><LazyAnnouncements mode="visitor-once" /><p>The sign in form</p></LanguageProvider></MemoryRouter>,
    );
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(screen.getByText('The sign in form')).toBeInTheDocument();
    expect(view.container.textContent).toBe('The sign in form');
  });
});
