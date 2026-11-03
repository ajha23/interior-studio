/**
 * Permission Registry Contract
 * specs/033-role-management-and-permission-matrix/contracts/permission-registry.contract.ts
 */

import type { PermissionDefinition, ModuleAction } from '../data-model';

export interface ModuleHierarchyNode {
  moduleId: string;
  moduleName: string;
  category: string;
  order: number;
  description: string;
  icon: string;
  actionsSupported: ModuleAction[];
  capabilities: Array<{
    id: string;
    resource: string;
    action: ModuleAction;
    title: string;
    description: string;
    entitlementKey?: string;
    isHighRisk: boolean;
    requiredPlanTier?: string;
  }>;
}

export interface IPermissionRegistryService {
  /** Returns the full module hierarchy tree for rendering the permission matrix */
  getModuleHierarchy(): ModuleHierarchyNode[];

  /** Find permission definition by ID */
  getPermission(permissionId: string): PermissionDefinition | undefined;

  /** Search permissions by keyword (title, description, module name) */
  searchPermissions(query: string): ModuleHierarchyNode[];

  /** Check if a permission is plan-restricted under the given subscription plan */
  isPlanRestricted(permissionId: string, currentPlanId: string): {
    restricted: boolean;
    requiredPlanTier?: string;
    entitlementKey?: string;
  };
}
