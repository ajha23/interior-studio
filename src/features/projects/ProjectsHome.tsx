import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, FolderOpen, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { createExampleProject, createProject, DEFAULT_ROOM, layoutFitErrors, RoomSchema, zodMessages, type Layout, type Room } from '@/domain';
import { deleteProject, listProjects, loadProject, type ProjectSummary } from '@/persistence/projectDb';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MmField } from '@/components/ui/mm-field';
import { cn } from '@/lib/utils';
import { createAndOpen, exportProject, importProjectFile } from './projectActions';

const LAYOUTS: { value: Layout; label: string; hint: string }[] = [
  { value: 'straight', label: 'Straight', hint: 'One run on the back wall' },
  { value: 'l-shaped', label: 'L-shaped', hint: 'Back and left walls' },
  { value: 'empty', label: 'Empty room', hint: 'Start from scratch' },
];

export function ProjectsHome({ notice }: { notice?: string | null }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('My kitchen');
  const [room, setRoom] = useState<Room>(DEFAULT_ROOM);
  const [layout, setLayout] = useState<Layout>('straight');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listProjects().then(setProjects, (e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refresh, [refresh]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const parsedRoom = RoomSchema.safeParse(room);
    const problems = parsedRoom.success ? layoutFitErrors(room, layout) : zodMessages(parsedRoom.error);
    if (!name.trim()) problems.unshift('Give the project a name.');
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      await createAndOpen(createProject({ name, room, layout }));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const result = await importProjectFile(file);
    if (fileInput.current) fileInput.current.value = '';
    if (!result.ok) setErrors([`Could not import ${file.name}:`, ...result.errors]);
    else navigate({ name: 'editor', projectId: result.project.id });
  };

  const onExport = async (id: string) => {
    const loaded = await loadProject(id);
    if (loaded?.ok) exportProject(loaded.project);
  };

  const onDelete = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete “${p.name}” from this device? This cannot be undone.`)) return;
    await deleteProject(p.id);
    refresh();
  };

  const setDim = (key: keyof Room) => (value: number) => setRoom((r) => ({ ...r, [key]: value }));

  return (
    <main className="min-h-full bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <div className="grid size-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">IS</div>
          <div>
            <h1 className="text-base font-semibold">Interior Studio</h1>
            <p className="text-xs text-muted-foreground">Modular kitchen designer · projects are stored in this browser</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
            <p className="text-sm text-muted-foreground">Enter the room's inside dimensions and pick a starting layout.</p>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={create} aria-label="New project">
              <div className="flex flex-col gap-1">
                <Label htmlFor="project-name">Project name</Label>
                <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MmField label="Room width" value={room.width} onCommit={setDim('width')} testId="new-room-width" />
                <MmField label="Room length" value={room.length} onCommit={setDim('length')} testId="new-room-length" />
                <MmField label="Ceiling height" value={room.height} onCommit={setDim('height')} />
                <MmField label="Wall thickness" value={room.wallThickness} onCommit={setDim('wallThickness')} />
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Layout</legend>
                <div className="grid grid-cols-3 gap-2">
                  {LAYOUTS.map((l) => (
                    <label key={l.value} className={cn('flex cursor-pointer flex-col gap-0.5 rounded-md border p-2.5 text-sm transition-colors', layout === l.value ? 'border-highlight bg-accent' : 'hover:bg-muted')}>
                      <input type="radio" name="layout" value={l.value} checked={layout === l.value} onChange={() => setLayout(l.value)} className="sr-only" />
                      <span className="font-medium">{l.label}</span>
                      <span className="text-[11px] text-muted-foreground">{l.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {errors.length > 0 && (
                <ul role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
              <Button type="submit" disabled={busy}>
                <Plus /> Create project
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => void createAndOpen(createExampleProject())}>
                <Sparkles /> Open example kitchen
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Upload /> Import project file
              </Button>
              <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-label="Project file" onChange={(e) => void onImport(e.target.files?.[0])} />
            </div>
          </CardContent>
        </Card>

        <section aria-labelledby="projects-h" className="flex flex-col gap-3">
          <h2 id="projects-h" className="text-sm font-semibold">Your projects</h2>
          {notice && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">{notice}</p>}
          {loadError && <p role="alert" className="text-sm text-destructive">Local storage is unavailable: {loadError}</p>}
          {projects?.length === 0 && (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No saved projects yet. Create one or open the example kitchen.</div>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects?.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.room.width} × {p.room.length} mm · {p.elementCount} units · saved {new Date(p.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="mt-auto flex gap-1.5">
                    <Button size="sm" onClick={() => navigate({ name: 'editor', projectId: p.id })} aria-label={`Open ${p.name}`}>
                      <FolderOpen /> Open
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void onExport(p.id)} aria-label={`Export ${p.name}`}>
                      <Download /> Export
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => void onDelete(p)} aria-label={`Delete ${p.name}`}>
                      <Trash2 />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
