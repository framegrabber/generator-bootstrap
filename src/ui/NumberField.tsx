import { useEffect, useId, useRef, useState } from "react";

type Props = {
  label: string;
  unit: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  error?: string;
};

export function NumberField({ label, unit, value, onChange, step = 0.1, min, error }: Props) {
  const id = useId();
  // Local string state lets the user clear the field or type "5." without the controlled value
  // snapping back. Commits to onChange whenever the text parses to a finite number.
  const [text, setText] = useState(() => String(value));
  const lastCommitted = useRef<number>(value);

  useEffect(() => {
    // External change (not from typing here): re-sync the text.
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <div className="number-field">
      <label htmlFor={id}>{label}</label>
      <div className="number-field-input">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const parsed = parseFloat(next);
            if (Number.isFinite(parsed) && parsed !== lastCommitted.current) {
              lastCommitted.current = parsed;
              onChange(parsed);
            }
          }}
          onBlur={() => {
            // Snap back if the user leaves the field unparseable.
            if (!Number.isFinite(parseFloat(text))) setText(String(value));
          }}
        />
        <span className="number-field-unit">{unit}</span>
      </div>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
