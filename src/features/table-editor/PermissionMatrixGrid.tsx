import { useEffect } from 'react';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import type {
  PermissionDefinition,
  ResourceScopeType,
  RolePermissionMapping,
} from '@/domain/platform/authorization/types';
import { Badge } from '@/components/ui/badge';

export interface PermissionMatrixGridProps {
  selectedPermissions: RolePermissionMapping[];
  onChange: (permissions: RolePermissionMapping[]) => void;
  disabled?: boolean;
}

export function PermissionMatrixGrid({
  selectedPermissions,
  onChange,
  disabled = false,
}: PermissionMatrixGridProps) {
  useEffect(() => {
    if (moduleRegistry.getRegisteredModules().length === 0) {
      bootstrapModuleRegistry();
    }
  }, []);

  const modules = moduleRegistry.getRegisteredModules();
  const allPermissions = moduleRegistry.getAllPermissions();

  const isChecked = (permId: string) =>
    selectedPermissions.some((p) => p.permissionId === permId);

  const getScope = (permId: string): ResourceScopeType => {
    const found = selectedPermissions.find((p) => p.permissionId === permId);
    return found?.scopeType || 'all_projects';
  };

  const handleToggle = (perm: PermissionDefinition) => {
    if (disabled) return;
    if (isChecked(perm.id)) {
      onChange(selectedPermissions.filter((p) => p.permissionId !== perm.id));
    } else {
      onChange([
        ...selectedPermissions,
        {
          roleId: '',
          permissionId: perm.id,
          scopeType: perm.supportedScopes[0] || 'all_projects',
        },
      ]);
    }
  };

  const handleScopeChange = (permId: string, scope: ResourceScopeType) => {
    if (disabled) return;
    onChange(
      selectedPermissions.map((p) =>
        p.permissionId === permId ? { ...p, scopeType: scope } : p
      )
    );
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-background" data-testid="permission-matrix-grid">
      <div className="flex items-center justify-between border-b pb-2">
        <h4 className="font-semibold text-sm">Module Permissions & Resource Scopes</h4>
        <span className="text-xs text-muted-foreground">
          {selectedPermissions.length} of {allPermissions.length} permissions assigned
        </span>
      </div>

      <div className="space-y-6">
        {modules.map((mod) => {
          const modPerms = moduleRegistry.getPermissionsForModule(mod.id);
          if (modPerms.length === 0) return null;

          return (
            <div key={mod.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-foreground">{mod.name}</span>
                <Badge className="text-[10px] px-1.5 py-0 font-mono">
                  {mod.id}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-2">
                {modPerms.map((perm) => {
                  const checked = isChecked(perm.id);
                  const currentScope = getScope(perm.id);

                  return (
                    <div
                      key={perm.id}
                      className={`flex flex-col gap-1.5 p-2 rounded-md border text-xs transition-colors ${
                        checked ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border/50'
                      }`}
                    >
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => handleToggle(perm)}
                          className="mt-0.5 rounded border-muted-foreground/30 text-primary focus:ring-primary h-3.5 w-3.5"
                          data-testid={`perm-checkbox-${perm.id}`}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{perm.title}</div>
                          <div className="text-muted-foreground text-[11px] leading-snug">
                            {perm.description}
                          </div>
                        </div>
                      </label>

                      {checked && perm.supportedScopes.length > 1 && (
                        <div className="flex items-center gap-2 pl-5 pt-1">
                          <span className="text-[10px] text-muted-foreground">Scope:</span>
                          <select
                            value={currentScope}
                            disabled={disabled}
                            onChange={(e) =>
                              handleScopeChange(perm.id, e.target.value as ResourceScopeType)
                            }
                            className="text-[11px] h-6 bg-background border border-input rounded px-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            data-testid={`perm-scope-${perm.id}`}
                          >
                            {perm.supportedScopes.map((scope) => (
                              <option key={scope} value={scope}>
                                {scope === 'all_projects' && 'All Projects'}
                                {scope === 'assigned_projects' && 'Assigned Projects Only'}
                                {scope === 'team_projects' && 'Team Projects'}
                                {scope === 'client_projects' && 'Client Projects'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
