import { useMemo, type FC } from 'react';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { useSubscriptionStore } from '@/state/subscriptionStore';
import { RoleMetricsSummary } from './components/RoleMetricsSummary';
import { RoleFilters } from './components/RoleFilters';
import { RolesTable } from './components/RolesTable';
import { CloneRoleModal } from './components/CloneRoleModal';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';
import type { CanonicalKey } from '@/domain/platform/saas/types';

interface RolesDashboardProps {
  onNavigateToEditor?: (roleId?: string) => void;
  onNavigateToWizard?: () => void;
}

export const RolesDashboard: FC<RolesDashboardProps> = ({
  onNavigateToEditor,
  onNavigateToWizard,
}) => {
  const {
    roles,
    service,
    roleMemberCounts,
    searchQuery,
    typeFilter,
    scopeFilter,
    cloneModalOpen,
    cloneSourceRole,
    setSearchQuery,
    setTypeFilter,
    setScopeFilter,
    startEditRole,
    startCreateRole,
    openCloneModal,
    closeCloneModal,
    executeClone,
    deactivateRole,
    reactivateRole,
  } = useRoleManagementStore();

  const isEntitled = useSubscriptionStore((s) => s.isEntitled);

  // Filtered roles
  const filteredRoles = useMemo(() => {
    return roles.filter((role) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = role.name.toLowerCase().includes(q);
        const matchDesc = role.description.toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }

      // Type
      if (typeFilter === 'system' && !role.isSystemRole) return false;
      if (typeFilter === 'custom' && role.isSystemRole) return false;

      // Scope
      if (scopeFilter !== 'all' && role.scopeConfig.scopeType !== scopeFilter) {
        return false;
      }

      return true;
    });
  }, [roles, searchQuery, typeFilter, scopeFilter]);

  // Permission counts & plan-restricted check per role
  const { permissionCounts, planRestrictedRoleCount, totalAssignedUsers } = useMemo(() => {
    const counts: Record<string, number> = {};
    let restrictedRoles = 0;
    let assignedUsers = 0;
    const allPerms = moduleRegistry.getAllPermissions();
    const permMap = new Map(allPerms.map((p) => [p.id, p]));

    for (const role of roles) {
      const perms = service.getRolePermissions(role.id);
      counts[role.id] = perms.length;

      // Count assigned users
      const memberCount = roleMemberCounts[role.id] ?? 0;
      assignedUsers += memberCount;

      // Check plan restrictions
      let hasRestriction = false;
      for (const p of perms) {
        const def = permMap.get(p.permissionId);
        if (def?.entitlementKey) {
          const entitled = isEntitled(def.entitlementKey as CanonicalKey);
          if (!entitled) {
            hasRestriction = true;
            break;
          }
        }
      }
      if (hasRestriction) {
        restrictedRoles++;
      }
    }

    return {
      permissionCounts: counts,
      planRestrictedRoleCount: restrictedRoles,
      totalAssignedUsers: assignedUsers,
    };
  }, [roles, service, roleMemberCounts, isEntitled]);

  const handleEditRole = (roleId: string) => {
    startEditRole(roleId);
    onNavigateToEditor?.(roleId);
  };

  const handleCreateRoleClick = () => {
    startCreateRole();
    if (onNavigateToWizard) {
      onNavigateToWizard();
    } else {
      onNavigateToEditor?.();
    }
  };

  const handleToggleDeactivate = (roleId: string, currentStatus: 'active' | 'deactivated') => {
    if (currentStatus === 'active') {
      deactivateRole(roleId);
    } else {
      reactivateRole(roleId);
    }
  };

  const customRolesCount = roles.filter((r) => !r.isSystemRole).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6" data-testid="roles-dashboard">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage what members of your organization can access across projects, 2D/3D design tools, and commercial features.
        </p>
      </div>

      {/* Metrics Cards */}
      <RoleMetricsSummary
        totalRoles={roles.length}
        customRoles={customRolesCount}
        assignedUsers={totalAssignedUsers}
        planRestrictedRoles={planRestrictedRoleCount}
      />

      {/* Filters and Actions */}
      <RoleFilters
        searchQuery={searchQuery}
        typeFilter={typeFilter}
        scopeFilter={scopeFilter}
        onSearchChange={setSearchQuery}
        onTypeFilterChange={setTypeFilter}
        onScopeFilterChange={setScopeFilter}
        onCreateRoleClick={handleCreateRoleClick}
      />

      {/* Roles Data Table */}
      <RolesTable
        roles={filteredRoles}
        memberCounts={roleMemberCounts}
        permissionCounts={permissionCounts}
        onEditRole={handleEditRole}
        onCloneRole={openCloneModal}
        onToggleDeactivate={handleToggleDeactivate}
      />

      {/* Clone Role Modal */}
      <CloneRoleModal
        key={cloneSourceRole?.id || 'none'}
        isOpen={cloneModalOpen}
        sourceRole={cloneSourceRole}
        onClose={closeCloneModal}
        onClone={(newName, newDesc) => {
          const cloned = executeClone(newName, newDesc);
          startEditRole(cloned.id);
          onNavigateToEditor?.(cloned.id);
        }}
      />
    </div>
  );
};
