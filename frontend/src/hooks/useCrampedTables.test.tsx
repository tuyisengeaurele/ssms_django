import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCrampedTables } from './useCrampedTables';

function Page() {
  useCrampedTables();
  return (
    <div className="table-wrapper" data-testid="wrap">
      <table className="table-stack"><tbody><tr><td>x</td></tr></tbody></table>
    </div>
  );
}

/** jsdom has no layout, so the widths are set by hand. */
function size(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
}

const resize = () => act(() => { window.dispatchEvent(new Event('resize')); });

describe('useCrampedTables', () => {
  it('marks a table card that is wider than the space it has', () => {
    const { getByTestId } = render(<Page />);
    const wrap = getByTestId('wrap');
    size(wrap, 940, 880);
    resize();
    expect(wrap).toHaveAttribute('data-cramped');
  });

  it('leaves a table that fits alone', () => {
    const { getByTestId } = render(<Page />);
    const wrap = getByTestId('wrap');
    size(wrap, 880, 880);
    resize();
    expect(wrap).not.toHaveAttribute('data-cramped');
  });

  it('lets go of the mark when the card is wide enough again', () => {
    const { getByTestId } = render(<Page />);
    const wrap = getByTestId('wrap');
    size(wrap, 940, 880);
    resize();
    expect(wrap).toHaveAttribute('data-cramped');
    size(wrap, 940, 1000);
    resize();
    expect(wrap).not.toHaveAttribute('data-cramped');
  });

  it('measures a table that appears after the page first drew, such as rows that load late', async () => {
    const { container } = render(<Page />);
    const late = document.createElement('div');
    late.className = 'table-wrapper';
    size(late, 900, 600);
    container.appendChild(late);
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(late).toHaveAttribute('data-cramped');
  });

  it('stops watching when the page goes away', () => {
    const { getByTestId, unmount } = render(<Page />);
    const wrap = getByTestId('wrap');
    unmount();
    size(wrap, 940, 880);
    resize();
    expect(wrap).not.toHaveAttribute('data-cramped');
  });
});
