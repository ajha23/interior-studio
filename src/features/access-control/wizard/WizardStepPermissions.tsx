import { useState, type FC } from 'react';
import { Shield, Layers } from 'lucide-react';
import { PermissionMatrix } from '../PermissionMatrix';
import { ResourceAccessPanel } from '../ResourceAccessPanel';
import type { ResourceScopeType } from '@/domain/platform/authorization/types';

interface WizardStepPermissionsProps {
  grantedPermissions: Set<string>;
  scopeType: ResourceScopeType;
  specificProjectIds: string[];
  onTogglePermission: (permissionId: string) => void;
  onSetModulePermissions: (moduleId: string, enable: boolean) => void;
  onScopeChange: (scopeType: ResourceScopeType, specificProjectIds?: string[]) => void;
}

export const WizardStepPermissions: FC<WizardStepPermissionsProps> = ({
  grantedPermissions,
  scopeType,
  specificProjectIds,
  onTogglePermission,
  onSetModulePermissions,
  onScopeChange,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'scope'>('matrix');

  return (
    <div className="space-y-5" data-testid="wizard-step-permissions">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Step 2: Permissions & Resource Access</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure action-level capabilities and project-level resource boundaries.
          </p>
        </div>

        {/* Sub-tab switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveSubTab('matrix')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeSubTab === 'matrix'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="subtab-matrix-btn"
          >
            <Shield className="size-3.5" />
            <span>Permissions Matrix</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('scope')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeSubTab === 'scope'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="subtab-scope-btn"
          >
            <Layers className="size-3.5" />
            <span>Resource Access</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'matrix' ? (
        <PermissionMatrix
          grantedPermissions={grantedPermissions}
          onTogglePermission={onTogglePermission}
          onSetModulePermissions={onSetModulePermissions}
        />
      ) : (
        <ResourceAccessPanel
          scopeType={scopeType}
          specificProjectIds={specificProjectIds}
          onScopeChange={onScopeChange}
        />
      )}
    </div>
  );
};
