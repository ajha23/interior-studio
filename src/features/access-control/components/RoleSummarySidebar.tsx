import type { FC } from 'react';
import { Shield, Lock, Layers, Users, AlertCircle, Save, Undo2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ResourceScopeType } from '@/domain/platform/authorization/types';

interface RoleSummarySidebarProps {
  grantedCount: number;
  totalAvailable: number;
  planRestrictedCount: number;
  resourceScope: ResourceScopeType;
  memberCount: number;
  isDirty: boolean;
  isSystemRole?: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export const RoleSummarySidebar: FC<RoleSummarySidebarProps> = ({
  grantedCount,
  totalAvailable,
  planRestrictedCount,
  resourceScope,
  memberCount,
  isDirty,
  isSystemRole = false,
  onSave,
  onCancel,
}) => {
  const formatScope = (scope: ResourceScopeType) => {
    switch (scope) {
      case 'all_projects':
        return 'All Organization Projects';
      case 'assigned_projects':
        return 'Assigned Projects Only';
      case 'team_projects':
        return 'Team Projects Only';
      case 'specific_projects':
        return 'Specific Projects';
      default:
        return 'All Projects';
    }
  };

  return (
    <Card className="p-5 space-y-5 bg-card border shadow-xs" data-testid="role-summary-sidebar">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Access Summary
          </h3>
          {isDirty && (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] gap-1" data-testid="unsaved-changes-badge">
              <AlertCircle className="size-3" />
              Unsaved Changes
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Real-time effective capability summary for this role.
        </p>
      </div>

      <div className="space-y-3 pt-1">
        {/* Permissions Granted */}
        <div className="flex items-center justify-between p-3 rounded-md bg-muted/30">
          <div className="flex items-center gap-2.5">
            <Shield className="size-4 text-primary" />
            <span className="text-xs font-medium text-foreground">Permissions Granted</span>
          </div>
          <span className="text-sm font-bold text-foreground" data-testid="summary-granted-count">
            {grantedCount} <span className="text-xs font-normal text-muted-foreground">/ {totalAvailable}</span>
          </span>
        </div>

        {/* Plan Restricted */}
        <div className="flex items-center justify-between p-3 rounded-md bg-muted/30">
          <div className="flex items-center gap-2.5">
            <Lock className="size-4 text-amber-500" />
            <span className="text-xs font-medium text-foreground">Plan Restricted</span>
          </div>
          <span className="text-sm font-bold text-amber-600" data-testid="summary-restricted-count">
            {planRestrictedCount}
          </span>
        </div>

        {/* Resource Scope */}
        <div className="p-3 rounded-md bg-muted/30 space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Layers className="size-3.5" />
            <span>Resource Scope</span>
          </div>
          <p className="text-xs font-semibold text-foreground" data-testid="summary-resource-scope">
            {formatScope(resourceScope)}
          </p>
        </div>

        {/* Assigned Members */}
        <div className="flex items-center justify-between p-3 rounded-md bg-muted/30">
          <div className="flex items-center gap-2.5">
            <Users className="size-4 text-emerald-500" />
            <span className="text-xs font-medium text-foreground">Assigned Members</span>
          </div>
          <span className="text-sm font-bold text-foreground" data-testid="summary-member-count">
            {memberCount}
          </span>
        </div>
      </div>

      {/* Explanatory notes */}
      {planRestrictedCount > 0 && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="size-3.5 shrink-0" />
            Subscription Warning
          </p>
          <p className="text-[11px] text-amber-700/90 leading-relaxed">
            This role includes {planRestrictedCount} capability that requires a Pro plan. The grant will remain saved as dormant until your plan is upgraded.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {!isSystemRole && (
        <div className="pt-2 space-y-2">
          <Button
            onClick={onSave}
            disabled={!isDirty}
            className="w-full gap-2"
            size="sm"
            data-testid="save-role-btn"
          >
            <Save className="size-4" />
            Save Changes
          </Button>

          <Button
            variant="outline"
            onClick={onCancel}
            disabled={!isDirty}
            className="w-full gap-2 text-xs"
            size="sm"
            data-testid="cancel-role-btn"
          >
            <Undo2 className="size-3.5" />
            Discard Changes
          </Button>
        </div>
      )}
    </Card>
  );
};
