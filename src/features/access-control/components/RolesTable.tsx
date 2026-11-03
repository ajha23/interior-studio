import type { FC } from 'react';
import { Edit2, Copy, Power, Shield, ShieldAlert, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CustomRole } from '@/domain/platform/authorization/types';

interface RolesTableProps {
  roles: CustomRole[];
  memberCounts: Record<string, number>;
  permissionCounts: Record<string, number>;
  onEditRole: (roleId: string) => void;
  onCloneRole: (role: CustomRole) => void;
  onToggleDeactivate: (roleId: string, currentStatus: 'active' | 'deactivated') => void;
}

export const RolesTable: FC<RolesTableProps> = ({
  roles,
  memberCounts,
  permissionCounts,
  onEditRole,
  onCloneRole,
  onToggleDeactivate,
}) => {
  const formatScopeLabel = (scope: string) => {
    switch (scope) {
      case 'all_projects':
        return 'All Projects';
      case 'assigned_projects':
        return 'Assigned Only';
      case 'team_projects':
        return 'Team Projects';
      case 'specific_projects':
        return 'Specific Projects';
      default:
        return 'All Projects';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (roles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center" data-testid="roles-table-empty">
        <Users className="mx-auto size-8 text-muted-foreground opacity-50" />
        <h4 className="mt-2 text-sm font-semibold text-foreground">No roles match your search</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Try adjusting your search query or type filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card" data-testid="roles-table">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b">
          <tr>
            <th className="py-3 px-4">Role</th>
            <th className="py-3 px-4">Type</th>
            <th className="py-3 px-4 text-center">Members</th>
            <th className="py-3 px-4 text-center">Permissions</th>
            <th className="py-3 px-4">Scope</th>
            <th className="py-3 px-4">Last Updated</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y text-foreground">
          {roles.map((role) => {
            const memberCount = memberCounts[role.id] ?? 0;
            const permCount = permissionCounts[role.id] ?? 0;
            const isDeactivated = role.status === 'deactivated';

            return (
              <tr
                key={role.id}
                className={`hover:bg-muted/30 transition-colors ${
                  isDeactivated ? 'opacity-60 bg-muted/10' : ''
                }`}
                data-testid={`role-row-${role.id}`}
              >
                {/* Role Name & Description */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground hover:underline cursor-pointer" onClick={() => onEditRole(role.id)}>
                      {role.name}
                    </span>
                    {isDeactivated && (
                      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
                        Deactivated
                      </Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 max-w-sm">
                      {role.description}
                    </p>
                  )}
                </td>

                {/* Type */}
                <td className="py-3 px-4">
                  {role.isSystemRole ? (
                    <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1">
                      <Shield className="size-3" />
                      System
                    </Badge>
                  ) : (
                    <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 gap-1">
                      <ShieldAlert className="size-3" />
                      Custom
                    </Badge>
                  )}
                </td>

                {/* Assigned Members */}
                <td className="py-3 px-4 text-center">
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-foreground">
                    {memberCount}
                  </span>
                </td>

                {/* Permissions Granted */}
                <td className="py-3 px-4 text-center font-medium">
                  {permCount}
                </td>

                {/* Resource Scope */}
                <td className="py-3 px-4">
                  <span className="text-xs text-muted-foreground">
                    {formatScopeLabel(role.scopeConfig.scopeType)}
                  </span>
                </td>

                {/* Last Updated */}
                <td className="py-3 px-4 text-xs text-muted-foreground">
                  {formatDate(role.updatedAt)}
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={role.isSystemRole ? 'View System Role' : 'Edit Custom Role'}
                      onClick={() => onEditRole(role.id)}
                      data-testid={`edit-role-${role.id}`}
                    >
                      <Edit2 className="size-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Clone into Custom Role"
                      onClick={() => onCloneRole(role)}
                      data-testid={`clone-role-${role.id}`}
                    >
                      <Copy className="size-4" />
                    </Button>

                    {!role.isSystemRole && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={isDeactivated ? 'Reactivate Role' : 'Deactivate Role'}
                        onClick={() => onToggleDeactivate(role.id, role.status)}
                        className={isDeactivated ? 'text-amber-500' : 'text-muted-foreground hover:text-destructive'}
                        data-testid={`deactivate-role-${role.id}`}
                      >
                        <Power className="size-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
