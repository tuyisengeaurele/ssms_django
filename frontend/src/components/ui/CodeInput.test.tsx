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

// The cursor stays at the end and the box holds six digits. So after a refused code, whatever was typed next fell off the
// end, and the box went on showing the old code until all six were deleted by hand.
describe('CodeInput after a refused code', () => {
  const type = (value: string) => fireEvent.change(field(), { target: { value } });

  it('starts a new code with the next digit typed', () => {
    const heard = vi.fn();
    render(<Harness start="000000" invalid onValue={heard} />);
    type('0000001');
    expect(heard).toHaveBeenLastCalledWith('1');
    expect(field()).toHaveValue('1');
  });

  it('takes a whole new code pasted after the old one', () => {
    render(<Harness start="000000" invalid />);
    type('000000123456');
    expect(field()).toHaveValue('123456');
  });

  it('takes a code that replaces the old one, and still lets a digit be deleted', () => {
    render(<Harness start="000000" invalid />);
    type('654321');
    expect(field()).toHaveValue('654321');
    type('65432');
    expect(field()).toHaveValue('65432');
  });

  it('keeps a full code that was not refused as it is, so one key too many changes nothing', () => {
    render(<Harness start="123456" />);
    type('1234567');
    expect(field()).toHaveValue('123456');
  });
});

