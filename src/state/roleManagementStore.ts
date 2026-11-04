import { create } from 'zustand';
import { AdminRoleService } from '@/domain/platform/authorization/adminRoleService';
import { AccessSimulator, type SimulationResult } from '@/domain/platform/authorization/accessSimulator';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';
import { getRoleTemplateById } from '@/domain/platform/authorization/roleTemplates';
import type {
  CustomRole,
  ResourceScopeType,
  UserRoleAssignment,
  ChangeImpactAnalysis,
  RoleAuditEvent,
} from '@/domain/platform/authorization/types';

export interface DraftRoleState {
  id?: string;
  name: string;
  description: string;
  rank: number;
  scopeType: ResourceScopeType;
  specificProjectIds: string[];
  permissions: Set<string>;
}

export interface RoleManagementState {
  // Service instances
  service: AdminRoleService;
  simulator: AccessSimulator;
  currentOrgId: string;
  currentUserRank: number;

  // Data
  roles: CustomRole[];
  selectedRoleId: string | null;
  roleMemberCounts: Record<string, number>;
  roleMembers: UserRoleAssignment[];
  auditEvents: RoleAuditEvent[];

  // Filter & Search
  searchQuery: string;
  typeFilter: 'all' | 'system' | 'custom';
  scopeFilter: 'all' | ResourceScopeType;

  // Draft / Editor
  draftRole: DraftRoleState | null;
  isDirty: boolean;

  // Modals
  cloneModalOpen: boolean;
  cloneSourceRole: CustomRole | null;
  impactModalOpen: boolean;
  pendingImpact: ChangeImpactAnalysis | null;

  // Simulator
  simUserId: string;
  simRoleId: string;
  simPermissionId: string;
  simProjectId: string;
  simResult: SimulationResult | null;

  // Actions
  initialize: (orgId: string, userRank?: number) => void;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (filter: 'all' | 'system' | 'custom') => void;
  setScopeFilter: (filter: 'all' | ResourceScopeType) => void;

  selectRole: (roleId: string | null) => void;
  startCreateRole: (templateId?: string) => void;
  startEditRole: (roleId: string) => void;
  updateDraftName: (name: string) => void;
  updateDraftDescription: (description: string) => void;
  updateDraftScope: (scopeType: ResourceScopeType, specificProjectIds?: string[]) => void;
  toggleDraftPermission: (permissionId: string) => void;
  setDraftModulePermissions: (moduleId: string, enable: boolean) => void;
  discardDraft: () => void;

  // Clone
  openCloneModal: (sourceRole: CustomRole) => void;
  closeCloneModal: () => void;
  executeClone: (newRoleName: string, newDescription?: string) => CustomRole;

  // Save / Impact
  requestSaveDraft: () => ChangeImpactAnalysis | null;
  commitSaveDraft: () => CustomRole;
  closeImpactModal: () => void;

  // Role lifecycle
  deactivateRole: (roleId: string) => void;
  reactivateRole: (roleId: string) => void;

  // Member management
  assignMember: (userId: string, roleId: string, userName?: string) => void;
  unassignMember: (userId: string, roleId: string) => void;

  // Simulator actions
  setSimUserId: (userId: string) => void;
  setSimRoleId: (roleId: string) => void;
  setSimPermissionId: (permissionId: string) => void;
  setSimProjectId: (projectId: string) => void;
  runSimulation: (planId?: string) => SimulationResult;
}

// Ensure module registry is bootstrapped
bootstrapModuleRegistry();

const initialService = new AdminRoleService();
const initialSimulator = new AccessSimulator(initialService);

