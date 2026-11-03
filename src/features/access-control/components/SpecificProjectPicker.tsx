import { useState, useMemo, type FC } from 'react';
import { Search, FolderKanban, Check, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProjectItem {
  id: string;
  name: string;
  clientName?: string;
}

interface SpecificProjectPickerProps {
  selectedProjectIds: string[];
  onChange: (projectIds: string[]) => void;
  availableProjects?: ProjectItem[];
  disabled?: boolean;
}

const DEFAULT_MOCK_PROJECTS: ProjectItem[] = [
  { id: 'proj_101', name: 'Skyline Penthouse 4B', clientName: 'Rajesh & Simran Mehta' },
  { id: 'proj_102', name: 'Alipore Villa Renovation', clientName: 'Vikram Burman' },
  { id: 'proj_103', name: 'Jubilee Hills Duplex', clientName: 'Ananya Reddy' },
  { id: 'proj_104', name: 'Whitefield Smart Studio', clientName: 'Karthik Raman' },
  { id: 'proj_105', name: 'Bandra Coastal Apartment', clientName: 'Tara Deshmukh' },
];

export const SpecificProjectPicker: FC<SpecificProjectPickerProps> = ({
  selectedProjectIds,
  onChange,
  availableProjects = DEFAULT_MOCK_PROJECTS,
  disabled = false,
}) => {
  const [search, setSearch] = useState('');

  const selectedSet = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableProjects;
    return availableProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q)
    );
  }, [availableProjects, search]);

  const toggleProject = (projectId: string) => {
    if (disabled) return;
    if (selectedSet.has(projectId)) {
      onChange(selectedProjectIds.filter((id) => id !== projectId));
    } else {
      onChange([...selectedProjectIds, projectId]);
    }
  };

  const removeProject = (projectId: string) => {
    if (disabled) return;
    onChange(selectedProjectIds.filter((id) => id !== projectId));
  };

  return (
    <div className="space-y-3 p-4 rounded-lg border bg-muted/10" data-testid="specific-project-picker">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Controlled Project List</h4>
          <p className="text-xs text-muted-foreground">
            Members with this role will only be permitted to access the designated projects below.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {selectedProjectIds.length} Selected
        </Badge>
      </div>

      {/* Selected tags */}
      {selectedProjectIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedProjectIds.map((id) => {
            const proj = availableProjects.find((p) => p.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                data-testid={`selected-project-tag-${id}`}
              >
                <FolderKanban className="size-3" />
                <span>{proj?.name || id}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeProject(id)}
                    className="hover:text-destructive transition-colors ml-0.5"
                    aria-label={`Remove project ${proj?.name || id}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Search Available */}
      {!disabled && (
        <div className="pt-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search available projects to add..."
              className="pl-8 h-8 text-xs"
              data-testid="picker-search-input"
            />
          </div>

          <div className="max-h-48 overflow-y-auto divide-y border rounded-md bg-card">
            {filteredProjects.map((proj) => {
              const isSelected = selectedSet.has(proj.id);
              return (
                <div
                  key={proj.id}
                  className="flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors text-xs"
                >
                  <div>
                    <p className="font-medium text-foreground">{proj.name}</p>
                    {proj.clientName && (
                      <p className="text-[11px] text-muted-foreground">{proj.clientName}</p>
                    )}
                  </div>

                  <Button
                    variant={isSelected ? 'selected' : 'outline'}
                    size="xs"
                    onClick={() => toggleProject(proj.id)}
                    className="gap-1"
                    data-testid={`picker-toggle-${proj.id}`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="size-3" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <Plus className="size-3" />
                        <span>Add</span>
                      </>
                    )}
                  </Button>
                </div>
              );
            })}

            {filteredProjects.length === 0 && (
              <p className="p-3 text-center text-xs text-muted-foreground">
                No projects found matching "{search}".
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
