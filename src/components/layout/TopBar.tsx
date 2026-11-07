import { useState } from 'react';
import { Box, ChevronLeft, Columns2, Database, Download, FileText, Map as MapIcon, Redo2, Ruler, Save, Search, Shield, ShieldCheck, Table2, Undo2 } from 'lucide-react';
import { useDesignChecks } from '@/features/checks/useDesignChecks';
import { navigate } from '@/app/router';
import { docRoutes } from '@/app/docRoutes';
import { useHomeStore } from '@/state/homeStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LENGTH_UNITS, UNIT_LABEL, type LengthUnit } from '@/engine/measurement/units';
import { Separator } from '@/components/ui/separator';
import { exportProject, saveCurrentProject } from '@/features/projects/projectActions';
import { selectIsDirty, useEditorStore } from '@/state/editorStore';
import { StudioTableEditor } from '@/features/table-editor/StudioTableEditor';
import { SiteCaptureModal } from '@/features/measurement/SiteCaptureModal';
import { useSiteCaptureStore } from '@/state/siteCaptureStore';
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { useCommandPaletteStore } from '@/features/command-palette/commandPaletteStore';
import { SaveStatus } from '@/features/projects/cloud/SaveStatus';
import { HistoryButton } from '@/features/projects/cloud/HistoryPanel';
import { useHistoryStore } from '@/features/projects/cloud/history';
import { useSyncStore } from '@/features/projects/cloud/sync';

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
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A studio project autosaves; Save makes a named version (spec 043, FR-009).
  const studioProject = useSyncStore((s) => s.projectId !== null);
  // Viewers, and a past version on screen (spec 043, US5), have nothing to save.
  const viewingPast = useHistoryStore((s) => s.viewing !== null);
  const viewOnly = useSyncStore((s) => s.projectId !== null && s.readOnly) || viewingPast;
  const [versionMessage, setVersionMessage] = useState<string | null>(null);
  const [showTables, setShowTables] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const openSiteCapture = useSiteCaptureStore((s) => s.openModal);
  const openCommandPalette = useCommandPaletteStore((s) => s.open);

  const commitName = () => {
    if (name !== null && name.trim() && name.trim() !== project.name) dispatch({ type: 'rename_project', name: name.trim() });
    setName(null);
  };

  const inHome = useHomeStore((s) => (s.roomId ? s.home : null));
  const leave = () => {
    // A room's edits stay in its home (unsaved until Save), so going back to the plan loses nothing.
    if (inHome) {
      navigate(docRoutes.home(inHome.id));
      return;
    }
    // Studio projects keep unsent edits in the device queue, so only device projects ask.
    if (!studioProject && dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate(docRoutes.projects());
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-2">
      <Button variant="ghost" size="sm" onClick={leave} aria-label={inHome ? `Back to ${inHome.name}` : 'All projects'}>
        <ChevronLeft /> {inHome ? 'Home plan' : 'Projects'}
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
      {studioProject ? (
        <SaveStatus />
      ) : (
        <span className={dirty ? 'text-xs text-amber-600' : 'text-xs text-muted-foreground'} data-testid="save-state">
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
        </span>
      )}

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
        <Button size="sm" variant={showTables ? 'selected' : 'ghost'} aria-pressed={showTables} onClick={() => setShowTables(true)} aria-label="Studio Tables" title="Studio Data Tables & Governance (SEC-08)" data-testid="studio-tables-btn">
          <Database /> Studio Tables
        </Button>
        <Button size="sm" variant={showSettings ? 'selected' : 'ghost'} aria-pressed={showSettings} onClick={() => setShowSettings(true)} aria-label="Access & Security Settings" title="Roles, Permissions & Access Settings (Feature 033)" data-testid="access-settings-btn">
          <Shield /> Roles & Access
        </Button>
        <Button size="sm" variant="ghost" onClick={openSiteCapture} aria-label="Site Measurement" title="Site Measurement & Wall Photos (MT-03, MT-05)" data-testid="site-capture-btn">
          <Ruler /> Site Capture
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={openCommandPalette}
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Command Palette (⌘K)"
          data-testid="command-palette-btn"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Commands</span>
          <kbd className="rounded border bg-muted px-1 text-[10px] font-semibold">⌘K</kbd>
        </Button>
      </div>

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
      <HistoryButton />
      {studioProject && !viewOnly && versionMessage !== null && (
        <form
          className="flex items-center gap-1"
          aria-label="Save version"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            await saveCurrentProject(versionMessage);
            setSaving(false);
            setVersionMessage(null);
          }}
        >
          <Input autoFocus aria-label="Version message" placeholder="What changed? (optional)" maxLength={500} value={versionMessage} onChange={(e) => setVersionMessage(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setVersionMessage(null)} className="h-8 w-56 text-xs" />
          <Button type="submit" size="sm" disabled={saving}>
            <Save /> Save version
          </Button>
        </form>
      )}
      {!viewOnly && versionMessage === null && (
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            if (studioProject) {
              setVersionMessage('');
              return;
            }
            setSaving(true);
            await saveCurrentProject();
            setSaving(false);
          }}
          title={studioProject ? 'Save a named version (autosave keeps every change; ⌘S saves a version now)' : 'Save to this browser (⌘S)'}
        >
          <Save /> {studioProject ? 'Save version…' : 'Save'}
        </Button>
      )}
      <StudioTableEditor isOpen={showTables} onClose={() => setShowTables(false)} />
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto" data-testid="settings-modal-wrapper">
          <SettingsLayout onClose={() => setShowSettings(false)} />
        </div>
      )}
      <SiteCaptureModal projectId={project.id} />
    </header>
  );
}
