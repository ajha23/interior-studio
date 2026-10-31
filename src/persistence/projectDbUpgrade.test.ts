/**
 * Upgrading local storage while another tab (an older version) still has it open: the browser
 * blocks the upgrade. Saving must fail with an explanation instead of waiting forever, and work once
 * the other tab is gone. Runs in its own file so the database starts at the old version.
 */
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '@/domain';

const open = (version: number) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('interior-studio', version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      if (!db.objectStoreNames.contains('homes')) db.createObjectStore('homes', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

describe('local storage upgrade while an older tab is open', () => {
  it('explains the blocked upgrade, then saves once the old tab closes', async () => {
    // The "old tab": version 2 open, with no handler that would release it.
    const oldTab = await open(2);
    const { BLOCKED_MESSAGE, saveProject, loadProject } = await import('./projectDb');
    const project = createExampleProject();
    await expect(saveProject(project)).rejects.toThrow(BLOCKED_MESSAGE);
    oldTab.close();
    await saveProject(project);
    expect((await loadProject(project.id))?.ok).toBe(true);
  });

  it('releases the database when a newer version needs to upgrade it', async () => {
    const { saveProject } = await import('./projectDb');
    await saveProject(createExampleProject());
    // A "newer tab" opening version 4 is not blocked by this one.
    const newer = await open(4);
    expect(newer.version).toBe(4);
    newer.close();
  });
});
