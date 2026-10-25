import { useEffect, useId, useState, type ReactNode } from 'react';
import { mm, plainMm, type Um } from '@studio/core';

interface MmFieldProps {
  label: string;
  value: Um;
  /** Return an error message to reject the value (the field reverts and shows why). */
  onCommit: (v: Um) => void | string | null;
  min?: number; // mm
  max?: number; // mm
  hint?: ReactNode;
  testId?: string;
}

/** Exact millimetre entry. Commits on Enter/blur; never rounds silently (0.1 mm resolution shown). */
export function MmField({ label, value, onCommit, min, max, hint, testId }: MmFieldProps) {
  const [text, setText] = useState(plainMm(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!focused) setText(plainMm(value));
  }, [value, focused]);
  const n = Number(text);
  const outOfRange = (min !== undefined && n < min) || (max !== undefined && n > max);
  const invalid = text.trim() === '' || !Number.isFinite(n) || outOfRange;
  const commit = () => {
    if (invalid) {
      if (text.trim() !== '' && outOfRange) setError(`${label} must be between ${min} and ${max ?? '∞'} mm. Kept ${plainMm(value)} mm.`);
      setText(plainMm(value));
      return;
    }
    const v = mm(n);
    if (v === value) return setError(null);
    const err = onCommit(v);
    if (typeof err === 'string') {
      setError(err);
      setText(plainMm(value));
    } else setError(null);
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className={`inp ${invalid ? 'invalid' : ''}`} title={invalid && min !== undefined ? `Allowed ${min}–${max ?? '∞'} mm` : undefined}>
        <input
          data-testid={testId}
          type="number"
          step="any"
          value={text}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(plainMm(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="unit">mm</span>
      </div>
      {error && <div className="field-error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
      {hint && <div className="field-hint" style={{ gridColumn: '1 / -1' }}>{hint}</div>}
    </div>
  );
}

export function IntField({ label, value, onCommit, min, max, unit }: { label: string; value: number; onCommit: (v: number) => void | string | null; min: number; max: number; unit?: string }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text);
  const invalid = !Number.isInteger(n) || n < min || n > max;
  return (
    <div className="field">
      <label>{label}</label>
      <div className={`inp ${invalid ? 'invalid' : ''}`}>
        <input
          type="number"
          value={text}
          min={min}
          max={max}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (invalid) return setText(String(value));
            if (n === value) return;
            const err = onCommit(n);
            if (typeof err === 'string') {
              setError(err);
              setText(String(value));
            } else setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {error && <div className="field-error" role="alert" style={{ gridColumn: '1 / -1' }}>{error}</div>}
    </div>
  );
}

export function DegField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text);
  const invalid = !Number.isFinite(n);
  return (
    <div className="field">
      <label>{label}</label>
      <div className={`inp ${invalid ? 'invalid' : ''}`}>
        <input type="number" step="any" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => (invalid ? setText(String(value)) : n !== value && onCommit(((n % 360) + 360) % 360))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <span className="unit">°</span>
      </div>
    </div>
  );
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="inp">
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() && text !== value && onCommit(text.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </div>
    </div>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="inp">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
