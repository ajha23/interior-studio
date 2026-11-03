import type { FC } from 'react';
import { Globe2, Users2, UserCheck2, ListFilter } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SpecificProjectPicker } from './components/SpecificProjectPicker';
import type { ResourceScopeType } from '@/domain/platform/authorization/types';

interface ResourceAccessPanelProps {
  scopeType: ResourceScopeType;
  specificProjectIds: string[];
  onScopeChange: (scopeType: ResourceScopeType, specificProjectIds?: string[]) => void;
  disabled?: boolean;
}

const SCOPE_OPTIONS: Array<{
  id: ResourceScopeType;
  title: string;
  description: string;
  icon: typeof Globe2;
}> = [
  {
    id: 'all_projects',
    title: 'All organization projects',
    description: 'Members of this role can access every project belonging to this organization.',
    icon: Globe2,
  },
  {
    id: 'team_projects',
    title: 'Team projects only',
    description: "Members of this role can only access projects assigned to the member's team.",
    icon: Users2,
  },
  {
    id: 'assigned_projects',
    title: 'Assigned projects only',
    description: 'Members of this role can access only projects explicitly assigned to them.',
    icon: UserCheck2,
  },
  {
    id: 'specific_projects',
    title: 'Specific projects',
    description: 'Members of this role can access a controlled, explicit list of designated projects.',
    icon: ListFilter,
  },
];

export const ResourceAccessPanel: FC<ResourceAccessPanelProps> = ({
  scopeType,
  specificProjectIds,
  onScopeChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-6" data-testid="resource-access-panel">
      <div>
        <h3 className="text-base font-semibold text-foreground">Resource Access Configuration</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Define which project boundaries and resources members of this role are permitted to view or modify.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SCOPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = scopeType === option.id;

          return (
            <Card
              key={option.id}
              onClick={() => !disabled && onScopeChange(option.id)}
              className={`p-4 cursor-pointer transition-all border-2 ${
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-muted-foreground/30 hover:bg-muted/10'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              data-testid={`scope-option-${option.id}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-md mt-0.5 ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="size-4" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground">{option.title}</span>
                    <input
                      type="radio"
                      name="resource-scope"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => onScopeChange(option.id)}
                      className="size-4 text-primary focus:ring-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {option.description}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Specific project selector shown when 'specific_projects' is selected */}
      {scopeType === 'specific_projects' && (
        <SpecificProjectPicker
          selectedProjectIds={specificProjectIds}
          onChange={(newIds) => onScopeChange('specific_projects', newIds)}
          disabled={disabled}
        />
      )}
    </div>
  );
};
