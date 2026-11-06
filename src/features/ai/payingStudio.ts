/**
 * Which studio pays for AI, and its balance (spec 045, clarification 2, FR-010).
 *
 * The studio the user last opened in the shell pays, or their only studio. Until 043 links projects
 * to studios, editor routes use it too. A tiny external store (no state library), read by `aiFetch`
 * outside React and by the assistant panel through `usePayingStudio`. The server still decides
 * everything: membership, role and balance are checked in the database on every call.
 */
import { useSyncExternalStore } from 'react';
import type { Membership, OrgRole } from '@/features/auth/sessionContext';

export interface PayingStudio {
  orgId: string;
  name: string;
  role: OrgRole;
  /** Credits left, or null until loaded. */
  balance: number | null;
}

let current: PayingStudio | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** The last-opened studio if the user still belongs to it, else their only studio, else none. */
export function choosePayer(memberships: Membership[], lastSlug: string | null): Membership | null {
  const last = lastSlug ? memberships.find((m) => m.orgSlug === lastSlug) : undefined;
  if (last) return last;
  return memberships.length === 1 ? memberships[0]! : null;
}

export function getPayingStudio(): PayingStudio | null {
  return current;
}

export function setPayingStudio(m: Membership | null): void {
  if (!m) return clearPayingStudio();
  const same = current?.orgId === m.orgId;
  const next: PayingStudio = { orgId: m.orgId, name: m.orgName, role: m.role, balance: same ? (current?.balance ?? null) : null };
  if (same && current?.name === next.name && current.role === next.role) return;
  current = next;
  emit();
}

/** Records a balance for a studio; ignored if that studio no longer pays (a late reply). */
export function setPayingBalance(orgId: string, balance: number): void {
  if (!current || current.orgId !== orgId || current.balance === balance) return;
  current = { ...current, balance };
  emit();
}

export function clearPayingStudio(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribePayingStudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePayingStudio(): PayingStudio | null {
  return useSyncExternalStore(subscribePayingStudio, getPayingStudio, getPayingStudio);
}
