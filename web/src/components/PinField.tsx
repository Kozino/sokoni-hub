// web/src/components/PinField.tsx
import { Field } from './ui';

/** One masked, numeric-keypad input for a 4-digit PIN. */
export default function PinField({
  label, hint, value, onChange, autoFocus, name,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  name?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        required
        className="pin-input"
        name={name}
        type="password"
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        placeholder="••••"
        value={value}
        // Digits only, whatever gets typed or pasted.
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        autoComplete="off"
        autoFocus={autoFocus}
      />
    </Field>
  );
}
