import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { DiseaseSpotlight } from './DiseaseSpotlight';
import { Faq } from './Faq';

function wrap(node: JSX.Element) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

describe('Faq', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('has six questions as buttons wired to their answers', () => {
    wrap(<Faq />);
    const triggers = screen.getAllByRole('button');
    expect(triggers).toHaveLength(6);
    triggers.forEach((button) => {
      const panel = document.getElementById(button.getAttribute('aria-controls') as string);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('aria-labelledby', button.id);
    });
  });

  it('opens the first answer and hides the rest', () => {
    wrap(<Faq />);
    const triggers = screen.getAllByRole('button');
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'true');
    expect(triggers[1]).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(triggers[1].getAttribute('aria-controls') as string) as HTMLElement;
    expect(panel).toHaveAttribute('hidden');
  });

  it('shows only one answer at a time', async () => {
    wrap(<Faq />);
    const triggers = screen.getAllByRole('button');
    await userEvent.click(triggers[2]);
    expect(triggers[2]).toHaveAttribute('aria-expanded', 'true');
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Yes\. Like any AI tool, it can make mistakes/)).toBeVisible();
  });

  it('toggles with Enter and Space and can close the open one', async () => {
    wrap(<Faq />);
    const triggers = screen.getAllByRole('button');
    triggers[3].focus();
    await userEvent.keyboard('{Enter}');
    expect(triggers[3]).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard(' ');
    expect(triggers[3]).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves focus with the arrow keys, Home and End', async () => {
    wrap(<Faq />);
    const triggers = screen.getAllByRole('button');
    triggers[0].focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(triggers[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(triggers[5]).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(triggers[0]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(triggers[5]).toHaveFocus();
  });
});

describe('DiseaseSpotlight', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the message, the honest note and an example result', () => {
    wrap(<DiseaseSpotlight />);
    expect(screen.getByRole('heading', { level: 2, name: 'Catch disease while you can still act.' })).toBeInTheDocument();
    expect(screen.getByText(/Upload a photo of a worm/)).toBeInTheDocument();
    expect(screen.getByText(/Like any AI tool, it can make mistakes\. Treat the result/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /illustration of a disease check/i })).toBeInTheDocument();
  });

  it('starts the bars when the screen scrolls into view', () => {
    let fire: (visible: boolean) => void = () => {};
    class Observer {
      cb: (entries: Array<{ isIntersecting: boolean }>) => void;
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        this.cb = cb;
        fire = (visible) => this.cb([{ isIntersecting: visible }]);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    wrap(<DiseaseSpotlight />);
    const mock = screen.getByRole('img', { name: /illustration of a disease check/i });
    expect(mock).not.toHaveClass('is-live');
    act(() => fire(true));
    expect(mock).toHaveClass('is-live');
    vi.unstubAllGlobals();
  });
});
