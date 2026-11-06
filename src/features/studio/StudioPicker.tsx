/** `#/` for someone in several studios with no usable last studio: choose one (spec 042, User Story 2). */
import { navigate } from '@/app/router';
import { useSession } from '@/features/auth/useSession';
import { StudioShell } from './StudioShell';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', designer: 'Designer', viewer: 'Viewer' } as const;

export function StudioPicker() {
  const { memberships } = useSession();
  return (
    <StudioShell>
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="mb-1 text-base font-semibold">Choose a studio</h1>
        <p className="mb-4 text-sm text-muted-foreground">You belong to {memberships.length} studios. You can switch at any time from the top bar.</p>
        <ul className="grid gap-2">
          {memberships.map((m) => (
            <li key={m.orgId}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border bg-card px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => navigate({ name: 'studio-projects', slug: m.orgSlug })}
              >
                <span className="font-medium">{m.orgName}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </StudioShell>
  );
}
