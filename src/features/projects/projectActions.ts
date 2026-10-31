/** Save, open, import and export, bridging the editor store and local storage. */
import { newId, parseProjectFile, serializeProject, type KitchenProject } from '@/domain';
import { loadProject, listProjects, saveProject } from '@/persistence/projectDb';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { navigate } from '@/app/router';

export async function saveCurrentProject(): Promise<boolean> {
  const { project, markSaved, report } = useEditorStore.getState();
  if (!project) return false;
  // A room of a home: save the whole home (the room's edits are already in it).
  const home = useHomeStore.getState();
  if (home.home && home.roomId) {
    try {
      await home.save();
      report('info', `Saved “${home.home.name}”`);
      return true;
    } catch (e) {
      report('error', `Could not save: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
  try {
    await saveProject(project);
    markSaved(project);
    report('info', `Saved “${project.name}”`);
    return true;
  } catch (e) {
    report('error', `Could not save: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Saves a brand-new project and opens it in the editor. */
export async function createAndOpen(project: KitchenProject): Promise<void> {
  await saveProject(project);
  navigate({ name: 'editor', projectId: project.id });
}

/** Loads a stored project into the editor. Returns an error message when it cannot be opened. */
export async function openStoredProject(id: string): Promise<string | null> {
  const loaded = await loadProject(id);
  if (!loaded) return 'This project does not exist on this device.';
  if (!loaded.ok) return `This project could not be opened: ${loaded.errors.join(' ')}`;
  const store = useEditorStore.getState();
  store.openProject(loaded.project);
  if (loaded.issues.length) store.report('error', ...loaded.issues.map((i) => i.message));
  return null;
}

export function exportProject(project: KitchenProject): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'kitchen'}.kitchen.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Imports a project file; a file whose id already exists locally is imported as a copy. */
export async function importProjectFile(file: File): Promise<{ ok: true; project: KitchenProject } | { ok: false; errors: string[] }> {
  const parsed = parseProjectFile(await file.text());
  if (!parsed.ok) return parsed;
  const existing = await listProjects();
  const project = existing.some((p) => p.id === parsed.project.id) ? { ...parsed.project, id: newId('prj'), name: `${parsed.project.name} (imported)` } : parsed.project;
  await saveProject(project);
  return { ok: true, project };
}
