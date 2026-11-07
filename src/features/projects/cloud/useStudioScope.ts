import { useEffect, useMemo } from 'react';
import type { Membership } from '@/features/auth/sessionContext';
import { useSession } from '@/features/auth/useSession';
import { enterStudio, makeStudioContext, type StudioContext } from './studioContext';

/** The studio of this page, entered while the page is on screen (spec 043). */
export function useStudioScope(membership: Membership): StudioContext | null {
  const { user } = useSession();
  const userId = user?.id ?? '';
  const studio = useMemo(
    () => (userId ? makeStudioContext({ userId, orgId: membership.orgId, slug: membership.orgSlug, name: membership.orgName, role: membership.role }) : null),
    [userId, membership.orgId, membership.orgSlug, membership.orgName, membership.role],
  );
  useEffect(() => (studio ? enterStudio(studio) : undefined), [studio]);
  return studio;
}
