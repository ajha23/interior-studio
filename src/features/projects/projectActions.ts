/**
 * Save, open, import and export, bridging the editor and where projects live. Inside a studio
 * (spec 043), projects are studio projects: Save sends a manual version and New/Import create the
 * project in the studio. Outside one, projects stay on this device as before.
 */
import { newId, parseProjectFile, serializeProject, type KitchenProject } from '@/domain';
import { loadProject, listProjects, saveProject } from '@/persistence/projectDb';
import * as cache from '@/persistence/cloudCache';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { navigate } from '@/app/router';
import { docRoutes } from '@/app/docRoutes';
import { currentStudio } from './cloud/studioContext';
import { useSyncStore } from './cloud/sync';
import { useHistoryStore } from './cloud/history';

/** Whether the open document is the studio project the sync controller is saving. */
function openStudioDocument(): boolean {
  const { projectId } = useSyncStore.getState();
  if (!projectId) return false;
  const home = useHomeStore.getState().home;
  return home ? home.id === projectId : useEditorStore.getState().project?.id === projectId;
}

/** Saves the open project; for a studio project, a manual version with an optional message. */
export async function saveCurrentProject(message?: string): Promise<boolean> {
  const { project, markSaved, report } = useEditorStore.getState();
  const home = useHomeStore.getState();
  if (!project && !home.home) return false;
  if (openStudioDocument()) {
    const sync = useSyncStore.getState();
    if (sync.readOnly) {
      report('error', 'View only: ask a studio owner for edit access.');
      return false;
    }
    if (useHistoryStore.getState().viewing) {
      report('error', 'You are viewing a past version: use Restore to keep it, or Back to latest.');
      return false;
    }
    const ok = await sync.saveVersion(message);
    const after = useSyncStore.getState();
    if (ok) report('info', message?.trim() ? `Saved version: “${message.trim()}”` : 'Saved version');
    else if (after.status === 'offline') report('info', 'Offline: the version is saved on this device and sent when you are back online.');
    else report('error', after.error?.message ?? 'Could not save.');
    return ok;
  }
  if (!project) return false;
  // A room of a home: save the whole home (the room's edits are already in it).
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

/** Creates a kitchen in the open studio; returns the studio project's id. */
async function createInStudio(project: KitchenProject): Promise<string> {
  const studio = currentStudio();
  if (!studio) throw new Error('No studio is open.');
  const made = await cloud.createProject(studio.client, { orgId: studio.orgId, name: project.name, doc: { type: 'kitchen', project }, idempotencyKey: crypto.randomUUID() });
  if (!made.ok) throw new Error(made.error.message);
  await cache.putDoc({ userId: studio.userId, orgId: studio.orgId, projectId: made.value.id, versionNo: 1, doc: made.value.doc, name: project.name });
  return made.value.id;
}

/** Saves a brand-new project (in the studio, when one is open) and opens it in the editor. */
export async function createAndOpen(project: KitchenProject): Promise<void> {
  if (currentStudio()) {
    navigate(docRoutes.kitchen(await createInStudio(project)));
    return;
  }
  await saveProject(project);
  navigate({ name: 'editor', projectId: project.id });
}

/** Loads a project stored on this device into the editor. Returns an error message when it cannot be opened. */
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

/**
 * Imports a project file. Inside a studio it becomes a new studio project (a user action, not the
 * 044 move of device projects); on this device, a file whose id already exists is imported as a copy.
 * Returns the address to open.
 */
export async function importProjectFile(file: File): Promise<{ ok: true; projectId: string } | { ok: false; errors: string[] }> {
  const parsed = parseProjectFile(await file.text());
  if (!parsed.ok) return parsed;
  if (currentStudio()) return { ok: true, projectId: await createInStudio(parsed.project) };
  const existing = await listProjects();
  const project = existing.some((p) => p.id === parsed.project.id) ? { ...parsed.project, id: newId('prj'), name: `${parsed.project.name} (imported)` } : parsed.project;
  await saveProject(project);
  return { ok: true, projectId: project.id };
}
