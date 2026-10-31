import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PanelSection({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-2.5 border-b px-4 py-3.5', className)} aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
