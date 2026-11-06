import { useSession } from '@/features/auth/useSession';
import { LAST_STUDIO_KEY, type Membership } from '@/features/auth/sessionContext';
import { actionsFor, type StudioActions } from './roleActions';

export interface Studio {
  membership: Membership;
  actions: StudioActions;
}

/** The studio named by the URL slug, if the signed-in user belongs to it (spec 042, FR-007). */
export function useStudio(slug: string): Studio | null {
  const { memberships } = useSession();
  const membership = memberships.find((m) => m.orgSlug === slug);
  return membership ? { membership, actions: actionsFor(membership.role) } : null;
}

export function readLastStudio(): string | null {
  try {
    return localStorage.getItem(LAST_STUDIO_KEY);
  } catch {
    return null;
  }
}

export function rememberLastStudio(slug: string): void {
  try {
    localStorage.setItem(LAST_STUDIO_KEY, slug);
  } catch {
    // Storage blocked: #/ falls back to the picker.
  }
}
