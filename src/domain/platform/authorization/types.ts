import { z } from 'zod';

/**
 * Resource-level access scopes.
 */
export const ResourceScopeTypeSchema = z.enum([
  'all_projects',
  'assigned_projects',
  'team_projects',
  'client_projects',
  'specific_projects',
]);
export type ResourceScopeType = z.infer<typeof ResourceScopeTypeSchema>;

/**
 * Module standard action types.
 */
export const ModuleActionSchema = z.enum([
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'export',
]);
export type ModuleAction = z.infer<typeof ModuleActionSchema>;

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
  entitlementKey: z.string().optional(),
  isHighRisk: z.boolean().default(false).optional(),
  supportedScopes: z.array(ResourceScopeTypeSchema).min(1).default(['all_projects']),
});
export type PermissionDefinition = z.infer<typeof PermissionDefinitionSchema>;

/**
 * Role status enum.
 */
export const RoleStatusSchema = z.enum(['active', 'deactivated']);
export type RoleStatus = z.infer<typeof RoleStatusSchema>;

/**
 * Role Resource Scope Configuration.
 */
export const RoleResourceScopeConfigSchema = z.object({
  scopeType: ResourceScopeTypeSchema.default('all_projects'),
  specificProjectIds: z.array(z.string()).default([]),
  teamIds: z.array(z.string()).default([]),
});
export type RoleResourceScopeConfig = z.infer<typeof RoleResourceScopeConfigSchema>;

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
  scopeConfig: RoleResourceScopeConfigSchema.default({
    scopeType: 'all_projects',
    specificProjectIds: [],
    teamIds: [],
  }),
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
  userName: z.string().optional(),
  userEmail: z.string().optional(),
  roleId: z.string().min(1),
  assignedBy: z.string().min(1),
  assignedAt: z.string().datetime(),
});
export type UserRoleAssignment = z.infer<typeof UserRoleAssignmentSchema>;

/**
 * Predefined Industry Role Template.
 */
export const RoleTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: z.string(),
  defaultRank: z.number().int(),
  recommendedScope: ResourceScopeTypeSchema,
  grantedPermissionIds: z.array(z.string()),
});
export type RoleTemplate = z.infer<typeof RoleTemplateSchema>;

/**
 * Role Audit Event Schema.
 */
export const RoleAuditEventSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  actorId: z.string().min(1),
  actorName: z.string().default('Admin'),
  roleId: z.string().min(1),
  roleName: z.string(),
  actionType: z.enum([
    'created',
    'updated',
    'cloned',
    'deactivated',
    'reactivated',
    'assigned',
    'unassigned',
  ]),
  changesSummary: z.string(),
  addedPermissions: z.array(z.string()).default([]),
  removedPermissions: z.array(z.string()).default([]),
  previousScope: ResourceScopeTypeSchema.optional(),
  newScope: ResourceScopeTypeSchema.optional(),
  affectedUserCount: z.number().int().default(0),
  timestamp: z.string().datetime(),
});
export type RoleAuditEvent = z.infer<typeof RoleAuditEventSchema>;

/**
 * Change Impact Analysis for pre-commit diff calculation.
 */
export interface ChangeImpactAnalysis {
  roleId: string;
  affectedUserCount: number;
  affectedUserNames: string[];
  addedPermissions: Array<{ id: string; title: string; module: string }>;
  removedPermissions: Array<{ id: string; title: string; module: string }>;
  isScopeChanged: boolean;
  previousScope?: ResourceScopeType;
  newScope?: ResourceScopeType;
  highRiskPermissionsAdded: string[];
}

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
