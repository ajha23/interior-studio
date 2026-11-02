import { z } from 'zod';

/**
 * Resource-level access scopes.
 */
export const ResourceScopeTypeSchema = z.enum([
  'all_projects',
  'assigned_projects',
  'team_projects',
  'client_projects',
]);
export type ResourceScopeType = z.infer<typeof ResourceScopeTypeSchema>;

/**
 * Module Capability declaration.
 */
export const ModuleCapabilitySchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  defaultScopes: z.array(ResourceScopeTypeSchema).default(['all_projects']),
});
export type ModuleCapability = z.infer<typeof ModuleCapabilitySchema>;

/**
 * Module Definition registered with the Central Module Registry.
 */
export const ModuleDefinitionSchema = z.object({
  id: z.string().min(1), // e.g. 'module-projects', 'module-cad-engine'
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  dependencies: z.array(z.string()).default([]),
  capabilities: z.array(ModuleCapabilitySchema).default([]),
});
export type ModuleDefinition = z.infer<typeof ModuleDefinitionSchema>;

/**
 * Granular Action-level Permission Definition.
 */
export const PermissionDefinitionSchema = z.object({
  id: z.string().min(1), // e.g. 'designs.3d.export'
  moduleId: z.string().min(1),
  resource: z.string().min(1),
  action: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  supportedScopes: z.array(ResourceScopeTypeSchema).min(1).default(['all_projects']),
});
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>;

/**
 * Role status enum.
 */
export const RoleStatusSchema = z.enum(['active', 'deactivated']);
export type RoleStatus = z.infer<typeof RoleStatusSchema>;

/**
 * Custom Tenant Role Schema.
 */
export const CustomRoleSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid().nullable(), // null for immutable system role templates
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  rank: z.number().int().min(1).max(100), // Owner = 100, Admin = 80, Designer = 60, etc.
  isSystemRole: z.boolean().default(false),
  status: RoleStatusSchema.default('active'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomRole = z.infer<typeof CustomRoleSchema>;

/**
 * Role Permission Mapping with resource scope qualification.
 */
export const RolePermissionMappingSchema = z.object({
  roleId: z.string().min(1),
  permissionId: z.string().min(1),
  scopeType: ResourceScopeTypeSchema.default('all_projects'),
});
export type RolePermissionMapping = z.infer<typeof RolePermissionMappingSchema>;

/**
 * User Role Assignment within an organization.
 */
export const UserRoleAssignmentSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  userId: z.string().min(1),
  roleId: z.string().min(1),
  assignedBy: z.string().min(1),
  assignedAt: z.string().datetime(),
});
export type UserRoleAssignment = z.infer<typeof UserRoleAssignmentSchema>;

/**
 * Resource Context for authorization checks.
 */
export const ResourceContextSchema = z.object({
  projectId: z.string().optional(),
  assignedUserIds: z.array(z.string()).optional(),
  teamId: z.string().optional(),
  clientId: z.string().optional(),
});
export type ResourceContext = z.infer<typeof ResourceContextSchema>;

/**
 * Actor context for authorization checks.
 */
export interface ActorRolePermission {
  permissionId: string;
  scopeType: ResourceScopeType;
}

export interface ActorRole {
  roleId: string;
  rank?: number;
  status?: RoleStatus;
  permissions: ActorRolePermission[];
}

export interface ActorContext {
  id: string; // User ID
  orgId: string; // Tenant Organization ID
  roles: ActorRole[];
  teamId?: string;
  clientId?: string;
}

/**
 * Authorization Evaluation Result.
 */
export interface AuthorizationEvaluationResult {
  allowed: boolean;
  reason?: string;
  applicableScope?: ResourceScopeType;
  evaluatedRoles: string[];
  missingPermissions?: string[];
}
