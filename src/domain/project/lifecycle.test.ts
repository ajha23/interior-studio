import { describe, expect, it } from 'vitest';
import {
  type ApprovalMilestone,
  ProjectLifecycleStateSchema,
  evaluateLifecycleInvalidation,
} from './lifecycle';

describe('Project Lifecycle State Machine & Invalidation (UX-07)', () => {
  it('parses valid lifecycle state enum values', () => {
    expect(ProjectLifecycleStateSchema.parse('draft')).toBe('draft');
    expect(ProjectLifecycleStateSchema.parse('client_presented')).toBe('client_presented');
    expect(ProjectLifecycleStateSchema.parse('quote_approved')).toBe('quote_approved');
    expect(ProjectLifecycleStateSchema.parse('design_approved')).toBe('design_approved');
    expect(ProjectLifecycleStateSchema.parse('factory_validated')).toBe('factory_validated');
    expect(ProjectLifecycleStateSchema.parse('production_released')).toBe('production_released');
  });

  it('rejects invalid lifecycle states', () => {
    expect(() => ProjectLifecycleStateSchema.parse('unknown_state')).toThrow();
  });

  it('evaluates current milestone when design revision matches approval revision', () => {
    const revision = 'rev_abc123456789';
    const milestones: ApprovalMilestone[] = [
      {
        state: 'design_approved',
        revision,
        approvedAt: new Date().toISOString(),
      },
    ];

    const result = evaluateLifecycleInvalidation(revision, milestones);
    expect(result.isCurrent).toBe(true);
    expect(result.activeMilestone).toBe('design_approved');
    expect(result.invalidatedMilestones).toHaveLength(0);
  });

  it('detects invalidation when current revision diverged from approved milestone', () => {
    const approvedRevision = 'rev_abc123456789';
    const modifiedRevision = 'rev_xyz987654321';
    const milestones: ApprovalMilestone[] = [
      {
        state: 'design_approved',
        revision: approvedRevision,
        approvedAt: new Date().toISOString(),
      },
    ];

    const result = evaluateLifecycleInvalidation(modifiedRevision, milestones);
    expect(result.isCurrent).toBe(false);
    expect(result.invalidatedMilestones).toHaveLength(1);
    expect(result.invalidatedMilestones[0]!.state).toBe('design_approved');
    expect(result.invalidatedMilestones[0]!.message).toContain('current design revision is rev_xyz9');
  });

  it('handles empty milestones gracefully as draft state', () => {
    const result = evaluateLifecycleInvalidation('rev_initial', []);
    expect(result.isCurrent).toBe(true);
    expect(result.activeMilestone).toBe('draft');
    expect(result.invalidatedMilestones).toHaveLength(0);
  });
});
