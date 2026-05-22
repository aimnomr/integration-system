import { TextField, type TextFieldProps } from '@mui/material';
import { useEffect, useState } from 'react';

type NumberFieldProps = Omit<TextFieldProps, 'type' | 'value' | 'onChange'> & {
  value: number;
  onChange: (v: number) => void;
};

/**
 * Numeric input that handles two MUI/HTML quirks the plain
 * `<TextField type="number">` doesn't:
 *
 *  - **G36** — selects the existing text on focus, so typing "2" replaces
 *    the displayed "0" instead of concatenating to "02".
 *  - **G38** — keeps a transient string buffer (`""`, `"-"`, `"-."`, `"1."`)
 *    so the user can type a negative or decimal number without the parent's
 *    number state thrashing back to NaN/0 mid-keystroke. The parsed number
 *    is only propagated to the parent when the buffer is a valid finite
 *    number; on blur, an unparseable buffer falls back to 0.
 *
 * External prop changes (e.g. MapCanvas click → parent calls `set('x', …)`)
 * resync the buffer so the field still shows whatever the parent now holds.
 */
export function NumberField({ value, onChange, ...rest }: NumberFieldProps) {
  const [text, setText] = useState<string>(() => String(value));

  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // text intentionally omitted — we only resync from external value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextField
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(t)) return;
        setText(t);
        if (t === '' || t === '-' || t === '.' || t === '-.') return;
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        if (text === '' || text === '-' || text === '.' || text === '-.') {
          setText('0');
          onChange(0);
          return;
        }
        const n = Number(text);
        if (Number.isFinite(n)) setText(String(n));
      }}
    />
  );
}
