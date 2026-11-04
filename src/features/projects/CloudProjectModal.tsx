import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cloud,
  CloudUpload,
  DoorOpen,
  FileCode,
  FolderPlus,
  Layers,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCloudProjectStore } from '@/state/cloudProjectStore';
import type { SpaceType } from '@/domain/project/cloudTypes';

export function CloudProjectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const store = useCloudProjectStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'spaces' | 'revisions' | 'import'>('overview');
  const [newProjectName, setNewProjectName] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceType, setNewSpaceType] = useState<SpaceType>('kitchen');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const currentProject = store.currentProject;
  const currentSpace = store.spaces.find((s) => s.id === store.activeSpaceId);
  const activeRevisions = store.activeSpaceId ? store.revisions[store.activeSpaceId] ?? [] : [];
  const syncStatus = store.syncState.syncStatus;

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const p = await store.createProject(newProjectName.trim());
      setNewProjectName('');
      setFeedback({ type: 'success', message: `Created project "${p.name}".` });
      setActiveTab('spaces');
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpaceName.trim()) return;
    try {
      const s = await store.createSpace(newSpaceName.trim(), newSpaceType);
      setNewSpaceName('');
      setFeedback({ type: 'success', message: `Created space "${s.name}".` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCommitRevision = async () => {
    setFeedback(null);
    const result = await store.commitCurrentDesign();
    if (result.success) {
      setFeedback({
        type: 'success',
        message: `Committed revision ${result.revision.id.slice(0, 8)} (${result.revision.canonicalHash.slice(0, 8)}).`,
      });
    } else if (result.conflict) {
      setFeedback({
        type: 'error',
        message: `Commit conflict: ${result.reason}`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: `Commit error: ${result.error}`,
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    try {
      const text = await file.text();
      if (file.name.endsWith('.kitchen.json') || text.includes('interior-studio/kitchen')) {
        const imported = await store.importKitchen(text, file.name.replace(/\.kitchen\.json$/, ''));
        setFeedback({ type: 'success', message: `Imported kitchen into project "${imported.project.name}".` });
      } else if (file.name.endsWith('.home.json') || text.includes('interior-studio/home')) {
        const imported = await store.importHome(text, file.name.replace(/\.home\.json$/, ''));
        setFeedback({
          type: 'success',
          message: `Imported whole home with ${imported.spaces.length} spaces into project "${imported.project.name}".`,
        });
      } else {
        setFeedback({ type: 'error', message: 'Unsupported file format. Please upload .kitchen.json or .home.json.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      data-testid="cloud-project-modal"
    >
      <div className="relative flex h-[620px] w-full max-w-3xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Cloud className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">SaaS Project Foundation & Cloud Sync</h2>
              <p className="text-xs text-muted-foreground">
                Authoritative PostgreSQL projects, spaces, and immutable design revisions (Feature 034)
              </p>
            </div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} data-testid="close-cloud-modal-btn">
            <X className="size-4" />
          </Button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b bg-muted/20 px-6 gap-2">
          <button
            type="button"
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('overview')}
            data-testid="tab-cloud-overview"
          >
            Overview & Projects
          </button>
          <button
            type="button"
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'spaces'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('spaces')}
            data-testid="tab-cloud-spaces"
          >
            Spaces ({store.spaces.length})
          </button>
          <button
            type="button"
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'revisions'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('revisions')}
            data-testid="tab-cloud-revisions"
          >
            Revisions ({activeRevisions.length})
          </button>
          <button
            type="button"
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === 'import'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('import')}
            data-testid="tab-cloud-import"
          >
            Import to Cloud
          </button>

          {/* Sync Status Badge in Tab Bar */}
          <div className="ml-auto flex items-center gap-2 py-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                syncStatus === 'synced'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : syncStatus === 'conflict'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
              data-testid="sync-status-badge"
            >
              {syncStatus === 'synced' ? (
                <CheckCircle2 className="size-3" />
              ) : syncStatus === 'conflict' ? (
                <AlertTriangle className="size-3" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {syncStatus.toUpperCase()}
            </span>
            <Button
              size="xs"
              variant="outline"
              onClick={handleCommitRevision}
              disabled={store.isSyncing || !currentSpace}
              className="h-6 gap-1 px-2 text-[11px]"
              data-testid="commit-cloud-btn"
            >
              <CloudUpload className="size-3" />
              Commit
            </Button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-6 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 text-destructive'
            }`}
            role="status"
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertTriangle className="size-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Active Engagement Summary */}
              <div className="rounded-lg border bg-muted/10 p-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Active SaaS Engagement
                </span>
                {currentProject ? (
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{currentProject.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        ID: <code className="font-mono text-[11px]">{currentProject.id}</code> · Status:{' '}
                        <span className="capitalize">{currentProject.status}</span>
                      </p>
                    </div>
                    <span className="rounded-md border bg-card px-2.5 py-1 text-xs font-medium">
                      {store.spaces.length} Spaces
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No active cloud project selected. Create or select a project below.
                  </p>
                )}
              </div>

              {/* Create Project Form */}
              <form onSubmit={handleCreateProject} className="flex gap-2">
                <Input
                  placeholder="New SaaS Project name (e.g. Marina Bay Penthouse)..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="flex-1 text-xs"
                  data-testid="new-project-name-input"
                />
                <Button size="sm" type="submit" className="gap-1.5" data-testid="create-project-submit-btn">
                  <FolderPlus className="size-3.5" />
                  Create Project
                </Button>
              </form>

              {/* Existing Projects List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Organization Projects ({store.projects.length})
                </h4>
                {store.projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No projects found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {store.projects.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                          p.id === currentProject?.id ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Building2 className="size-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs font-medium text-foreground">{p.name}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{p.id}</p>
                          </div>
                        </div>
                        <Button
                          size="xs"
                          variant={p.id === currentProject?.id ? 'selected' : 'outline'}
                          onClick={() => {
                            useCloudProjectStore.setState({ currentProject: p });
                            setActiveTab('spaces');
                          }}
                        >
                          {p.id === currentProject?.id ? 'Selected' : 'Open'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'spaces' && (
            <div className="space-y-6">
              {/* Create Space Form */}
              <form onSubmit={handleCreateSpace} className="flex items-center gap-2">
                <Input
                  placeholder="Space name (e.g. Master Bedroom, Gourmet Kitchen)..."
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  className="flex-1 text-xs"
                  data-testid="new-space-name-input"
                />
                <Select
                  value={newSpaceType}
                  onChange={(e) => setNewSpaceType(e.target.value as SpaceType)}
                  className="w-36 text-xs h-9"
                  data-testid="new-space-type-select"
                >
                  <option value="kitchen">Kitchen</option>
                  <option value="bedroom">Bedroom</option>
                  <option value="living">Living Room</option>
                  <option value="dining">Dining Room</option>
                  <option value="bathroom">Bathroom</option>
                  <option value="office">Office</option>
                  <option value="other">Other</option>
                </Select>
                <Button size="sm" type="submit" className="gap-1.5" data-testid="create-space-submit-btn">
                  <Plus className="size-3.5" />
                  Add Space
                </Button>
              </form>

              {/* Spaces List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Project Spaces ({store.spaces.length})
                </h4>
                {store.spaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    No spaces defined for this project yet. Add a space above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {store.spaces.map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                          s.id === store.activeSpaceId ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/30'
                        }`}
                        data-testid={`space-card-${s.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <DoorOpen className="size-4 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-foreground">{s.name}</p>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase">
                                {s.spaceType}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              Level {s.level} · Current Rev:{' '}
                              {s.currentRevisionId ? s.currentRevisionId.slice(0, 8) : 'None'}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="xs"
                          variant={s.id === store.activeSpaceId ? 'selected' : 'outline'}
                          onClick={() => store.selectSpace(s.id)}
                          data-testid={`select-space-btn-${s.id}`}
                        >
                          {s.id === store.activeSpaceId ? 'Active in Canvas' : 'Load in Canvas'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'revisions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Immutable Design Lineage ({activeRevisions.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Space: <span className="font-semibold">{currentSpace?.name || 'None'}</span>
                  </p>
                </div>
                <Button
                  size="xs"
                  onClick={handleCommitRevision}
                  disabled={store.isSyncing || !currentSpace}
                  className="gap-1.5"
                >
                  <CloudUpload className="size-3.5" />
                  Commit New Revision
                </Button>
              </div>

              {activeRevisions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No revisions committed yet for this space. Click "Commit New Revision" to record the first snapshot.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeRevisions.map((rev, idx) => (
                    <div key={rev.id} className="rounded-lg border p-3 text-xs bg-card/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Layers className="size-4 text-primary" />
                          <span className="font-semibold text-foreground">
                            Revision #{activeRevisions.length - idx}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">{rev.id}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(rev.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                        <span>Format: {rev.format}</span>
                        <span className="font-mono">SHA-256: {rev.canonicalHash.slice(0, 16)}...</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-6">
              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                <FileCode className="mx-auto size-10 text-muted-foreground/60" />
                <h4 className="mt-3 text-sm font-semibold text-foreground">Import Legacy Design Files</h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                  Upload a standalone kitchen file (<code>*.kitchen.json</code>) or a whole-home layout file (
                  <code>*.home.json</code>) to automatically scaffold a SaaS Project, Spaces, and initial revisions.
                </p>
                <div className="mt-4">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90">
                    <CloudUpload className="size-4" />
                    Select JSON File
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                      data-testid="cloud-file-input"
                    />
                  </label>
                </div>
              </div>

              {store.legacyMappings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Import Provenance Mappings ({store.legacyMappings.length})
                  </h4>
                  <div className="space-y-1.5">
                    {store.legacyMappings.map((m) => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                        <div>
                          <span className="font-medium text-foreground">{m.sourceEntityType}</span>: {m.sourceEntityId}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          Mapped to Project {m.targetProjectId.slice(0, 8)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
