/**
 * Effective Access Simulator Contract
 * specs/033-role-management-and-permission-matrix/contracts/access-simulator.contract.ts
 */

import type { ResourceScopeType } from '../data-model';

export interface SimulationRequest {
  orgId: string;
  actorId?: string;
  roleId?: string;
  permissionId: string;
  projectId?: string;
  resourceAssignedUserIds?: string[];
  tenantPlanId?: string;
}

export type SimulationStage = 'TENANT' | 'SUBSCRIPTION' | 'ROLE' | 'SCOPE';

export interface SimulationStageDetail {
  stage: SimulationStage;
  name: string;
  passed: boolean;
  verdict: 'PASS' | 'FAIL' | 'WARN';
  details: string;
  remedy?: string;
}

export interface SimulationResult {
  allowed: boolean;
  targetUser?: { id: string; name: string };
  targetRole?: { id: string; name: string };
  targetPermission: { id: string; title: string; module: string };
  targetResource?: { id: string; name?: string };
  evaluationStages: SimulationStageDetail[];
  finalReason: string;
  effectiveScopes: ResourceScopeType[];
}

export interface IAccessSimulatorService {
  /** Simulate effective authorization for given context */
  simulateAccess(request: SimulationRequest): Promise<SimulationResult>;
}
