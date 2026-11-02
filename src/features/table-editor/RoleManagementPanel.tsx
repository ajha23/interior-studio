import { useState } from 'react';
import {
  Shield,
  Plus,
  Copy,
  Trash2,
  Lock,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { CustomRole, RolePermissionMapping } from '@/domain/platform/authorization/types';
import { AdminRoleService } from '@/domain/platform/authorization/adminRoleService';
import { PermissionMatrixGrid } from './PermissionMatrixGrid';

export interface RoleManagementPanelProps {
  adminService: AdminRoleService;
  orgId: string;
  actorRank?: number;
  onRoleChanged?: () => void;
}

export function RoleManagementPanel({
  adminService,
  orgId,
  actorRank = 100,
  onRoleChanged,
}: RoleManagementPanelProps) {
  const [roles, setRoles] = useState<CustomRole[]>(() => adminService.listRoles(orgId));
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || 'owner');
  const [isCreating, setIsCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleRank, setNewRoleRank] = useState(50);
  const [activePermissions, setActivePermissions] = useState<RolePermissionMapping[]>(() =>
    adminService.getRolePermissions(selectedRoleId)
  );
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  const refreshRoles = (selectId?: string) => {
    const updated = adminService.listRoles(orgId);
    setRoles(updated);
    const targetId = selectId || selectedRoleId;
    setSelectedRoleId(targetId);
    setActivePermissions(adminService.getRolePermissions(targetId));
    onRoleChanged?.();
  };

  const handleSelectRole = (role: CustomRole) => {
    setIsCreating(false);
    setSelectedRoleId(role.id);
    setActivePermissions(adminService.getRolePermissions(role.id));
    setMessage(null);
  };

  const handleCreateRole = () => {
    if (!newRoleName.trim()) {
      setMessage({ text: 'Role name cannot be empty', type: 'error' });
      return;
    }
    try {
      const created = adminService.createRole(actorRank, {
        orgId,
        name: newRoleName,
        description: newRoleDesc,
        rank: newRoleRank,
        initialPermissions: activePermissions,
      });
      setMessage({ text: `Custom role "${created.name}" created successfully`, type: 'success' });
      setIsCreating(false);
      setNewRoleName('');
      setNewRoleDesc('');
      refreshRoles(created.id);
    } catch (err: unknown) {
      setMessage({ text: (err as Error).message, type: 'error' });
    }
  };

  const handleCloneRole = () => {
    if (!selectedRole) return;
    try {
      const cloned = adminService.cloneRole(actorRank, {
        orgId,
        sourceRoleId: selectedRole.id,
        newRoleName: `${selectedRole.name} (Custom)`,
        newDescription: `Cloned from ${selectedRole.name}`,
      });
      setMessage({ text: `Role cloned into "${cloned.name}"`, type: 'success' });
      refreshRoles(cloned.id);
    } catch (err: unknown) {
      setMessage({ text: (err as Error).message, type: 'error' });
    }
  };

  const handleSavePermissions = () => {
    if (!selectedRole || selectedRole.isSystemRole) return;
    try {
      adminService.updateRolePermissions(actorRank, {
        orgId,
        roleId: selectedRole.id,
        permissions: activePermissions,
      });
      setMessage({ text: 'Permissions and resource scopes updated successfully', type: 'success' });
      refreshRoles();
    } catch (err: unknown) {
      setMessage({ text: (err as Error).message, type: 'error' });
    }
  };

  const handleDeleteRole = () => {
    if (!selectedRole || selectedRole.isSystemRole) return;
    try {
      adminService.deleteRole(actorRank, orgId, selectedRole.id);
      setMessage({ text: `Role "${selectedRole.name}" deleted`, type: 'success' });
      refreshRoles('viewer');
    } catch (err: unknown) {
      setMessage({ text: (err as Error).message, type: 'error' });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="role-management-panel">
      {/* Roles sidebar */}
      <div className="border rounded-lg p-4 bg-muted/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Studio Roles
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsCreating(true);
              setNewRoleName('');
              setNewRoleDesc('');
              setNewRoleRank(50);
              setActivePermissions([]);
              setMessage(null);
            }}
            className="text-xs h-7 gap-1"
            data-testid="create-role-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            New Role
          </Button>
        </div>

        <div className="space-y-1.5">
          {roles.map((role) => {
            const isSelected = !isCreating && role.id === selectedRoleId;
            return (
              <button
                key={role.id}
                onClick={() => handleSelectRole(role)}
                className={`w-full text-left p-2.5 rounded-md border text-xs transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-background hover:bg-muted border-border/60 text-foreground'
                }`}
                data-testid={`role-item-${role.id}`}
              >
                <div>
                  <div className="font-medium flex items-center gap-1.5">
                    {role.name}
                    {role.isSystemRole && (
                      <Lock className={`w-3 h-3 ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} />
                    )}
                  </div>
                  <div className={`text-[10px] ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    Rank {role.rank} • {role.isSystemRole ? 'Template' : 'Custom'}
                  </div>
                </div>

                <Badge
                  className={`text-[10px] px-1.5 py-0 ${isSelected ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}
                >
                  {role.status}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      {/* Role configuration and permissions */}
      <div className="md:col-span-2 space-y-4">
        {message && (
          <div
            className={`p-3 rounded-md text-xs flex items-center gap-2 border ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200'
            }`}
          >
            {message.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {isCreating ? (
          <div className="border rounded-lg p-4 bg-background space-y-4">
            <h3 className="font-semibold text-sm">Create Custom Studio Role</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Role Name</label>
                <Input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Lead Interior Stylist"
                  className="text-xs h-8 mt-1"
                  data-testid="new-role-name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Role Rank (1-99)</label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={newRoleRank}
                  onChange={(e) => setNewRoleRank(parseInt(e.target.value, 10) || 50)}
                  className="text-xs h-8 mt-1"
                  data-testid="new-role-rank"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Description</label>
              <Input
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                placeholder="Scope of work and responsibilities..."
                className="text-xs h-8 mt-1"
                data-testid="new-role-desc"
              />
            </div>

            <PermissionMatrixGrid
              selectedPermissions={activePermissions}
              onChange={setActivePermissions}
            />

            <div className="flex items-center gap-2 pt-2 border-t">
              <Button size="sm" onClick={handleCreateRole} className="text-xs h-8" data-testid="save-new-role-btn">
                Create Role
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCreating(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : selectedRole ? (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-background flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base">{selectedRole.name}</h3>
                  <Badge className="text-xs">
                    {selectedRole.isSystemRole ? 'Built-in Template' : 'Tenant Custom'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedRole.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCloneRole}
                  className="text-xs h-8 gap-1.5"
                  data-testid="clone-role-btn"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Clone Role
                </Button>
                {!selectedRole.isSystemRole && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteRole}
                    className="text-xs h-8 gap-1.5"
                    data-testid="delete-role-btn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {selectedRole.isSystemRole && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 rounded-md text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Default system roles are immutable templates. To adjust permissions, click <strong>Clone Role</strong> to create a customized version.
                </span>
              </div>
            )}

            <PermissionMatrixGrid
              selectedPermissions={activePermissions}
              onChange={setActivePermissions}
              disabled={selectedRole.isSystemRole}
            />

            {!selectedRole.isSystemRole && (
              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={handleSavePermissions} className="text-xs h-8" data-testid="save-perms-btn">
                  Save Role Permissions
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
