/** The signed-in user's menu: who they are, and sign out (spec 042, FR-008, FR-011). */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/useSession';

export function AccountMenu() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={root}>
      <Button variant="ghost" size="sm" aria-label="Account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="size-6 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-6 place-items-center rounded-full bg-muted text-[11px] font-semibold" aria-hidden>
            {initials}
          </span>
        )}
      </Button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-50 mt-1 w-60 rounded-md border bg-card p-1 shadow-md">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
