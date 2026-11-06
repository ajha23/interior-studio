/**
 * The bar above every studio page (spec 042, FR-008): the product mark, the studio's name, switcher
 * and navigation (when a studio is open), and the account menu. The editor keeps its own top bar.
 */
import type { ReactNode } from 'react';
import type { Membership } from '@/features/auth/sessionContext';
import { AccountMenu } from './AccountMenu';
import { StudioNav, type StudioSection } from './StudioNav';

export function StudioShell({ children, studio, section }: { children: ReactNode; studio?: Membership; section?: StudioSection }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-card">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-6">
          <div className="mr-1 grid size-7 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground" aria-hidden>
            IS
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1">{studio && section && <StudioNav studio={studio} section={section} />}</div>
          <AccountMenu />
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
