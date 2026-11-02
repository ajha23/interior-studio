import { z } from 'zod';

export const ProjectLifecycleStateSchema = z.enum([
  'draft',
  'client_presented',
  'quote_approved',
  'design_approved',
  'factory_validated',
  'production_released',
]);
export type ProjectLifecycleState = z.infer<typeof ProjectLifecycleStateSchema>;

export const ApprovalMilestoneSchema = z.object({
  state: ProjectLifecycleStateSchema,
  revision: z.string().min(1),
  approvedAt: z.string().datetime(),
  actorId: z.string().optional(),
  note: z.string().optional(),
});
export type ApprovalMilestone = z.infer<typeof ApprovalMilestoneSchema>;

export interface InvalidatedMilestone {
  state: ProjectLifecycleState;
  revision: string;
  approvedAt: string;
  message: string;
}

export interface InvalidationCheckResult {
  isCurrent: boolean;
  currentRevision: string;
  activeMilestone: ProjectLifecycleState;
  invalidatedMilestones: InvalidatedMilestone[];
}

/**
 * Evaluates whether previously approved milestones are still current or have been invalidated
 * by subsequent design changes (revision divergence).
 */
export function evaluateLifecycleInvalidation(
  currentRevision: string,
  milestones: ApprovalMilestone[]
): InvalidationCheckResult {
  if (milestones.length === 0) {
    return {
      isCurrent: true,
      currentRevision,
      activeMilestone: 'draft',
      invalidatedMilestones: [],
    };
  }

  const invalidated: InvalidatedMilestone[] = [];
  let highestCurrentMilestone: ProjectLifecycleState = 'draft';

  for (const milestone of milestones) {
    if (milestone.revision === currentRevision) {
      highestCurrentMilestone = milestone.state;
    } else {
      invalidated.push({
        state: milestone.state,
        revision: milestone.revision,
        approvedAt: milestone.approvedAt,
        message: `Milestone '${milestone.state}' was approved on revision ${milestone.revision.slice(0, 8)}, but current design revision is ${currentRevision.slice(0, 8)}.`,
      });
    }
  }

  return {
    isCurrent: invalidated.length === 0,
    currentRevision,
    activeMilestone: highestCurrentMilestone,
    invalidatedMilestones: invalidated,
  };
}
