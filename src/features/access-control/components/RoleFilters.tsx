import type { FC } from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ResourceScopeType } from '@/domain/platform/authorization/types';

interface RoleFiltersProps {
  searchQuery: string;
  typeFilter: 'all' | 'system' | 'custom';
  scopeFilter: 'all' | ResourceScopeType;
  onSearchChange: (query: string) => void;
  onTypeFilterChange: (type: 'all' | 'system' | 'custom') => void;
  onScopeFilterChange: (scope: 'all' | ResourceScopeType) => void;
  onCreateRoleClick: () => void;
}

export const RoleFilters: FC<RoleFiltersProps> = ({
  searchQuery,
  typeFilter,
  scopeFilter,
  onSearchChange,
  onTypeFilterChange,
  onScopeFilterChange,
  onCreateRoleClick,
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3" data-testid="role-filters">
      <div className="flex flex-1 items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search roles by name or description..."
            className="pl-9 h-9 text-sm"
            data-testid="role-search-input"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value as 'all' | 'system' | 'custom')}
          className="h-9 px-3 rounded-md border border-input bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          data-testid="role-type-filter"
          aria-label="Filter roles by type"
        >
          <option value="all">All Types</option>
          <option value="system">System Roles</option>
          <option value="custom">Custom Roles</option>
        </select>

        <select
          value={scopeFilter}
          onChange={(e) => onScopeFilterChange(e.target.value as 'all' | ResourceScopeType)}
          className="h-9 px-3 rounded-md border border-input bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary hidden md:block"
          data-testid="role-scope-filter"
          aria-label="Filter roles by scope"
        >
          <option value="all">All Scopes</option>
          <option value="all_projects">All Organization Projects</option>
          <option value="assigned_projects">Assigned Projects Only</option>
          <option value="team_projects">Team Projects Only</option>
          <option value="specific_projects">Specific Projects</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={onCreateRoleClick}
          className="gap-2"
          data-testid="create-role-btn"
        >
          <Plus className="size-4" />
          <span>Create Role</span>
        </Button>
      </div>
    </div>
  );
};
