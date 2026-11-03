import { describe, it, expect, beforeEach } from 'vitest';
import { AccessSimulator } from './accessSimulator';
import { AdminRoleService } from './adminRoleService';
import { bootstrapModuleRegistry } from './bootstrap';
import { moduleRegistry } from './moduleRegistry';

describe('AccessSimulator (US5, FR-010)', () => {
  let roleService: AdminRoleService;
  let simulator: AccessSimulator;
  const orgId = 'org_sim_test';

  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    roleService = new AdminRoleService();
    simulator = new AccessSimulator(roleService);
  });

  it('rejects access at Stage 1 if tenant is cancelled or inactive', () => {
    const result = simulator.simulateAccess({
      orgId,
      roleId: 'owner',
      permissionId: 'projects:read',
      tenantStatus: 'cancelled',
    });

    expect(result.allowed).toBe(false);
    expect(result.evaluationStages).toHaveLength(1);
    expect(result.evaluationStages[0]?.stage).toBe('TENANT');
    expect(result.evaluationStages[0]?.verdict).toBe('FAIL');
    expect(result.finalReason).toContain('cancelled');
  });

  it('rejects access at Stage 2 if permission requires Pro tier but tenant is on Starter', () => {
    // designs.3d.export requires feature.design.3d.export_cad (Pro only)
    const result = simulator.simulateAccess({
      orgId,
      roleId: 'owner',
      permissionId: 'designs.3d.export',
      tenantPlanId: 'starter',
      tenantStatus: 'active',
    });

    expect(result.allowed).toBe(false);
    expect(result.evaluationStages).toHaveLength(2);
    expect(result.evaluationStages[0]?.stage).toBe('TENANT');
    expect(result.evaluationStages[0]?.passed).toBe(true);
    expect(result.evaluationStages[1]?.stage).toBe('SUBSCRIPTION');
    expect(result.evaluationStages[1]?.passed).toBe(false);
    expect(result.evaluationStages[1]?.remedy).toContain('Upgrade tenant subscription to Pro Studio');
  });

  it('passes Stage 2 if tenant is on Pro plan for entitled capabilities', () => {
    const result = simulator.simulateAccess({
      orgId,
      roleId: 'owner',
      permissionId: 'designs.3d.export',
      tenantPlanId: 'pro',
      tenantStatus: 'active',
    });

    expect(result.allowed).toBe(true);
    const subStage = result.evaluationStages.find((s) => s.stage === 'SUBSCRIPTION');
    expect(subStage?.passed).toBe(true);
  });

  it('rejects access at Stage 3 if role lacks the requested permission', () => {
    // Client viewer only has designs.3d.view and deliverables:generate
    const result = simulator.simulateAccess({
      orgId,
      roleId: 'client_viewer',
      permissionId: 'projects:delete',
      tenantPlanId: 'pro',
      tenantStatus: 'active',
    });

    expect(result.allowed).toBe(false);
    const roleStage = result.evaluationStages.find((s) => s.stage === 'ROLE');
    expect(roleStage?.passed).toBe(false);
    expect(roleStage?.verdict).toBe('FAIL');
    expect(result.finalReason).toContain('not granted by assigned roles');
  });

  it('rejects access at Stage 4 if role is scoped to assigned_projects but user is unassigned', () => {
    // Create custom designer role scoped to assigned_projects
    const role = roleService.createRole(100, {
      orgId,
      name: 'Freelancer',
      rank: 40,
      scopeConfig: {
        scopeType: 'assigned_projects',
        specificProjectIds: [],
        teamIds: [],
      },
      initialPermissions: [
        { permissionId: 'projects:write', scopeType: 'assigned_projects' },
      ],
    });

    roleService.assignUserRole(100, {
      orgId,
      userId: 'user_freelancer_01',
      roleId: role.id,
    });

    const result = simulator.simulateAccess({
      orgId,
      actorId: 'user_freelancer_01',
      permissionId: 'projects:write',
      projectId: 'proj_restricted_101',
      resourceAssignedUserIds: ['user_other_designer'], // user_freelancer_01 not assigned!
      tenantPlanId: 'pro',
      tenantStatus: 'active',
    });

    expect(result.allowed).toBe(false);
    const scopeStage = result.evaluationStages.find((s) => s.stage === 'SCOPE');
    expect(scopeStage?.passed).toBe(false);
    expect(scopeStage?.details).toContain('user is not assigned to project "proj_restricted_101"');
  });

  it('grants access when all 4 stages pass for an assigned designer', () => {
    const role = roleService.createRole(100, {
      orgId,
      name: 'Studio Designer',
      rank: 50,
      scopeConfig: {
        scopeType: 'assigned_projects',
        specificProjectIds: [],
        teamIds: [],
      },
      initialPermissions: [
        { permissionId: 'projects:write', scopeType: 'assigned_projects' },
      ],
    });

    roleService.assignUserRole(100, {
      orgId,
      userId: 'user_designer_01',
      roleId: role.id,
    });

    const result = simulator.simulateAccess({
      orgId,
      actorId: 'user_designer_01',
      permissionId: 'projects:write',
      projectId: 'proj_assigned_202',
      resourceAssignedUserIds: ['user_designer_01'], // Assigned!
      tenantPlanId: 'pro',
      tenantStatus: 'active',
    });

    expect(result.allowed).toBe(true);
    expect(result.evaluationStages.every((s) => s.passed)).toBe(true);
    expect(result.finalReason).toContain('All 4 policy evaluation stages passed');
  });

  it('evaluates multi-role additive union: user with two roles inherits permissions of both', () => {
    // Role 1: 2D drafting
    const roleDrafter = roleService.createRole(100, {
      orgId,
      name: 'Drafting Specialist',
      rank: 40,
      initialPermissions: [
        { permissionId: 'floor_plans:write', scopeType: 'all_projects' },
      ],
    });

    // Role 2: Reviewer (deliverables)
    const roleReviewer = roleService.createRole(100, {
      orgId,
      name: 'Package Approver',
      rank: 45,
      initialPermissions: [
        { permissionId: 'deliverables:share', scopeType: 'all_projects' },
      ],
    });

    // Assign both to user_multirole
    roleService.assignUserRole(100, {
      orgId,
      userId: 'user_multirole',
      roleId: roleDrafter.id,
    });
    roleService.assignUserRole(100, {
      orgId,
      userId: 'user_multirole',
      roleId: roleReviewer.id,
    });

    // Can draft floor plans
    const resDraft = simulator.simulateAccess({
      orgId,
      actorId: 'user_multirole',
      permissionId: 'floor_plans:write',
      tenantPlanId: 'pro',
    });
    expect(resDraft.allowed).toBe(true);

    // Can share deliverables
    const resShare = simulator.simulateAccess({
      orgId,
      actorId: 'user_multirole',
      permissionId: 'deliverables:share',
      tenantPlanId: 'pro',
    });
    expect(resShare.allowed).toBe(true);
  });
});
