import { useState, useMemo, type FC } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TriStateCheckbox, type CheckboxState } from './TriStateCheckbox';
import { PlanRestrictedBadge } from './PlanRestrictedBadge';
import type { PermissionDefinition, ModuleDefinition } from '@/domain/platform/authorization/types';
import type { CanonicalKey } from '@/domain/platform/saas/types';

interface ModuleMatrixRowProps {
  module: ModuleDefinition;
  permissions: PermissionDefinition[];
  grantedPermissions: Set<string>;
  onTogglePermission: (permissionId: string) => void;
  onSetModulePermissions: (moduleId: string, enable: boolean) => void;
  isEntitled: (featureKey: CanonicalKey) => boolean;
  isSystemRole?: boolean;
  defaultExpanded?: boolean;
}

export const ModuleMatrixRow: FC<ModuleMatrixRowProps> = ({
  module,
  permissions,
  grantedPermissions,
  onTogglePermission,
  onSetModulePermissions,
  isEntitled,
  isSystemRole = false,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Calculate tri-state state for module header
  const { headerState, grantedCount } = useMemo(() => {
    let granted = 0;
    for (const p of permissions) {
      if (grantedPermissions.has(p.id)) {
        granted++;
      }
    }

    let state: CheckboxState = 'unchecked';
    if (granted === permissions.length && permissions.length > 0) {
      state = 'checked';
    } else if (granted > 0) {
      state = 'indeterminate';
    }

    return { headerState: state, grantedCount: granted };
  }, [permissions, grantedPermissions]);

  const handleHeaderCheckboxChange = (nextState: CheckboxState) => {
    if (isSystemRole) return;
    onSetModulePermissions(module.id, nextState === 'checked');
  };

  return (
    <div
      className="border rounded-lg bg-card overflow-hidden shadow-xs transition-colors"
      data-testid={`module-matrix-row-${module.id}`}
    >
      {/* Module Header */}
      <div className="flex items-center justify-between p-3.5 bg-muted/20 hover:bg-muted/40 transition-colors border-b">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
          >
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>

          <TriStateCheckbox
            state={headerState}
            onChange={handleHeaderCheckboxChange}
            disabled={isSystemRole}
            data-testid={`module-checkbox-${module.id}`}
          />

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">{module.name}</span>
              <Badge className="bg-muted text-muted-foreground text-[10px]">
                {grantedCount} of {permissions.length} granted
              </Badge>
            </div>
            {module.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{module.description}</p>
            )}
          </div>
        </div>

        {!isSystemRole && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onSetModulePermissions(module.id, true)}
              className="text-xs text-muted-foreground hover:text-foreground"
              data-testid={`select-all-${module.id}`}
            >
              Select All
            </Button>
            <span className="text-muted-foreground/40 text-xs">|</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onSetModulePermissions(module.id, false)}
              className="text-xs text-muted-foreground hover:text-foreground"
              data-testid={`clear-all-${module.id}`}
            >
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Capabilities List */}
      {isExpanded && (
        <div className="p-0 divide-y">
          {permissions.map((perm) => {
            const isGranted = grantedPermissions.has(perm.id);
            const entitled = perm.entitlementKey
              ? isEntitled(perm.entitlementKey as CanonicalKey)
              : true;

            return (
              <div
                key={perm.id}
                className="flex items-center justify-between p-3 hover:bg-muted/10 transition-colors text-sm"
                data-testid={`perm-row-${perm.id}`}
              >
                {/* Left: Info */}
                <div className="flex items-start gap-3 max-w-xl">
                  <input
                    type="checkbox"
                    checked={isGranted}
                    disabled={isSystemRole}
                    onChange={() => onTogglePermission(perm.id)}
                    className="size-4 mt-0.5 rounded border-input text-primary focus:ring-primary focus:ring-1 focus:ring-offset-0"
                    data-testid={`perm-checkbox-${perm.id}`}
                  />

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{perm.title}</span>

                      {perm.isHighRisk && (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] gap-1">
                          <AlertTriangle className="size-3" />
                          High Risk
                        </Badge>
                      )}

                      {!entitled && (
                        <PlanRestrictedBadge requiredPlanTier="Pro Studio" />
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5">
                      {perm.description}
                    </p>
                  </div>
                </div>

                {/* Right: Action badge */}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {perm.action}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
