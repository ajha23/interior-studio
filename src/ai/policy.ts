/**
 * When a proposal may be applied without the designer pressing Apply. Approval is the default;
 * auto-apply is opt-in and only covers small, reversible, unambiguous edits. Deletions, layout-wide
 * changes and anything with side effects or warnings always wait for approval.
 */
import type { Proposal } from './transaction';

export interface AssistantSettings {
  autoApply: boolean;
}

export const DEFAULT_SETTINGS: AssistantSettings = { autoApply: false };

const DESTRUCTIVE = new Set(['remove_entity', 'remove_opening', 'apply_layout']);

export function isDestructive(p: Proposal): boolean {
  return p.commands.some((c) => DESTRUCTIVE.has(c.type)) || (p.changes?.removed.length ?? 0) > 0;
}

export function approvalReason(p: Proposal, settings: AssistantSettings): string | null {
  if (p.status !== 'valid' || !p.changes) return 'Not applicable';
  if (isDestructive(p)) return 'Deletes something';
  if (!settings.autoApply) return 'Approval is on';
  if (p.changes.modified.some((c) => c.dependency)) return 'Also moves or changes other objects';
  if (p.changes.room) return 'Changes the room';
  if (p.warnings.length) return 'Has design warnings';
  const touched = p.changes.added.length + p.changes.modified.length;
  if (touched > 1) return 'Changes several objects';
  return null;
}

/** True when the proposal can be applied straight away under the settings. */
export function canAutoApply(p: Proposal, settings: AssistantSettings): boolean {
  return approvalReason(p, settings) === null;
}
