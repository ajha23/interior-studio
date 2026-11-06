/**
 * The bar above every studio page (spec 042, FR-008): the product mark and the account menu.
 * The studio name, switcher and navigation join it in User Story 2. Studio pages render inside it;
 * the editor keeps its own top bar.
 */
import type { ReactNode } from 'react';
import { AccountMenu } from './AccountMenu';

export function StudioShell({ children, left }: { children: ReactNode; left?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-card">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-6">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground" aria-hidden>
            IS
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">{left}</div>
          <AccountMenu />
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
