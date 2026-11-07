/**
 * The device's copy of studio projects (spec 043, FR-011 and FR-011a), in the same IndexedDB
 * database as the device projects:
 * - `cloud_docs`: the last opened or saved copy of each studio project, so it opens offline;
 * - `cloud_lists`: the last project list of each studio, for the Projects page offline;
 * - `cloud_queue`: saves waiting to be sent, in order. Each is written before it is sent, so a
 *   reload or a crash loses nothing.
 * Everything is keyed by user and studio and cleared on sign-out. The database decides what is
 * saved; this is only a cache.
 */
import type { CloudDoc, VersionKind } from '@/infrastructure/projects/cloudProjects';
import { CLOUD_DOCS, CLOUD_LISTS, CLOUD_QUEUE, openLocalDb } from './projectDb';

export interface CachedDoc {
  userId: string;
  orgId: string;
  projectId: string;
  versionNo: number;
  doc: CloudDoc;
  name: string;
  cachedAt?: string;
}

export interface CachedList<Row> {
  userId: string;
  orgId: string;
  rows: Row[];
  cachedAt: string;
}

export interface QueueInput {
  userId: string;
  orgId: string;
  projectId: string;
  expectedVersionNo: number;
  idempotencyKey: string;
  doc: CloudDoc;
  kind: VersionKind;
  message: string;
}

export interface QueueEntry extends QueueInput {
  seq: number;
  queuedAt: string;
}

function run<T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return openLocalDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const req = body(tx);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error ?? new Error('Local storage request failed.'));
        tx.onabort = () => reject(tx.error ?? new Error('Local storage request was aborted.'));
      }),
  );
}

/** Visits every record of `store` whose index `index` equals `key`. */
function eachIn(tx: IDBTransaction, store: string, index: string, key: IDBValidKey, visit: (cursor: IDBCursorWithValue) => void): void {
  const req = tx.objectStore(store).index(index).openCursor(IDBKeyRange.only(key));
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    visit(cursor);
    cursor.continue();
  };
}

export async function putDoc(entry: CachedDoc): Promise<void> {
  await run([CLOUD_DOCS], 'readwrite', (tx) => tx.objectStore(CLOUD_DOCS).put({ ...entry, cachedAt: new Date().toISOString() }));
}

export async function getDoc(userId: string, orgId: string, projectId: string): Promise<CachedDoc | null> {
  return ((await run<CachedDoc>([CLOUD_DOCS], 'readonly', (tx) => tx.objectStore(CLOUD_DOCS).get([userId, orgId, projectId]))) ?? null) as CachedDoc | null;
}

/** Every studio project with a copy on this device, for this user and studio. */
export async function docsFor(userId: string, orgId: string): Promise<CachedDoc[]> {
  const all = ((await run<CachedDoc[]>([CLOUD_DOCS], 'readonly', (tx) => tx.objectStore(CLOUD_DOCS).index('userId').getAll(IDBKeyRange.only(userId)))) ?? []) as CachedDoc[];
  return all.filter((d) => d.orgId === orgId);
}

export async function putList<Row>(userId: string, orgId: string, rows: Row[]): Promise<void> {
  await run([CLOUD_LISTS], 'readwrite', (tx) => tx.objectStore(CLOUD_LISTS).put({ userId, orgId, rows, cachedAt: new Date().toISOString() }));
}

export async function getList<Row>(userId: string, orgId: string): Promise<CachedList<Row> | null> {
  return ((await run<CachedList<Row>>([CLOUD_LISTS], 'readonly', (tx) => tx.objectStore(CLOUD_LISTS).get([userId, orgId]))) ?? null) as CachedList<Row> | null;
}

/** Queues a save; returns its sequence number. */
export async function enqueue(input: QueueInput): Promise<number> {
  return (await run<IDBValidKey>([CLOUD_QUEUE], 'readwrite', (tx) => tx.objectStore(CLOUD_QUEUE).add({ ...input, queuedAt: new Date().toISOString() }))) as number;
}

/** Waiting saves for a user and studio (and one project, if given), oldest first. */
export async function queued(userId: string, orgId: string, projectId?: string): Promise<QueueEntry[]> {
  const all = ((await run<QueueEntry[]>([CLOUD_QUEUE], 'readonly', (tx) => tx.objectStore(CLOUD_QUEUE).index('userId').getAll(IDBKeyRange.only(userId)))) ?? []) as QueueEntry[];
  return all.filter((e) => e.orgId === orgId && (projectId === undefined || e.projectId === projectId)).sort((a, b) => a.seq - b.seq);
}

export async function remove(seq: number): Promise<void> {
  await run([CLOUD_QUEUE], 'readwrite', (tx) => tx.objectStore(CLOUD_QUEUE).delete(seq));
}

/** After "Save mine on top": the waiting saves follow the new head, in order. */
export async function rebase(userId: string, orgId: string, projectId: string, head: number): Promise<void> {
  const waiting = await queued(userId, orgId, projectId);
  await run([CLOUD_QUEUE], 'readwrite', (tx) => {
    waiting.forEach((e, i) => tx.objectStore(CLOUD_QUEUE).put({ ...e, expectedVersionNo: head + i }));
  });
}

/** After "Load theirs": this project's waiting saves are discarded. */
export async function dropQueue(userId: string, orgId: string, projectId: string): Promise<void> {
  const waiting = await queued(userId, orgId, projectId);
  await run([CLOUD_QUEUE], 'readwrite', (tx) => {
    for (const e of waiting) tx.objectStore(CLOUD_QUEUE).delete(e.seq);
  });
}

/** Sign-out: every copy, list and waiting save of this user goes. Device projects stay. */
export async function clearUser(userId: string): Promise<void> {
  await run([CLOUD_DOCS, CLOUD_LISTS, CLOUD_QUEUE], 'readwrite', (tx) => {
    for (const store of [CLOUD_DOCS, CLOUD_LISTS, CLOUD_QUEUE]) eachIn(tx, store, 'userId', userId, (c) => c.delete());
  });
}
