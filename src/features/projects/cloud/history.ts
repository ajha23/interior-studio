/**
 * Version history of the open studio project (spec 043, US5). Opening a past version shows it
 * read-only with a banner; nothing is saved from it. "Back to latest" reopens the head; "Restore"
 * saves that version as a new `restore` version on top of the head, so nothing is ever deleted.
 */
import { create } from 'zustand';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import { useEditorStore } from '@/state/editorStore';
import { useHomeStore } from '@/state/homeStore';
import { canEdit, currentStudio } from './studioContext';
import { useSyncStore } from './sync';

export interface ViewedVersion {
  version: cloud.VersionRow;
  doc: cloud.CloudDoc;
}

interface HistoryState {
  open: boolean;
  viewing: ViewedVersion | null;
  error: string | null;
  setOpen: (open: boolean) => void;
  /** Shows a past version read-only. */
  view: (version: cloud.VersionRow) => Promise<boolean>;
  /** Leaves the past version and reopens the newest one. */
  backToLatest: () => Promise<boolean>;
  /** Saves the version being viewed as a new version on top of the head. */
  restore: () => Promise<boolean>;
}

function show(doc: cloud.CloudDoc, readOnly: boolean) {
  if (doc.type === 'kitchen') {
    useEditorStore.getState().openProject(doc.project, { readOnly });
  } else {
    useEditorStore.getState().closeProject();
    useHomeStore.getState().openDocument(doc.home, { readOnly });
  }
}

const editable = () => {
  const studio = currentStudio();
  return Boolean(studio && canEdit(studio.role));
};

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  open: false,
  viewing: null,
  error: null,
  setOpen: (open) => set({ open, error: null }),

  view: async (version) => {
    const studio = currentStudio();
    const projectId = useSyncStore.getState().projectId;
    if (!studio || !projectId) return false;
    const read = await cloud.openVersion(studio.client, projectId, version.versionNo);
    if (!read.ok) {
      set({ error: read.error.message });
      return false;
    }
    show(read.value.doc, true);
    set({ viewing: { version, doc: read.value.doc }, error: null, open: false });
    return true;
  },

  backToLatest: async () => {
    const studio = currentStudio();
    const projectId = useSyncStore.getState().projectId;
    if (!studio || !projectId) return false;
    const read = await cloud.openHead(studio.client, projectId);
    if (!read.ok) {
      set({ error: read.error.message });
      return false;
    }
    show(read.value.doc, !editable());
    set({ viewing: null, error: null });
    return true;
  },

  restore: async () => {
    const viewing = get().viewing;
    if (!viewing || !editable()) return false;
    // The past version becomes the open, editable document; the controller saves it on top.
    show(viewing.doc, false);
    const ok = await useSyncStore.getState().saveVersion(`Restored version ${viewing.version.versionNo}`, 'restore');
    if (!ok) {
      set({ error: useSyncStore.getState().error?.message ?? 'The version was not restored.' });
      return false;
    }
    set({ viewing: null, error: null });
    return true;
  },
}));

/** Leaving the project (or the studio) forgets the version on screen. */
useSyncStore.subscribe((s, prev) => {
  if (s.projectId !== prev.projectId) useHistoryStore.setState({ viewing: null, open: false, error: null });
});
