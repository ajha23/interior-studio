import { useState } from 'react';
import { Bot, Box, ChevronLeft, Columns2, Download, FileText, Map as MapIcon, Redo2, Save, ShieldCheck, Table2, Undo2 } from 'lucide-react';
import { useDesignChecks } from '@/features/checks/useDesignChecks';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LENGTH_UNITS, UNIT_LABEL, type LengthUnit } from '@/engine/measurement/units';
import { Separator } from '@/components/ui/separator';
import { exportProject, saveCurrentProject } from '@/features/projects/projectActions';
import { useAssistantStore } from '@/state/assistantStore';
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
  const showChecks = useEditorStore((s) => s.showChecks);
  const warningCount = useDesignChecks().filter((c) => c.severity === 'warning').length;
  const { undo, redo, setView, toggleBom, toggleChecks, dispatch } = useEditorStore.getState();
  const assistantOpen = useAssistantStore((s) => s.open);
  const setAssistantOpen = useAssistantStore((s) => s.setOpen);
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
    <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-2">
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
          <Button size="xs" variant={view === 'split' ? 'selected' : 'ghost'} aria-pressed={view === 'split'} onClick={() => setView('split')} title="Plan and 3D side by side">
            <Columns2 /> Split
          </Button>
          <Button size="xs" variant={view === 'drawings' ? 'selected' : 'ghost'} aria-pressed={view === 'drawings'} onClick={() => setView('drawings')}>
            <FileText /> Deliverables
          </Button>
        </div>
        <Button size="sm" variant={showBom ? 'selected' : 'ghost'} aria-pressed={showBom} onClick={toggleBom}>
          <Table2 /> BOM
        </Button>
        <Button size="sm" variant={showChecks ? 'selected' : 'ghost'} aria-pressed={showChecks} onClick={toggleChecks} aria-label={`Design checks: ${warningCount} warnings`}>
          <ShieldCheck /> Checks
          {warningCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white" data-testid="checks-count">{warningCount}</span>}
        </Button>
      </div>

      <Button size="sm" variant={assistantOpen ? 'selected' : 'ghost'} aria-pressed={assistantOpen} onClick={() => setAssistantOpen(!assistantOpen)} title="Design assistant: edit the design by describing changes">
        <Bot /> Assistant
      </Button>
      <Select
        aria-label="Units"
        title="Display units — lengths can be typed in any unit; geometry is stored in millimetres"
        value={project.preferences.unit}
        onChange={(e) => dispatch({ type: 'set_measurement_unit', unit: e.target.value as LengthUnit })}
        className="h-8 w-36 text-xs"
      >
        {LENGTH_UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
      </Select>
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
