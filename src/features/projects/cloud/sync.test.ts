import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, DEFAULT_ROOM, type KitchenProject } from '@/domain';
import type { CloudDoc, CloudError, Result, SavedVersion } from '@/infrastructure/projects/cloudProjects';
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';
import * as cache from '@/persistence/cloudCache';

type SaveInput = { projectId: string; expectedVersionNo: number; idempotencyKey: string; doc: CloudDoc; kind: string; message?: string };
const save = vi.fn<(client: unknown, input: SaveInput) => Promise<Result<SavedVersion>>>();
vi.mock('@/infrastructure/projects/cloudProjects', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  saveVersion: (client: unknown, input: SaveInput) => save(client, input),
}));
const { AUTOSAVE_DELAY_MS, useSyncStore } = await import('./sync');

const ID = '7d1c9a2e-0000-4000-8000-000000000001';
let project: KitchenProject;
let listeners: Array<() => void>;
let saved: CloudDoc[];
/** A tiny stand-in for the editor: edits replace the project and notify the watcher. */
const edit = (width: number) => {
  project = { ...project, room: { ...project.room, width } };
  for (const l of listeners) l();
};
const sync = () => useSyncStore.getState();
const ok = (versionNo: number): Result<SavedVersion> => ({ ok: true, value: { id: `v${versionNo}`, versionNo } });
const fail = (error: CloudError): Result<SavedVersion> => ({ ok: false, error });
/** Answers saves like the database: the next version when the expected head matches. */
function database(head: number) {
  const keys = new Map<string, number>();
  save.mockImplementation(async (_c, input) => {
    const seen = keys.get(input.idempotencyKey);
    if (seen !== undefined) return ok(seen);
    if (input.expectedVersionNo !== head) return fail({ kind: 'conflict', message: 'Someone else saved this project.', currentVersionNo: head });
    head += 1;
    keys.set(input.idempotencyKey, head);
    return ok(head);
  });
  return () => head;
}

async function attach(readOnly = false, head = 1) {
  await sync().attach({
    client: {} as AppSupabaseClient,
    userId: 'u1',
    orgId: 'org-a',
    projectId: ID,
    name: 'Rao kitchen',
    head,
    readOnly,
    read: () => ({ type: 'kitchen', project }),
    markSaved: (doc) => saved.push(doc),
    watch: (onChange) => {
      listeners.push(onChange);
      return () => (listeners = listeners.filter((l) => l !== onChange));
    },
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  save.mockReset();
  project = { ...createProject({ name: 'Rao kitchen', room: DEFAULT_ROOM, layout: 'straight' }), id: ID };
  listeners = [];
  saved = [];
  await cache.clearUser('u1');
});

afterEach(() => {
  sync().detach();
  vi.useRealTimers();
});

describe('autosave (FR-009, FR-010)', () => {
  it('saves once, 2 s after the last of several changes, then reads Saved', async () => {
    database(1);
    await attach();
    edit(3000);
    await vi.advanceTimersByTimeAsync(500);
    edit(3100);
    await vi.advanceTimersByTimeAsync(500);
    edit(3200);
    expect(sync().status).toBe('saving');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(sync().status).toBe('saved'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toMatchObject({ projectId: ID, expectedVersionNo: 1, kind: 'autosave' });
    expect((save.mock.calls[0]![1].doc as { project: KitchenProject }).project.room.width).toBe(3200);
    expect(sync().head).toBe(2);
    expect(saved).toHaveLength(1);
    expect(await cache.queued('u1', 'org-a', ID)).toEqual([]);
    expect((await cache.getDoc('u1', 'org-a', ID))?.versionNo).toBe(2);
  });

  it('Save version sends a manual save at once and cancels the pending autosave', async () => {
    database(1);
    await attach();
    edit(3000);
    expect(await sync().saveVersion('  client review ')).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toMatchObject({ kind: 'manual', message: 'client review', expectedVersionNo: 1 });
  });

  it('queues each save on the device before sending it', async () => {
    let queuedWhenSent = -1;
    save.mockImplementation(async () => {
      queuedWhenSent = (await cache.queued('u1', 'org-a', ID)).length;
      return ok(2);
    });
    await attach();
    await sync().saveVersion();
    expect(queuedWhenSent).toBe(1);
  });

  it('a viewer’s editor queues and sends nothing', async () => {
    database(1);
    await attach(true);
    edit(3000);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(await sync().saveVersion()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
    expect(await cache.queued('u1', 'org-a', ID)).toEqual([]);
  });
});

describe('errors', () => {
  it('a server error keeps the save queued; Retry resends the same key and makes one version', async () => {
    const head = database(1);
    const real = save.getMockImplementation()!;
    save.mockImplementationOnce(async (c, input) => {
      await real(c, input); // the first attempt committed, but the answer was lost
      return fail({ kind: 'server', message: 'The studio could not save: timeout' });
    });
    await attach();
    expect(await sync().saveVersion()).toBe(false);
    expect(sync()).toMatchObject({ status: 'error', canRetry: true, queuedCount: 1 });
    await sync().retry();
    expect(sync()).toMatchObject({ status: 'saved', queuedCount: 0, head: 2 });
    expect(head()).toBe(2);
    expect(save.mock.calls[0]![1].idempotencyKey).toBe(save.mock.calls[1]![1].idempotencyKey);
  });

  it('too large or archived: a fixed message, no Retry, the save leaves the queue, the design stays cached', async () => {
    save.mockResolvedValue(fail({ kind: 'too_large', message: "This design is larger than 2 MB and can't be saved to the studio." }));
    await attach();
    await sync().saveVersion();
    expect(sync()).toMatchObject({ status: 'error', canRetry: false, queuedCount: 0, error: { kind: 'too_large' } });
    expect((await cache.getDoc('u1', 'org-a', ID))?.doc).toMatchObject({ type: 'kitchen', project: { id: ID } });
  });

  it('a conflict stops the queue and names the current head', async () => {
    database(4);
    await attach(false, 3);
    await sync().saveVersion();
    expect(sync()).toMatchObject({ status: 'conflict', conflict: { currentVersionNo: 4 }, queuedCount: 1 });
  });

  it('losing edit access keeps the saves on the device and says so', async () => {
    save.mockResolvedValue(fail({ kind: 'forbidden', message: 'View only' }));
    await attach();
    await sync().saveVersion();
    expect(sync()).toMatchObject({ status: 'error', canRetry: false, queuedCount: 1, error: { message: 'You no longer have edit access to this studio. Your changes are kept on this device.' } });
  });

  it('saves left on the device from an earlier visit are sent when the project opens', async () => {
    database(1);
    await cache.enqueue({ userId: 'u1', orgId: 'org-a', projectId: ID, expectedVersionNo: 1, idempotencyKey: 'left-over', doc: { type: 'kitchen', project }, kind: 'autosave', message: '' });
    await attach();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1].idempotencyKey).toBe('left-over');
    expect(sync()).toMatchObject({ status: 'saved', head: 2 });
  });
});

describe('leaving the project', () => {
  it('an edit still waiting for its autosave is kept on the device', async () => {
    database(1);
    await attach();
    edit(3300);
    sync().detach();
    await vi.waitFor(async () => expect(await cache.queued('u1', 'org-a', ID)).toHaveLength(1));
    const [left] = await cache.queued('u1', 'org-a', ID);
    expect(left).toMatchObject({ expectedVersionNo: 1, kind: 'autosave' });
    expect((left!.doc as { project: KitchenProject }).project.room.width).toBe(3300);
    expect(save).not.toHaveBeenCalled();
  });
});

