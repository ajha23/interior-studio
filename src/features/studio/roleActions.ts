/**
 * What each studio role is shown (spec 042, FR-010; table in data-model.md). This only decides
 * visibility: the database's row-level security decides what is allowed.
 */
import type { Membership, OrgRole } from '@/features/auth/sessionContext';

export interface StudioActions {
  seeMembers: boolean;
  seeInvites: boolean;
  invite: boolean;
  changeRoles: boolean;
  /** Roles that may be chosen when inviting or changing a role. Never `owner`. */
  assignableRoles: Exclude<OrgRole, 'owner'>[];
}

export function actionsFor(role: OrgRole): StudioActions {
  const manage = role === 'owner' || role === 'admin';
  return {
    seeMembers: true,
    seeInvites: manage,
    invite: manage,
    changeRoles: manage,
    assignableRoles: manage ? ['admin', 'designer', 'viewer'] : [],
  };
}

/**
 * Where `#/` goes: the only studio; else the last-used studio if still a membership; else null,
 * which means "show the picker" (or the no-studio screen when there are none).
 */
export function chooseStudio(memberships: Membership[], lastSlug: string | null): string | null {
  if (memberships.length === 1) return memberships[0]!.orgSlug;
  if (lastSlug && memberships.some((m) => m.orgSlug === lastSlug)) return lastSlug;
  return null;
}
