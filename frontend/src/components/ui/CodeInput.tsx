import { useRef, useState, type InputHTMLAttributes } from 'react';
import './codeInput.css';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'maxLength' | 'inputMode' | 'autoComplete'> {
  id: string;
  value: string;
  /** Called with digits only, at most `length` of them. */
  onChange: (value: string) => void;
  length?: number;
  /** The last code was not right. */
  invalid?: boolean;
}

/**
 * A one time code drawn as a box for each digit. It is still one real field underneath, so pasting, the code from a
 * message and screen readers work as for any field; the boxes are only the picture of it.
 */
export default function CodeInput({ id, value, onChange, length = 6, invalid, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const digits = value.replace(/\D/g, '').slice(0, length);
  const active = Math.min(digits.length, length - 1);
  const half = length % 2 === 0 ? length / 2 : -1;

  // Digits are only ever added at the end, so a tap in the middle of the boxes does not move the cursor into the code.
  const toEnd = () => {
    const el = ref.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  };

  return (
    <div className="code-input" data-invalid={invalid ? 'true' : undefined}>
      <div className="code-input__boxes" aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`code-input__box${i === half ? ' code-input__box--split' : ''}`}
            data-filled={i < digits.length ? 'true' : undefined}
            data-active={focused && i === active ? 'true' : undefined}
          >
            {digits[i] ?? (focused && i === active ? <span className="code-input__caret" /> : '')}
          </span>
        ))}
      </div>
      <input
        ref={ref}
        id={id}
        className="code-input__field"
        value={digits}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-invalid={invalid ? 'true' : undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={(e) => { setFocused(true); toEnd(); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        onClick={toEnd}
        {...rest}
      />
    </div>
  );
}
