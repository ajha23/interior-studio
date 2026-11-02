import { describe, expect, it } from 'vitest';
import { ProjectRosterService, type ProjectRosterItem } from './lifecycleManager';

describe('Downgrade Retention & Project Roster (Non-Destructive Retention FR-008)', () => {
  const orgId = '77777777-7777-7777-7777-777777777777';

  // 20 existing customer projects
  const initialProjects: ProjectRosterItem[] = Array.from({ length: 20 }).map((_, i) => ({
    id: `proj_${i + 1}`,
    name: `Villa Project ${i + 1}`,
    orgId,
    status: 'active',
    lastModifiedAt: `2026-11-0${(i % 9) + 1}T10:00:00.000Z`,
  }));

  it('identifies when roster selection is required upon downgrade', () => {
    const service = new ProjectRosterService();
    // Starter tier allows 15 active projects
    const check = service.checkDowngradeImpact(initialProjects, 15);

    expect(check.rosterSelectionRequired).toBe(true);
    expect(check.excessCount).toBe(5);
    expect(check.totalProjects).toBe(20);
    expect(check.allowedActiveCount).toBe(15);
  });

  it('does not require roster selection if project count is within new quota', () => {
    const service = new ProjectRosterService();
    const smallProjects = initialProjects.slice(0, 10);
    const check = service.checkDowngradeImpact(smallProjects, 15);

    expect(check.rosterSelectionRequired).toBe(false);
    expect(check.excessCount).toBe(0);
  });

  it('designates selected projects as active and transitions unselected to archived read-only with ZERO data deletion', () => {
    const service = new ProjectRosterService();
    // Studio owner picks the first 15 projects to remain active
    const selectedIds = initialProjects.slice(0, 15).map((p) => p.id);

    const result = service.applyRosterSelection(initialProjects, selectedIds, 15);

    // Total count must remain strictly 20 (zero silent deletion!)
    expect(result.updatedProjects.length).toBe(20);

    const active = result.updatedProjects.filter((p) => p.status === 'active');
    const archived = result.updatedProjects.filter((p) => p.status === 'archived_read_only');

    expect(active.length).toBe(15);
    expect(archived.length).toBe(5);

    // Verify unselected are specifically the last 5
    const archivedIds = archived.map((p) => p.id);
    expect(archivedIds).toContain('proj_16');
    expect(archivedIds).toContain('proj_20');
  });

  it('rejects selecting more active projects than permitted by the new quota', () => {
    const service = new ProjectRosterService();
    // Attempting to select 16 projects when quota is 15
    const selectedIds = initialProjects.slice(0, 16).map((p) => p.id);

    expect(() =>
      service.applyRosterSelection(initialProjects, selectedIds, 15)
    ).toThrowError(/Cannot select more active projects than the allowed quota/i);
  });
});
