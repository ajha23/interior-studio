import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { listProjects, saveProject } from './projectDb';
import * as cache from './cloudCache';

const kitchen = (id: string) => ({ type: 'kitchen' as const, project: { ...createProject({ name: 'Rao kitchen', room: DEFAULT_ROOM, layout: 'straight' }), id } });
const entry = (projectId: string, expectedVersionNo: number, userId = 'u1', orgId = 'org-a'): cache.QueueInput => ({
  userId,
  orgId,
  projectId,
  expectedVersionNo,
  idempotencyKey: `key-${projectId}-${expectedVersionNo}`,
  doc: kitchen(projectId),
  kind: 'autosave',
  message: '',
});

beforeEach(async () => {
  await cache.clearUser('u1');
  await cache.clearUser('u2');
});

describe('the cloud cache (FR-011a)', () => {
  it('keeps the last opened or saved copy of each project per user and studio', async () => {
    await cache.putDoc({ userId: 'u1', orgId: 'org-a', projectId: 'p1', versionNo: 3, doc: kitchen('p1'), name: 'Rao kitchen' });
    expect(await cache.getDoc('u1', 'org-a', 'p1')).toMatchObject({ versionNo: 3, doc: { type: 'kitchen', project: { id: 'p1' } } });
    expect(await cache.getDoc('u2', 'org-a', 'p1')).toBeNull();
    expect(await cache.getDoc('u1', 'org-b', 'p1')).toBeNull();
    await cache.putDoc({ userId: 'u1', orgId: 'org-a', projectId: 'p1', versionNo: 4, doc: kitchen('p1'), name: 'Rao kitchen' });
    expect((await cache.getDoc('u1', 'org-a', 'p1'))?.versionNo).toBe(4);
  });

  it('lists every project with a copy here, per user and studio', async () => {
    await cache.putDoc({ userId: 'u1', orgId: 'org-a', projectId: 'p1', versionNo: 2, doc: kitchen('p1'), name: 'A' });
    await cache.putDoc({ userId: 'u1', orgId: 'org-b', projectId: 'p2', versionNo: 1, doc: kitchen('p2'), name: 'B' });
    expect((await cache.docsFor('u1', 'org-a')).map((d) => d.projectId)).toEqual(['p1']);
  });

  it('keeps the last project list per user and studio', async () => {
    await cache.putList('u1', 'org-a', [{ id: 'p1', name: 'Rao kitchen' }]);
    expect(await cache.getList('u1', 'org-a')).toMatchObject({ rows: [{ id: 'p1' }] });
    expect(await cache.getList('u1', 'org-b')).toBeNull();
  });
});

describe('the save queue (FR-011)', () => {
  it('returns entries in the order they were queued, per project', async () => {
    await cache.enqueue(entry('p1', 3));
    await cache.enqueue(entry('p2', 1));
    await cache.enqueue(entry('p1', 4));
    expect((await cache.queued('u1', 'org-a', 'p1')).map((e) => e.expectedVersionNo)).toEqual([3, 4]);
    expect((await cache.queued('u1', 'org-a')).map((e) => e.projectId)).toEqual(['p1', 'p2', 'p1']);
    expect(await cache.queued('u2', 'org-a')).toEqual([]);
  });

  it('removes a sent entry and re-bases the waiting ones onto a new head', async () => {
    const first = await cache.enqueue(entry('p1', 3));
    await cache.enqueue(entry('p1', 4));
    await cache.enqueue(entry('p1', 5));
    await cache.remove(first);
    await cache.rebase('u1', 'org-a', 'p1', 9);
    expect((await cache.queued('u1', 'org-a', 'p1')).map((e) => e.expectedVersionNo)).toEqual([9, 10]);
  });

  it('drops a project’s queue', async () => {
    await cache.enqueue(entry('p1', 3));
    await cache.enqueue(entry('p2', 1));
    await cache.dropQueue('u1', 'org-a', 'p1');
    expect((await cache.queued('u1', 'org-a')).map((e) => e.projectId)).toEqual(['p2']);
  });
});

describe('sign-out', () => {
  it('clears one user’s copies, lists and queue, and leaves other users and device projects alone', async () => {
    const device = createProject({ name: 'On this device', room: DEFAULT_ROOM, layout: 'empty' });
    await saveProject(device);
    await cache.putDoc({ userId: 'u1', orgId: 'org-a', projectId: 'p1', versionNo: 1, doc: kitchen('p1'), name: 'A' });
    await cache.putDoc({ userId: 'u2', orgId: 'org-a', projectId: 'p1', versionNo: 1, doc: kitchen('p1'), name: 'A' });
    await cache.putList('u1', 'org-a', []);
    await cache.enqueue(entry('p1', 1));
    await cache.enqueue(entry('p1', 1, 'u2'));

    await cache.clearUser('u1');

    expect(await cache.getDoc('u1', 'org-a', 'p1')).toBeNull();
    expect(await cache.getList('u1', 'org-a')).toBeNull();
    expect(await cache.queued('u1', 'org-a')).toEqual([]);
    expect(await cache.getDoc('u2', 'org-a', 'p1')).not.toBeNull();
    expect(await cache.queued('u2', 'org-a')).toHaveLength(1);
    expect((await listProjects()).map((p) => p.id)).toContain(device.id);
  });
});
