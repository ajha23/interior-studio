/**
 * Saving the open studio project (spec 043, contracts/client-sync.md).
 *
 * - Autosave: 2 s after the last change, the document is queued as an `autosave`.
 * - Save version (Ctrl+S, TopBar, command palette, command line): a `manual` save, at once.
 * - Every save is written to the device queue before it is sent, then sent in order with its
 *   idempotency key and the head it expects. A retry resends the same entry, so it can never
 *   create a second version.
 * - The status is always exactly one of: saved, saving, offline, conflict, error (FR-010).
 *
 * The controller knows nothing about the editor: whoever attaches it says how to read the
 * document, how to mark it saved and how to watch it for changes (see useCloudDocument.ts).
 */
import { create } from 'zustand';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';
import * as cache from '@/persistence/cloudCache';

export const AUTOSAVE_DELAY_MS = 2000;

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'conflict' | 'error';

export interface AttachOptions {
  client: AppSupabaseClient;
  userId: string;
  orgId: string;
  projectId: string;
  name: string;
  /** The head this device last saw (opened, or saved). */
  head: number;
  /** Viewers and past versions: nothing is watched, queued or sent. */
  readOnly: boolean;
  /** The document as it is now. */
  read: () => cloud.CloudDoc | null;
  /** Called when `doc`, the newest document queued in this tab, has reached the studio. */
  markSaved: (doc: cloud.CloudDoc) => void;
  /** Calls `onChange` after every edit of the document; returns a function that stops watching. */
  watch: (onChange: () => void) => () => void;
}

interface SyncState {
  status: SyncStatus;
  /** Saves waiting on this device for the open project. */
  queuedCount: number;
  error: cloud.CloudError | null;
  /** Whether Retry can help (network and server errors) or not (too large, archived). */
  canRetry: boolean;
  /** The head in the database when a save was refused because someone else saved first. */
  conflict: { currentVersionNo: number | null } | null;
  head: number;
  projectId: string | null;
  readOnly: boolean;
  attach: (options: AttachOptions) => Promise<void>;
  detach: () => void;
  /** Queues the document now (a manual save, or a restore); returns whether it reached the studio. */
  saveVersion: (message?: string, kind?: cloud.VersionKind) => Promise<boolean>;
  retry: () => Promise<void>;
}

const idle = { status: 'saved' as SyncStatus, queuedCount: 0, error: null, canRetry: false, conflict: null, head: 0, projectId: null, readOnly: false };

let options: AttachOptions | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let stopWatching: (() => void) | null = null;
let draining: Promise<void> | null = null;
let again = false;
/** The documents queued in this tab, by queue entry, so a save marks the very object it sent. */
const sentDocs = new Map<number, cloud.CloudDoc>();
let lastQueued: cloud.CloudDoc | null = null;

const onOnline = () => void useSyncStore.getState().retry();
const onOffline = () => {
  if (useSyncStore.getState().queuedCount > 0) useSyncStore.setState({ status: 'offline' });
};

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

async function refreshCount(o: AttachOptions) {
  const waiting = await cache.queued(o.userId, o.orgId, o.projectId);
  if (options === o) useSyncStore.setState({ queuedCount: waiting.length });
  return waiting;
}

/** Writes the document to the device queue, chained after the saves already waiting. */
async function enqueue(o: AttachOptions, kind: cloud.VersionKind, message: string): Promise<boolean> {
  const doc = o.read();
  if (!doc) return false;
  const head = useSyncStore.getState().head;
  const waiting = await cache.queued(o.userId, o.orgId, o.projectId);
  const seq = await cache.enqueue({
    userId: o.userId,
    orgId: o.orgId,
    projectId: o.projectId,
    expectedVersionNo: head + waiting.length,
    idempotencyKey: crypto.randomUUID(),
    doc,
    kind,
    message,
  });
  sentDocs.set(seq, doc);
  lastQueued = doc;
  await refreshCount(o);
  return true;
}

/**
 * Sends waiting saves in order until the queue is empty or one is refused. A save queued while a
 * drain is finishing is not left behind: the drain runs again once it has emptied the queue.
 */
