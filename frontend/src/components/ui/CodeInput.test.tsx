import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CodeInput from './CodeInput';

// One real input holds the code, so paste, autofill and screen readers behave as they do for any field. Six rounded boxes
// drawn over it show the digits.

function Harness({ onValue, invalid, start = '' }: { onValue?: (value: string) => void; invalid?: boolean; start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <label htmlFor="c">Code</label>
      <CodeInput id="c" value={value} invalid={invalid} onChange={(next) => { setValue(next); onValue?.(next); }} />
    </>
  );
}

const boxes = () => Array.from(document.querySelectorAll('.code-input__box'));
const field = () => screen.getByLabelText('Code') as HTMLInputElement;

describe('CodeInput', () => {
  it('is one labelled field that asks the phone for a number and for the code from a message', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('inputmode', 'numeric');
    expect(field()).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('draws six boxes, hidden from screen readers, so the field is read once', () => {
    render(<Harness />);
    expect(boxes()).toHaveLength(6);
    expect(document.querySelector('.code-input__boxes')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows each typed digit in its own box, in order', () => {
    render(<Harness start="4821" />);
    expect(boxes().map((box) => box.textContent)).toEqual(['4', '8', '2', '1', '', '']);
  });

  it('keeps only digits and stops at six, so a pasted "123 456" or a long string is tidied', () => {
    const seen = vi.fn();
    render(<Harness onValue={seen} />);
    fireEvent.change(field(), { target: { value: '123 456' } });
    expect(seen).toHaveBeenLastCalledWith('123456');
    fireEvent.change(field(), { target: { value: '12a3456789' } });
    expect(seen).toHaveBeenLastCalledWith('123456');
  });

  it('marks the box that takes the next digit while the field has focus, and none without it', () => {
    render(<Harness start="48" />);
    expect(boxes().some((box) => box.hasAttribute('data-active'))).toBe(false);
    fireEvent.focus(field());
    expect(boxes().map((box) => box.hasAttribute('data-active'))).toEqual([false, false, true, false, false, false]);
    fireEvent.blur(field());
    expect(boxes().some((box) => box.hasAttribute('data-active'))).toBe(false);
  });

  it('marks the last box when all six are typed', () => {
    render(<Harness start="123456" />);
    fireEvent.focus(field());
    expect(boxes()[5]).toHaveAttribute('data-active');
  });

  it('shows a wrong code on the field and on the boxes', () => {
    render(<Harness invalid />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(document.querySelector('.code-input')).toHaveAttribute('data-invalid', 'true');
  });

  it('puts the cursor in the field on request', () => {
    render(<CodeInput id="c" value="" onChange={() => {}} autoFocus />);
    expect(document.getElementById('c')).toHaveFocus();
  });

  it('can be switched off while a code is being checked', () => {
    render(<CodeInput id="c" value="123456" onChange={() => {}} disabled />);
    expect(document.getElementById('c')).toBeDisabled();
  });
});
