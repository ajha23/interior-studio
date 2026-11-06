/**
 * Resolves the URL slug to one of the user's studios before a studio page renders (spec 042,
 * FR-007). For any other slug it shows "no access" and never renders the page, so nothing is
 * fetched for that studio. Row-level security would refuse it anyway; this keeps the UI honest.
 */
import { useEffect, type ReactNode } from 'react';
import { StudioShell } from './StudioShell';
import { rememberLastStudio, useStudio, type Studio } from './useStudio';

export function StudioGate({ slug, children }: { slug: string; children: (studio: Studio) => ReactNode }) {
  const studio = useStudio(slug);
  useEffect(() => {
    if (studio) rememberLastStudio(studio.membership.orgSlug);
  }, [studio]);

  if (!studio) {
    return (
      <StudioShell>
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm">
          <h1 className="mb-2 text-base font-semibold">You don&apos;t have access to this studio</h1>
          <p className="mb-4 text-muted-foreground">The address points to a studio you are not a member of. Ask its owner to invite you, or go back to your own.</p>
          <a href="#/" className="font-medium text-primary underline-offset-4 hover:underline">
            Go to your studio
          </a>
        </div>
      </StudioShell>
    );
  }
  return <>{children(studio)}</>;
}