function drain(o: AttachOptions): Promise<void> {
  if (draining) {
    again = true;
    return draining;
  }
  draining = (async () => {
    try {
      do {
        again = false;
        if (!(await drainOnce(o))) return;
      } while (again && options === o);
    } finally {
      draining = null;
    }
  })();
  return draining;
}

/** Returns true when it emptied the queue; false when it stopped (offline, refused, detached). */
async function drainOnce(o: AttachOptions): Promise<boolean> {
  for (;;) {
    if (options !== o) return false;
    const [next] = await refreshCount(o);
    if (!next) {
      useSyncStore.setState({ status: timer ? 'saving' : 'saved', error: null, canRetry: false });
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      useSyncStore.setState({ status: 'offline' });
      return false;
    }
    useSyncStore.setState({ status: 'saving' });
    const result = await cloud.saveVersion(o.client, {
      projectId: o.projectId,
      expectedVersionNo: next.expectedVersionNo,
      idempotencyKey: next.idempotencyKey,
      doc: next.doc,
      kind: next.kind,
      message: next.message,
    });
    if (options !== o) return false;
    if (result.ok) {
      await cache.remove(next.seq);
      const doc = sentDocs.get(next.seq) ?? next.doc;
      sentDocs.delete(next.seq);
      useSyncStore.setState({ head: result.value.versionNo });
      await cache.putDoc({ userId: o.userId, orgId: o.orgId, projectId: o.projectId, versionNo: result.value.versionNo, doc, name: o.name });
      if (doc === lastQueued) o.markSaved(doc);
      continue;
    }
    const error = result.error;
    if (error.kind === 'offline') {
      useSyncStore.setState({ status: 'offline', error });
      return false;
    }
    if (error.kind === 'conflict') {
      useSyncStore.setState({ status: 'conflict', error, conflict: { currentVersionNo: error.currentVersionNo ?? null } });
      return false;
    }
    if (error.kind === 'too_large' || error.kind === 'archived' || error.kind === 'invalid') {
      // These can never succeed: the save leaves the queue; the design stays on this device.
      await cache.remove(next.seq);
      sentDocs.delete(next.seq);
      await cache.putDoc({ userId: o.userId, orgId: o.orgId, projectId: o.projectId, versionNo: useSyncStore.getState().head, doc: next.doc, name: o.name });
      await refreshCount(o);
      useSyncStore.setState({ status: 'error', error, canRetry: false });
      return false;
    }
    if (error.kind === 'forbidden' || error.kind === 'not_found') {
      useSyncStore.setState({ status: 'error', canRetry: false, error: { ...error, message: 'You no longer have edit access to this studio. Your changes are kept on this device.' } });
      return false;
    }
    useSyncStore.setState({ status: 'error', error, canRetry: true });
    return false;
  }
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  ...idle,

  attach: async (o) => {
    get().detach();
    options = o;
    set({ ...idle, head: o.head, projectId: o.projectId, readOnly: o.readOnly });
    if (o.readOnly) return;
    stopWatching = o.watch(() => {
      if (options !== o) return;
      clearTimer();
      if (get().status !== 'conflict') set({ status: 'saving' });
      timer = setTimeout(() => {
        timer = null;
        void enqueue(o, 'autosave', '').then(() => drain(o));
      }, AUTOSAVE_DELAY_MS);
    });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // Saves left from an earlier visit (a reload, a crash, a session offline) go first.
    await drain(o);
  },

  detach: () => {
    // An edit still waiting for its autosave is kept: it goes to the device queue and is sent the
    // next time this project opens.
    if (timer && options && !options.readOnly) void enqueue(options, 'autosave', '');
    clearTimer();
    stopWatching?.();
    stopWatching = null;
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    options = null;
    sentDocs.clear();
    lastQueued = null;
    set({ ...idle });
  },

  saveVersion: async (message = '', kind = 'manual') => {
    const o = options;
    if (!o || o.readOnly) return false;
    clearTimer();
    if (!(await enqueue(o, kind, message.trim().slice(0, 500)))) return false;
    await drain(o);
    return options === o && get().queuedCount === 0 && get().status === 'saved';
  },

  retry: async () => {
    const o = options;
    if (!o || o.readOnly) return;
    set({ error: null, canRetry: false });
    await drain(o);
  },
}));
