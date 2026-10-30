import { useState } from 'react';
import { Box, ChevronLeft, Download, Map as MapIcon, Redo2, Save, Table2, Undo2 } from 'lucide-react';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { exportProject, saveCurrentProject } from '@/features/projects/projectActions';
import { selectIsDirty, useEditorStore } from '@/state/editorStore';

export function TopBar() {
  const project = useEditorStore((s) => s.project)!;
  const dirty = useEditorStore(selectIsDirty);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undoLabel = useEditorStore((s) => s.past.at(-1)?.label);
  const redoLabel = useEditorStore((s) => s.future.at(-1)?.label);
  const view = useEditorStore((s) => s.view);
  const showBom = useEditorStore((s) => s.showBom);
  const { undo, redo, setView, toggleBom, dispatch } = useEditorStore.getState();
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const commitName = () => {
    if (name !== null && name.trim() && name.trim() !== project.name) dispatch({ type: 'rename_project', name: name.trim() });
    setName(null);
  };

  const leave = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate({ name: 'home' });
  };

  return (
    <header className="flex h-12 items-center gap-2 border-b bg-card px-2">
      <Button variant="ghost" size="sm" onClick={leave} aria-label="All projects">
        <ChevronLeft /> Projects
      </Button>
      <Separator vertical />
      <Input
        aria-label="Project name"
        value={name ?? project.name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setName(null);
        }}
        className="h-8 w-56 border-transparent bg-transparent font-medium shadow-none hover:border-input"
      />
      <span className={dirty ? 'text-xs text-amber-600' : 'text-xs text-muted-foreground'} data-testid="save-state">
        {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
      </span>

      <div className="mx-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label="Undo" title={undoLabel ? `Undo: ${undoLabel} (⌘Z)` : 'Undo (⌘Z)'}>
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label="Redo" title={redoLabel ? `Redo: ${redoLabel} (⇧⌘Z)` : 'Redo (⇧⌘Z)'}>
          <Redo2 />
        </Button>
        <Separator vertical className="mx-1" />
        <div className="flex rounded-md border p-0.5" role="group" aria-label="View">
          <Button size="xs" variant={view === '3d' ? 'selected' : 'ghost'} aria-pressed={view === '3d'} onClick={() => setView('3d')}>
            <Box /> 3D
          </Button>
          <Button size="xs" variant={view === 'plan' ? 'selected' : 'ghost'} aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
            <MapIcon /> Plan
          </Button>
        </div>
        <Button size="sm" variant={showBom ? 'selected' : 'ghost'} aria-pressed={showBom} onClick={toggleBom}>
          <Table2 /> BOM
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={() => exportProject(project)} title="Download the project as a .kitchen.json file">
        <Download /> Export
      </Button>
      <Button
        size="sm"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await saveCurrentProject();
          setSaving(false);
        }}
        title="Save to this browser (⌘S)"
      >
        <Save /> Save
      </Button>
    </header>
  );
}
