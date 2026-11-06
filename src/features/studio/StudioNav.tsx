/**
 * The studio part of the shell bar (spec 042, FR-008): the studio's name, a switcher when the user
 * belongs to more than one, and navigation to Projects and Settings. Switching keeps the section.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { navigate, routeHash, type Route } from '@/app/router';
import { useSession } from '@/features/auth/useSession';
import type { Membership } from '@/features/auth/sessionContext';

export type StudioSection = 'projects' | 'settings';

function routeFor(slug: string, section: StudioSection): Route {
  return section === 'projects' ? { name: 'studio-projects', slug } : { name: 'studio-settings', slug, section: 'members' };
}

function Switcher({ current, section }: { current: Membership; section: StudioSection }) {
  const { memberships } = useSession();
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

  if (memberships.length < 2) return null;
  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-label="Switch studio"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronsUpDown className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Studios" className="absolute left-0 z-50 mt-1 w-56 rounded-md border bg-card p-1 shadow-md">
          {memberships.map((m) => (
            <button
              key={m.orgId}
              type="button"
              role="menuitem"
              aria-current={m.orgId === current.orgId ? 'true' : undefined}
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => {
                setOpen(false);
                if (m.orgId !== current.orgId) navigate(routeFor(m.orgSlug, section));
              }}
            >
              <span className="truncate">{m.orgName}</span>
              {m.orgId === current.orgId && <span className="text-xs text-muted-foreground">Current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StudioNav({ studio, section }: { studio: Membership; section: StudioSection }) {
  const link = (to: StudioSection, label: string) => (
    <a
      href={`#${routeHash(routeFor(studio.orgSlug, to))}`}
      aria-current={section === to ? 'page' : undefined}
      className="rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
    >
      {label}
    </a>
  );
  return (
    <>
      <span data-testid="studio-name" className="truncate text-sm font-semibold">
        {studio.orgName}
      </span>
      <Switcher current={studio} section={section} />
      <nav aria-label="Studio" className="ml-3 flex items-center gap-1">
        {link('projects', 'Projects')}
        {link('settings', 'Settings')}
      </nav>
    </>
  );
}
