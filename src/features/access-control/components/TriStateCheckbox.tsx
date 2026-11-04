import { useEffect, useRef, type FC, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type CheckboxState = 'checked' | 'unchecked' | 'indeterminate';

interface TriStateCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange'> {
  state: CheckboxState;
  onChange?: (nextState: CheckboxState) => void;
  label?: string;
}

export const TriStateCheckbox: FC<TriStateCheckboxProps> = ({
  state,
  onChange,
  label,
  className,
  disabled,
  ...props
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = state === 'indeterminate';
    }
  }, [state]);

  const handleClick = () => {
    if (disabled || !onChange) return;
    if (state === 'checked') {
      onChange('unchecked');
    } else {
      onChange('checked');
    }
  };

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer select-none text-sm',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={state === 'checked'}
        disabled={disabled}
        onChange={handleClick}
        className={cn(
          'size-4 rounded border-input text-primary focus:ring-primary focus:ring-1 focus:ring-offset-0 transition-colors',
          state === 'indeterminate' && 'bg-primary/20 text-primary border-primary'
        )}
        {...props}
      />
      {label && <span className="text-foreground">{label}</span>}
    </label>
  );
};
