import { applyCommand, planTool, planTools, type Command, type Project, type ToolCall } from '@studio/core';
import { useStudio } from './store';

export type ToolRun = { ok: true; summaries: string[]; changed: boolean } | { ok: false; error: string };

const applyOne = (p: Project, c: Command) => applyCommand(p, c)[0];

/**
 * Validate and apply scene tool calls against the live editor state as ONE undoable step.
 * Used by the AI command bar and by the inspector's validated fields. A rejected call changes
 * nothing (the scene, history and selection stay as they were).
 */
export function runSceneTools(calls: ToolCall[], label: string): ToolRun {
  const s = useStudio.getState();
  if (s.readOnly) return { ok: false, error: 'This design is view-only for you.' };
  const plan = planTools({ project: s.project, selection: s.selection }, calls, label, applyOne);
  if (!plan.ok) return { ok: false, error: plan.error };
  if (plan.command) {
    const before = s.project;
    s.dispatch(plan.command, label);
    const after = useStudio.getState();
    // The store reports command errors through lastError instead of throwing.
    if (after.project === before) return { ok: false, error: after.lastError ?? 'The change could not be applied.' };
  }
  if (plan.selection !== undefined) useStudio.getState().select(plan.selection);
  return { ok: true, summaries: plan.summaries, changed: Boolean(plan.command) };
}

/** Validate a single call without applying it (for inline field errors). */
export function checkSceneTool(call: ToolCall): string | null {
  const s = useStudio.getState();
  const r = planTool({ project: s.project, selection: s.selection }, call);
  return r.ok ? null : r.error;
}
