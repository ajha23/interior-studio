import { useState, useMemo, type FC } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ModuleMatrixRow } from './components/ModuleMatrixRow';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';
import { useSubscriptionStore } from '@/state/subscriptionStore';

interface PermissionMatrixProps {
  grantedPermissions: Set<string>;
  onTogglePermission: (permissionId: string) => void;
  onSetModulePermissions: (moduleId: string, enable: boolean) => void;
  isSystemRole?: boolean;
}

export const PermissionMatrix: FC<PermissionMatrixProps> = ({
  grantedPermissions,
  onTogglePermission,
  onSetModulePermissions,
  isSystemRole = false,
}) => {
  const [matrixSearch, setMatrixSearch] = useState('');
  const [expandAll, setExpandAll] = useState(true);

  const isEntitled = useSubscriptionStore((s) => s.isEntitled);

  // Retrieve modules and permissions
  const modules = useMemo(() => {
    return moduleRegistry.getRegisteredModules();
  }, []);

  const allPermissions = useMemo(() => {
    return moduleRegistry.getAllPermissions();
  }, []);

  // Filter modules and capabilities based on search
  const filteredModulesData = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();

    return modules
      .map((mod) => {
        const modPerms = allPermissions.filter((p) => p.moduleId === mod.id);

        if (!q) {
          return { module: mod, permissions: modPerms, matchesSearch: true };
        }

        const matchModule = mod.name.toLowerCase().includes(q) || mod.description.toLowerCase().includes(q);
        const filteredPerms = modPerms.filter(
          (p) =>
            p.id.toLowerCase().includes(q) ||
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.action.toLowerCase().includes(q)
        );

        if (matchModule) {
          return { module: mod, permissions: modPerms, matchesSearch: true };
        }

        if (filteredPerms.length > 0) {
          return { module: mod, permissions: filteredPerms, matchesSearch: true };
        }

        return null;
      })
      .filter((item): item is { module: typeof modules[0]; permissions: typeof allPermissions; matchesSearch: boolean } => item !== null);
  }, [modules, allPermissions, matrixSearch]);

  return (
    <div className="space-y-4" data-testid="permission-matrix">
      {/* Search and Expand/Collapse Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={matrixSearch}
            onChange={(e) => setMatrixSearch(e.target.value)}
            placeholder="Search capabilities by name, description, or action..."
            className="pl-9 h-9 text-sm"
            data-testid="matrix-search-input"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpandAll(!expandAll)}
            className="text-xs gap-1.5"
            data-testid="toggle-expand-all-btn"
          >
            {expandAll ? (
              <>
                <ChevronUp className="size-3.5" />
                <span>Collapse All</span>
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                <span>Expand All</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Module Rows */}
      <div className="space-y-3">
        {filteredModulesData.map(({ module, permissions }) => (
          <ModuleMatrixRow
            key={module.id}
            module={module}
            permissions={permissions}
            grantedPermissions={grantedPermissions}
            onTogglePermission={onTogglePermission}
            onSetModulePermissions={onSetModulePermissions}
            isEntitled={isEntitled}
            isSystemRole={isSystemRole}
            defaultExpanded={expandAll || Boolean(matrixSearch.trim())}
          />
        ))}

        {filteredModulesData.length === 0 && (
          <div className="p-8 text-center border rounded-lg bg-card text-muted-foreground">
            No permissions found matching "{matrixSearch}".
          </div>
        )}
      </div>
    </div>
  );
};
