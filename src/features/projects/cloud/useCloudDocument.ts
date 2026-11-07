/**
 * Opens a studio project by its address (spec 043, US1, FR-011a, FR-013).
 *
 * Online, the head comes from the database and is cached on this device; offline (or when the
 * request fails for lack of a network), the cached copy opens with a banner. A project that is
 * missing and one in another studio look the same. Once open, the sync controller is attached:
 * autosave for editors, nothing for viewers.
 */
import { useEffect, useState } from 'react';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import * as cache from '@/persistence/cloudCache';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { canEdit, type StudioContext } from './studioContext';
import { useSyncStore, type AttachOptions } from './sync';

export type CloudDocState =
  | { status: 'loading' }
  | { status: 'ready'; readOnly: boolean; offline: boolean; name: string }
  | { status: 'error'; message: string };

export const OFFLINE_COPY_BANNER = 'Offline — showing the copy on this device';

const NOT_HERE = "This project isn't in this studio.";

function bindings(projectId: string, type: cloud.DocType): Pick<AttachOptions, 'read' | 'markSaved' | 'watch' | 'load'> {
  if (type === 'kitchen') {
    return {
      read: () => {
        const p = useEditorStore.getState().project;
        return p && p.id === projectId ? { type: 'kitchen', project: p } : null;
      },
      markSaved: (doc) => {
        if (doc.type === 'kitchen' && useEditorStore.getState().project?.id === projectId) useEditorStore.getState().markSaved(doc.project);
      },
      // "Load theirs": their version replaces mine, with a fresh undo history.
      load: (doc) => {
        if (doc.type === 'kitchen') useEditorStore.getState().openProject(doc.project);
      },
      watch: (onChange) =>
        useEditorStore.subscribe((s, prev) => {
          if (s.revision !== prev.revision && s.project?.id === projectId && s.project !== s.savedProject) onChange();
        }),
    };
  }
  return {
    read: () => {
      const h = useHomeStore.getState().home;
      return h && h.id === projectId ? { type: 'home', home: h } : null;
    },
    markSaved: (doc) => {
      if (doc.type === 'home') useHomeStore.getState().markSaved(doc.home);
    },
    load: (doc) => {
      if (doc.type !== 'home') return;
      const store = useHomeStore.getState();
      const room = store.roomId;
      store.openDocument(doc.home);
      if (room && !useHomeStore.getState().enterRoom(room)) useEditorStore.getState().closeProject();
    },
    watch: (onChange) =>
      useHomeStore.subscribe((s, prev) => {
        if (s.home !== prev.home && s.home?.id === projectId && s.dirty) onChange();
      }),
  };
}

function show(doc: cloud.CloudDoc, readOnly: boolean) {
  if (doc.type === 'kitchen') {
    useHomeStore.getState().close();
    useEditorStore.getState().openProject(doc.project, { readOnly });
  } else {
    useEditorStore.getState().closeProject();
    useHomeStore.getState().openDocument(doc.home, { readOnly });
  }
}

/** Opens the studio project `projectId` (expected to be a `type`) and keeps it saved. */
export function useCloudDocument(studio: StudioContext, projectId: string, type: cloud.DocType): CloudDocState {
  const [state, setState] = useState<CloudDocState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const readOnly = !canEdit(studio.role);

    void (async () => {
      let opened: { versionNo: number; doc: cloud.CloudDoc } | null = null;
      let offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!offline) {
        const head = await cloud.openHead(studio.client, projectId);
        if (cancelled) return;
        if (head.ok) {
          opened = head.value;
          await cache.putDoc({ userId: studio.userId, orgId: studio.orgId, projectId, versionNo: head.value.versionNo, doc: head.value.doc, name: nameOf(head.value.doc) });
        } else if (head.error.kind === 'offline') {
          offline = true;
        } else {
          setState({ status: 'error', message: head.error.kind === 'forbidden' || head.error.kind === 'not_found' ? NOT_HERE : head.error.message });
          return;
        }
      }
      if (!opened) {
        const copy = await cache.getDoc(studio.userId, studio.orgId, projectId);
        if (cancelled) return;
        if (!copy) {
          setState({ status: 'error', message: "You're offline and this project has not been opened on this device yet." });
          return;
        }
        opened = { versionNo: copy.versionNo, doc: copy.doc };
      }
      // Saves still waiting on this device are newer than the head: show the newest of them, so
      // later edits build on it (the controller sends them, in order, once attached).
      const waiting = await cache.queued(studio.userId, studio.orgId, projectId);
      if (cancelled) return;
      const newest = waiting.at(-1);
      if (newest) opened = { versionNo: opened.versionNo, doc: newest.doc };
      if (opened.doc.type !== type) {
        setState({ status: 'error', message: NOT_HERE });
        return;
      }
      show(opened.doc, readOnly);
      setState({ status: 'ready', readOnly, offline, name: nameOf(opened.doc) });
      await useSyncStore.getState().attach({
        client: studio.client,
        userId: studio.userId,
        orgId: studio.orgId,
        projectId,
        name: nameOf(opened.doc),
        head: opened.versionNo,
        readOnly,
        ...bindings(projectId, type),
      });
    })();

    return () => {
      cancelled = true;
      if (useSyncStore.getState().projectId === projectId) useSyncStore.getState().detach();
    };
  }, [studio, projectId, type]);

  // Back online: the banner goes, and waiting saves are sent (the controller listens too).
  useEffect(() => {
    const online = () => setState((s) => (s.status === 'ready' && s.offline ? { ...s, offline: false } : s));
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);

  return state;
}

const nameOf = (doc: cloud.CloudDoc) => (doc.type === 'kitchen' ? doc.project.name : doc.home.name);
