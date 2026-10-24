import { useEffect, useState, type ReactNode } from 'react';
import { mm, plainMm, type Um } from '@studio/core';

interface MmFieldProps {
  label: string;
  value: Um;
  onCommit: (v: Um) => void;
  min?: number; // mm
  max?: number; // mm
  hint?: ReactNode;
  testId?: string;
}

/** Exact millimetre entry. Commits on Enter/blur; never rounds silently (0.1 mm resolution shown). */
export function MmField({ label, value, onCommit, min, max, hint, testId }: MmFieldProps) {
  const [text, setText] = useState(plainMm(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(plainMm(value));
  }, [value, focused]);
  const n = Number(text);
  const invalid = text.trim() === '' || !Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max);
  const commit = () => {
    if (invalid) {
      setText(plainMm(value));
      return;
    }
    const v = mm(n);
    if (v !== value) onCommit(v);
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
      {hint && <div className="field-hint" style={{ gridColumn: '1 / -1' }}>{hint}</div>}
    </div>
  );
}

export function IntField({ label, value, onCommit, min, max, unit }: { label: string; value: number; onCommit: (v: number) => void; min: number; max: number; unit?: string }) {
  const [text, setText] = useState(String(value));
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
          onBlur={() => (invalid ? setText(String(value)) : n !== value && onCommit(n))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
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
  return (
    <div className="field">
      <label>{label}</label>
      <div className="inp">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
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
