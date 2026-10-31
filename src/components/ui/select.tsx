import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Native select styled like shadcn/ui's trigger; keeps full keyboard and screen-reader support. */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('h-8 w-full rounded-md border border-input bg-card px-2 text-sm shadow-xs', className)} {...props} />;
}
