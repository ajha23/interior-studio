import { useId, useState, type KeyboardEvent } from 'react';
import { formatLength, parseLength, unitSuffix, type LengthUnit } from '@/engine/measurement/units';
import { cn } from '@/lib/utils';
import { useLengthUnit } from '@/state/units';
import { Input } from './input';
import { Label } from './label';

interface MmFieldProps {
  label: string;
  /** The stored value, in millimetres. */
  value: number;
  /** Applies the new value (millimetres). If the domain rejects it, the field shows the unchanged project value. */
  onCommit: (value: number) => void;
  /** Display and entry unit; defaults to the open project's preference. */
  unit?: LengthUnit;
  disabled?: boolean;
  hint?: string;
  className?: string;
  testId?: string;
}

/**
 * A length input. It shows the stored millimetres in the display unit and accepts any unit
 * ("1500", "381 cm", "3.81 m", "12' 6\""), converting once to whole millimetres on Enter or blur;
 * Escape reverts. Invalid text never reaches the domain, and a rejected value reverts to the last
 * valid one, so the field always shows what the project contains.
 */
export function MmField({ label, value, onCommit, unit: unitProp, disabled, hint, className, testId }: MmFieldProps) {
  const id = useId();
  const projectUnit = useLengthUnit();
  const unit = unitProp ?? projectUnit;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? formatLength(value, unit, true);
  const suffix = unitSuffix(unit);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseLength(draft, unit);
    setDraft(null);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (parsed.mm !== value) onCommit(parsed.mm);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(null);
      setError(null);
      e.currentTarget.blur();
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          data-testid={testId}
          data-mm={value}
          inputMode={unit === 'ft-in' || unit === 'in' ? 'text' : 'decimal'}
          value={shown}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-hint` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className={suffix ? 'pr-9' : undefined}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {(error || hint) && (
        <p id={`${id}-hint`} className={cn('text-[11px]', error ? 'text-destructive' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
