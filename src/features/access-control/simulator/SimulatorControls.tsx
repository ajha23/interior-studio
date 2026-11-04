import { useMemo, type FC } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';
import type { CustomRole } from '@/domain/platform/authorization/types';

interface SimulatorControlsProps {
  roles: CustomRole[];
  selectedRoleId: string;
  selectedUserId: string;
  selectedPermissionId: string;
  selectedProjectId: string;
  selectedPlanId: string;
  onRoleChange: (roleId: string) => void;
  onUserChange: (userId: string) => void;
  onPermissionChange: (permId: string) => void;
  onProjectChange: (projId: string) => void;
  onPlanChange: (planId: string) => void;
  onRunSimulation: () => void;
  onReset: () => void;
}

export const SimulatorControls: FC<SimulatorControlsProps> = ({
  roles,
  selectedRoleId,
  selectedUserId,
  selectedPermissionId,
  selectedProjectId,
  selectedPlanId,
  onRoleChange,
  onUserChange,
  onPermissionChange,
  onProjectChange,
  onPlanChange,
  onRunSimulation,
  onReset,
}) => {
  const permissions = useMemo(() => {
    return moduleRegistry.getAllPermissions();
  }, []);

  return (
    <div className="p-4 rounded-lg border bg-card space-y-4 shadow-xs" data-testid="simulator-controls">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Simulation Parameters</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select actor, role, target capability, and project to inspect the policy evaluation pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {/* Role Selector */}
        <div>
          <label className="block font-medium text-foreground mb-1">Target Role</label>
          <select
            value={selectedRoleId}
            onChange={(e) => onRoleChange(e.target.value)}
            className="w-full h-8 px-2.5 rounded-md border border-input bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            data-testid="sim-role-select"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.isSystemRole ? 'System' : 'Custom'})
              </option>
            ))}
          </select>
        </div>

        {/* User Input */}
        <div>
          <label className="block font-medium text-foreground mb-1">Target User (Optional)</label>
          <input
            type="text"
            value={selectedUserId}
            onChange={(e) => onUserChange(e.target.value)}
            placeholder="e.g. user_vikram"
            className="w-full h-8 px-2.5 rounded-md border border-input bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            data-testid="sim-user-input"
          />
        </div>

        {/* Capability Selector */}
        <div>
          <label className="block font-medium text-foreground mb-1">Target Permission</label>
          <select
            value={selectedPermissionId}
            onChange={(e) => onPermissionChange(e.target.value)}
            className="w-full h-8 px-2.5 rounded-md border border-input bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            data-testid="sim-permission-select"
          >
            {permissions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.id})
              </option>
            ))}
          </select>
        </div>

        {/* Project Target */}
        <div>
          <label className="block font-medium text-foreground mb-1">Target Project</label>
          <select
            value={selectedProjectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="w-full h-8 px-2.5 rounded-md border border-input bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            data-testid="sim-project-select"
          >
            <option value="">Global / No Specific Project</option>
            <option value="proj_101">Skyline Penthouse 4B (proj_101)</option>
            <option value="proj_102">Alipore Villa (proj_102)</option>
            <option value="proj_103">Jubilee Hills Duplex (proj_103)</option>
          </select>
        </div>

        {/* Plan Tier Simulator */}
        <div>
          <label className="block font-medium text-foreground mb-1">Tenant Plan Tier</label>
          <select
            value={selectedPlanId}
            onChange={(e) => onPlanChange(e.target.value)}
            className="w-full h-8 px-2.5 rounded-md border border-input bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-xs"
            data-testid="sim-plan-select"
          >
            <option value="starter">Starter Studio (₹4,999/mo)</option>
            <option value="pro">Pro Studio (₹12,999/mo)</option>
            <option value="enterprise">Enterprise Studio (Custom)</option>
            <option value="trial">14-Day Free Trial</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 border-t">
        <Button variant="ghost" size="xs" onClick={onReset} className="gap-1 text-xs">
          <RotateCcw className="size-3" />
          <span>Reset</span>
        </Button>
        <Button size="xs" onClick={onRunSimulation} className="gap-1 text-xs" data-testid="sim-run-btn">
          <Play className="size-3 fill-current" />
          <span>Run Simulation</span>
        </Button>
      </div>
    </div>
  );
};
