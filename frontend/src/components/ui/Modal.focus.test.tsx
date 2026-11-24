import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

afterEach(() => vi.restoreAllMocks());

describe('Where a dialog puts the focus', () => {
  it('puts it on the first field without scrolling, so the start of a long dialog is still what the person sees', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    render(
      <Modal open onClose={() => undefined} title="A long question">
        <ul><li>What happens first</li><li>What happens next</li></ul>
        <label htmlFor="field">A field</label>
        <input id="field" />
      </Modal>,
    );
    expect(screen.getByLabelText('A field')).toHaveFocus();
    const onTheField = focus.mock.calls.findIndex((_, i) => focus.mock.contexts[i] === screen.getByLabelText('A field'));
    expect(onTheField).toBeGreaterThanOrEqual(0);
    expect(focus.mock.calls[onTheField][0]).toEqual({ preventScroll: true });
  });
});