export const useRoleManagementStore = create<RoleManagementState>((set, get) => ({
  service: initialService,
  simulator: initialSimulator,
  currentOrgId: 'org_default',
  currentUserRank: 100, // Owner by default

  roles: initialService.listRoles('org_default'),
  selectedRoleId: null,
  roleMemberCounts: {},
  roleMembers: [],
  auditEvents: [],

  searchQuery: '',
  typeFilter: 'all',
  scopeFilter: 'all',

  draftRole: null,
  isDirty: false,

  cloneModalOpen: false,
  cloneSourceRole: null,
  impactModalOpen: false,
  pendingImpact: null,

  simUserId: '',
  simRoleId: 'designer',
  simPermissionId: 'designs.3d.view',
  simProjectId: '',
  simResult: null,

  initialize: (orgId: string, userRank = 100) => {
    bootstrapModuleRegistry();
    const service = get().service;
    const roles = service.listRoles(orgId);
    const counts: Record<string, number> = {};
    for (const r of roles) {
      counts[r.id] = service.getRoleMemberCount(orgId, r.id);
    }
    const auditEvents = service.getRoleAuditEvents(orgId);

    set({
      currentOrgId: orgId,
      currentUserRank: userRank,
      roles,
      roleMemberCounts: counts,
      auditEvents,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setTypeFilter: (filter) => set({ typeFilter: filter }),
  setScopeFilter: (filter) => set({ scopeFilter: filter }),

  selectRole: (roleId) => {
    const { service, currentOrgId } = get();
    if (!roleId) {
      set({ selectedRoleId: null, roleMembers: [] });
      return;
    }
    const members = service.listRoleMembers(currentOrgId, roleId);
    set({ selectedRoleId: roleId, roleMembers: members });
  },

  startCreateRole: (templateId) => {
    const template = templateId ? getRoleTemplateById(templateId) : undefined;
    const initialPerms = new Set<string>(template?.grantedPermissionIds || []);

    set({
      draftRole: {
        name: template?.name ? `${template.name} (Custom)` : '',
        description: template?.description || '',
        rank: template?.defaultRank || 50,
        scopeType: template?.recommendedScope || 'all_projects',
        specificProjectIds: [],
        permissions: initialPerms,
      },
      isDirty: false,
      selectedRoleId: null,
    });
  },

  startEditRole: (roleId) => {
    const { service, currentOrgId } = get();
    const role = service.getRole(roleId, currentOrgId);
    if (!role) return;

    const perms = service.getRolePermissions(roleId);
    const permSet = new Set<string>(perms.map((p) => p.permissionId));
    const members = service.listRoleMembers(currentOrgId, roleId);

    set({
      selectedRoleId: roleId,
      roleMembers: members,
      draftRole: {
        id: role.id,
        name: role.name,
        description: role.description,
        rank: role.rank,
        scopeType: role.scopeConfig.scopeType,
        specificProjectIds: [...role.scopeConfig.specificProjectIds],
        permissions: permSet,
      },
      isDirty: false,
    });
  },

  updateDraftName: (name) => {
    const current = get().draftRole;
    if (!current) return;
    set({
      draftRole: { ...current, name },
      isDirty: true,
    });
  },

  updateDraftDescription: (description) => {
    const current = get().draftRole;
    if (!current) return;
    set({
      draftRole: { ...current, description },
      isDirty: true,
    });
  },

  updateDraftScope: (scopeType, specificProjectIds) => {
    const current = get().draftRole;
    if (!current) return;
    set({
      draftRole: {
        ...current,
        scopeType,
        specificProjectIds: specificProjectIds ?? current.specificProjectIds,
      },
      isDirty: true,
    });
  },

  toggleDraftPermission: (permissionId) => {
    const current = get().draftRole;
    if (!current) return;
    const newPerms = new Set(current.permissions);
    if (newPerms.has(permissionId)) {
      newPerms.delete(permissionId);
    } else {
      newPerms.add(permissionId);
    }
    set({
      draftRole: { ...current, permissions: newPerms },
      isDirty: true,
    });
  },

  setDraftModulePermissions: (moduleId, enable) => {
    const current = get().draftRole;
    if (!current) return;
    const modulePerms = moduleRegistry.getPermissionsForModule(moduleId);
    const newPerms = new Set(current.permissions);

    for (const p of modulePerms) {
      if (enable) {
        newPerms.add(p.id);
      } else {
        newPerms.delete(p.id);
      }
    }

    set({
      draftRole: { ...current, permissions: newPerms },
      isDirty: true,
    });
  },

  discardDraft: () => {
    set({
      draftRole: null,
      isDirty: false,
      pendingImpact: null,
      impactModalOpen: false,
    });
  },

  openCloneModal: (sourceRole) => {
    set({
      cloneModalOpen: true,
      cloneSourceRole: sourceRole,
    });
  },

  closeCloneModal: () => {
    set({
      cloneModalOpen: false,
      cloneSourceRole: null,
    });
  },

  executeClone: (newRoleName, newDescription) => {
    const { service, currentOrgId, currentUserRank, cloneSourceRole } = get();
    if (!cloneSourceRole) {
      throw new Error('No source role selected for cloning.');
    }

    const cloned = service.cloneRole(currentUserRank, {
      orgId: currentOrgId,
      sourceRoleId: cloneSourceRole.id,
      newRoleName,
      newDescription,
    });

    const roles = service.listRoles(currentOrgId);
    const counts = { ...get().roleMemberCounts, [cloned.id]: 0 };
    const auditEvents = service.getRoleAuditEvents(currentOrgId);

    set({
      roles,
      roleMemberCounts: counts,
      auditEvents,
      cloneModalOpen: false,
      cloneSourceRole: null,
    });

    return cloned;
  },

  requestSaveDraft: () => {
    const { draftRole, service, currentOrgId } = get();
    if (!draftRole) return null;

    // If editing existing role with assigned members, calculate impact
    if (draftRole.id) {
      const impact = service.calculateChangeImpact(
        currentOrgId,
        draftRole.id,
        Array.from(draftRole.permissions),
        draftRole.scopeType
      );

      if (impact.affectedUserCount > 0) {
        set({
          pendingImpact: impact,
          impactModalOpen: true,
        });
        return impact;
      }
    }

    // Direct commit if new role or no users affected
    get().commitSaveDraft();
    return null;
  },

  commitSaveDraft: () => {
    const { draftRole, service, currentOrgId, currentUserRank } = get();
    if (!draftRole) {
      throw new Error('No draft role to commit.');
    }

    let resultRole: CustomRole;

    if (draftRole.id) {
      // Update existing
      resultRole = service.updateRole(currentUserRank, {
        orgId: currentOrgId,
        roleId: draftRole.id,
        name: draftRole.name,
        description: draftRole.description,
        scopeConfig: {
          scopeType: draftRole.scopeType,
          specificProjectIds: draftRole.specificProjectIds,
          teamIds: [],
        },
        permissions: Array.from(draftRole.permissions).map((p) => ({
          permissionId: p,
          scopeType: draftRole.scopeType,
        })),
      });
    } else {
      // Create new custom role
      resultRole = service.createRole(currentUserRank, {
        orgId: currentOrgId,
        name: draftRole.name,
        description: draftRole.description,
        rank: draftRole.rank,
        scopeConfig: {
          scopeType: draftRole.scopeType,
          specificProjectIds: draftRole.specificProjectIds,
          teamIds: [],
        },
        initialPermissions: Array.from(draftRole.permissions).map((p) => ({
          permissionId: p,
          scopeType: draftRole.scopeType,
        })),
      });
    }

    const roles = service.listRoles(currentOrgId);
    const counts = { ...get().roleMemberCounts };
    counts[resultRole.id] = service.getRoleMemberCount(currentOrgId, resultRole.id);
    const auditEvents = service.getRoleAuditEvents(currentOrgId);

    set({
      roles,
      roleMemberCounts: counts,
      auditEvents,
      draftRole: null,
      isDirty: false,
      impactModalOpen: false,
      pendingImpact: null,
      selectedRoleId: resultRole.id,
    });

    return resultRole;
  },

  closeImpactModal: () => {
    set({
      impactModalOpen: false,
      pendingImpact: null,
    });
  },

  deactivateRole: (roleId) => {
    const { service, currentOrgId, currentUserRank } = get();
    service.deactivateRole(currentUserRank, currentOrgId, roleId);
    const roles = service.listRoles(currentOrgId);
    const auditEvents = service.getRoleAuditEvents(currentOrgId);
    set({ roles, auditEvents });
  },

  reactivateRole: (roleId) => {
    const { service, currentOrgId, currentUserRank } = get();
    service.reactivateRole(currentUserRank, currentOrgId, roleId);
    const roles = service.listRoles(currentOrgId);
    const auditEvents = service.getRoleAuditEvents(currentOrgId);
    set({ roles, auditEvents });
  },

  assignMember: (userId, roleId, userName) => {
    const { service, currentOrgId, currentUserRank } = get();
    service.assignUserRole(currentUserRank, {
      orgId: currentOrgId,
      userId,
      userName,
      roleId,
    });

    const members = service.listRoleMembers(currentOrgId, roleId);
    const counts = { ...get().roleMemberCounts };
    counts[roleId] = members.length;
    const auditEvents = service.getRoleAuditEvents(currentOrgId);

    set({
      roleMembers: members,
      roleMemberCounts: counts,
      auditEvents,
    });
  },

  unassignMember: (userId, roleId) => {
    const { service, currentOrgId, currentUserRank } = get();
    service.unassignUserRole(currentUserRank, currentOrgId, userId, roleId);

    const members = service.listRoleMembers(currentOrgId, roleId);
    const counts = { ...get().roleMemberCounts };
    counts[roleId] = members.length;
    const auditEvents = service.getRoleAuditEvents(currentOrgId);

    set({
      roleMembers: members,
      roleMemberCounts: counts,
      auditEvents,
    });
  },

  setSimUserId: (userId) => set({ simUserId: userId }),
  setSimRoleId: (roleId) => set({ simRoleId: roleId }),
  setSimPermissionId: (permissionId) => set({ simPermissionId: permissionId }),
  setSimProjectId: (projectId) => set({ simProjectId: projectId }),

  runSimulation: (planId = 'pro') => {
    const {
      simulator,
      currentOrgId,
      simUserId,
      simRoleId,
      simPermissionId,
      simProjectId,
    } = get();

    const result = simulator.simulateAccess({
      orgId: currentOrgId,
      actorId: simUserId || undefined,
      roleId: !simUserId ? simRoleId : undefined,
      permissionId: simPermissionId,
      projectId: simProjectId || undefined,
      resourceAssignedUserIds: simUserId ? [simUserId] : [],
      tenantPlanId: planId,
      tenantStatus: 'active',
    });

    set({ simResult: result });
    return result;
  },
}));
