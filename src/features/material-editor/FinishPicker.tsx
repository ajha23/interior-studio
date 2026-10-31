import { Check } from 'lucide-react';
import type { KitchenMaterial, MaterialCategory } from '@/domain';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  category: MaterialCategory;
  materials: Record<string, KitchenMaterial>;
  value: string;
  onPick: (materialId: string) => void;
}

/** Swatch grid of the project's finishes in one category. */
export function FinishPicker({ label, category, materials, value, onPick }: Props) {
  const options = Object.values(materials).filter((m) => m.category === category);
  const current = materials[value];
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={label}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="truncate text-xs">{current?.name ?? value}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === value}
            aria-label={m.name}
            title={m.name}
            onClick={() => m.id !== value && onPick(m.id)}
            className={cn('grid size-7 place-items-center rounded-md border shadow-xs transition', m.id === value ? 'ring-2 ring-highlight ring-offset-1 ring-offset-card' : 'hover:scale-105')}
            style={{ backgroundColor: m.color }}
          >
            {m.id === value && <Check className="size-3.5 mix-blend-difference" color="white" />}
          </button>
        ))}
      </div>
    </div>
  );
}
