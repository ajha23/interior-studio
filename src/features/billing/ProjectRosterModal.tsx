/**
 * ProjectRosterModal Component.
 * Non-destructive project designation dialog for subscription downgrades.
 * Conforms to Constitution Principle X (FR-008, Clarification 1).
 */

import { useState } from 'react';
import { Archive, CheckCircle2, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ProjectRosterItem } from '@/domain/platform/saas/lifecycleManager';

export interface ProjectRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedActiveIds: string[]) => void;
  projects: ProjectRosterItem[];
  allowedActiveCount: number;
  initialSelectedIds?: string[];
}

export function ProjectRosterModal({
  isOpen,
  onClose,
  onConfirm,
  projects,
  allowedActiveCount,
  initialSelectedIds = [],
}: ProjectRosterModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (initialSelectedIds.length > 0) {
      return initialSelectedIds.slice(0, allowedActiveCount);
    }
    return projects.slice(0, allowedActiveCount).map((p) => p.id);
  });

  if (!isOpen) return null;

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= allowedActiveCount) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const isFull = selectedIds.length >= allowedActiveCount;
  const isOverLimit = selectedIds.length > allowedActiveCount;

  return (
    <div
      data-testid="project-roster-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <Badge className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Archive className="h-3.5 w-3.5" />
            <span>Non-Destructive Downgrade</span>
          </Badge>
          <span className="text-xs text-muted-foreground">
            Capacity: {allowedActiveCount} Active Projects
          </span>
        </div>

        <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground">
          Designate Active Projects
        </h2>

        <p className="mt-1 text-xs text-muted-foreground">
          Select up to <strong>{allowedActiveCount}</strong> projects to keep in active editing mode.
          All remaining projects are permanently preserved in read-only archive mode with zero data loss.
        </p>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>Selected: {selectedIds.length} / {allowedActiveCount} active</span>
          </div>
          {isFull && !isOverLimit && (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
              Quota limit reached
            </span>
          )}
        </div>

        <div className="mt-3 max-h-60 overflow-y-auto space-y-2 pr-1">
          {projects.map((project) => {
            const isSelected = selectedIds.includes(project.id);
            return (
              <label
                key={project.id}
                htmlFor={`roster-check-${project.id}`}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                  isSelected
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/60 bg-muted/10 opacity-75 hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    id={`roster-check-${project.id}`}
                    type="checkbox"
                    checked={isSelected}
                    disabled={!isSelected && isFull}
                    onChange={() => toggleProject(project.id)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm font-semibold text-foreground">{project.name}</span>
                    <p className="text-[11px] text-muted-foreground">ID: {project.id}</p>
                  </div>
                </div>

                {isSelected ? (
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">
                    Active
                  </Badge>
                ) : (
                  <Badge className="gap-1 border-border text-muted-foreground text-[10px]">
                    <Lock className="h-2.5 w-2.5" />
                    <span>Archived</span>
                  </Badge>
                )}
              </label>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-border/60 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={selectedIds.length === 0 || isOverLimit}
            onClick={() => onConfirm(selectedIds)}
            className="gap-2 font-semibold"
          >
            <span>Save Active Roster</span>
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
