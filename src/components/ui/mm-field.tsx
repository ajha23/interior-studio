import { useId, useState, type KeyboardEvent } from 'react';
import { parseMm } from '@/engine/measurement/format';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Label } from './label';

interface MmFieldProps {
  label: string;
  value: number;
  /** Applies the new value. If the domain rejects it, the field shows the unchanged project value. */
  onCommit: (value: number) => void;
  disabled?: boolean;
  hint?: string;
  className?: string;
  testId?: string;
}

/**
 * A millimetre input that commits on Enter or blur and reverts on Escape. Text that is not a
 * whole number of millimetres is never sent to the domain; rejected values revert to the last
 * valid value, so the field always shows what the project actually contains.
 */
export function MmField({ label, value, onCommit, disabled, hint, className, testId }: MmFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseMm(draft);
    if (parsed === null) {
      setError('Enter a whole number of millimetres.');
      setDraft(null);
      return;
    }
    setError(null);
    setDraft(null);
    if (parsed !== value) onCommit(parsed);
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
          inputMode="numeric"
          value={shown}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${id}-hint` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="pr-9"
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">mm</span>
      </div>
      {(error || hint) && (
        <p id={`${id}-hint`} className={cn('text-[11px]', error ? 'text-destructive' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
