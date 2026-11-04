import { create } from 'zustand';
import {
  commitSpaceRevision,
  evaluateSyncConflict,
  importStandaloneKitchenFile,
  importWholeHomeFile,
  type CommitRevisionResult,
} from '@/domain/project/cloudPersistence';
import type {
  DesignRevision,
  DesignSnapshot,
  IdempotencyRecord,
  LegacyImportMapping,
  LocalProjectSyncState,
  SaaSProject,
  Space,
  SpaceType,
  SyncStatus,
} from '@/domain/project/cloudTypes';
import { useEditorStore } from './editorStore';

export interface CloudProjectState {
  // Current active tenant and project context
  currentOrgId: string;
  currentProject: SaaSProject | null;
  projects: SaaSProject[];
  spaces: Space[];
  activeSpaceId: string | null;
  revisions: Record<string, DesignRevision[]>; // keyed by spaceId
  legacyMappings: LegacyImportMapping[];
  idempotencyRecords: IdempotencyRecord[];
  syncState: LocalProjectSyncState;
  isSyncing: boolean;
  syncModalOpen: boolean;

  // Actions
  setOrgId: (orgId: string) => void;
  setSyncModalOpen: (open: boolean) => void;
  createProject: (name: string, clientId?: string | null) => Promise<SaaSProject>;
  listProjects: () => SaaSProject[];
  archiveProject: (projectId: string) => Promise<void>;
  createSpace: (name: string, spaceType?: SpaceType, level?: number) => Promise<Space>;
  selectSpace: (spaceId: string) => void;
  commitCurrentDesign: (idempotencyKey?: string) => Promise<CommitRevisionResult>;
  importKitchen: (fileContent: string, projectName?: string) => Promise<{ project: SaaSProject; space: Space }>;
  importHome: (fileContent: string, projectName?: string) => Promise<{ project: SaaSProject; spaces: Space[] }>;
  checkSyncStatus: () => { status: SyncStatus; hasConflict: boolean; reason?: string };
}

const DEFAULT_ORG_ID = '00000000-0000-4000-8000-000000000001';

export const useCloudProjectStore = create<CloudProjectState>((set, get) => ({
  currentOrgId: DEFAULT_ORG_ID,
  currentProject: null,
  projects: [],
  spaces: [],
  activeSpaceId: null,
  revisions: {},
  legacyMappings: [],
  idempotencyRecords: [],
  syncState: {
    localProjectId: 'init',
    syncStatus: 'draft',
    baseRevisionId: null,
  },
  isSyncing: false,
  syncModalOpen: false,

  setOrgId: (orgId: string) => set({ currentOrgId: orgId }),
  setSyncModalOpen: (open: boolean) => set({ syncModalOpen: open }),

  createProject: async (name: string, clientId?: string | null) => {
    const { currentOrgId, projects } = get();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newProject: SaaSProject = {
      id,
      orgId: currentOrgId,
      clientId: clientId ?? null,
      name,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    set({
      projects: [newProject, ...projects],
      currentProject: newProject,
      spaces: [],
      activeSpaceId: null,
    });
    return newProject;
  },

  listProjects: () => {
    return get().projects.filter((p) => p.status !== 'deleted');
  },

  archiveProject: async (projectId: string) => {
    const now = new Date().toISOString();
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, status: 'archived', archivedAt: now, updatedAt: now } : p
      ),
      currentProject:
        state.currentProject?.id === projectId
          ? { ...state.currentProject, status: 'archived', archivedAt: now, updatedAt: now }
          : state.currentProject,
    }));
  },

  createSpace: async (name: string, spaceType: SpaceType = 'kitchen', level = 0) => {
    const { currentOrgId, currentProject, spaces } = get();
    if (!currentProject) {
      throw new Error('No active SaaS project selected.');
    }
    const spaceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newSpace: Space = {
      id: spaceId,
      orgId: currentOrgId,
      projectId: currentProject.id,
      name,
      spaceType,
      level,
      planPositionMm: { x: 0, z: 0 },
      currentRevisionId: null,
      createdAt: now,
      updatedAt: now,
    };
    set({
      spaces: [...spaces, newSpace],
      activeSpaceId: spaceId,
    });
    return newSpace;
  },

  selectSpace: (spaceId: string) => {
    const { spaces, revisions } = get();
    const targetSpace = spaces.find((s) => s.id === spaceId);
    if (!targetSpace) return;

    set({ activeSpaceId: spaceId });

    // If space has a committed revision, load its document into editorStore
    if (targetSpace.currentRevisionId) {
      const spaceRevs = revisions[spaceId] ?? [];
      const currentRev = spaceRevs.find((r) => r.id === targetSpace.currentRevisionId);
      if (currentRev && currentRev.snapshot.document) {
        useEditorStore.getState().openProject(currentRev.snapshot.document);
        set({
          syncState: {
            localProjectId: currentRev.snapshot.document.id,
            cloudProjectId: targetSpace.projectId,
            spaceId: targetSpace.id,
            baseRevisionId: currentRev.id,
            syncStatus: 'synced',
            lastSyncedAt: currentRev.createdAt,
            serverHash: currentRev.canonicalHash,
            clientHash: currentRev.canonicalHash,
          },
        });
      }
    }
  },

  commitCurrentDesign: async (idempotencyKey?: string) => {
    const { currentOrgId, currentProject, spaces, activeSpaceId, revisions, idempotencyRecords } = get();
    const editorProject = useEditorStore.getState().project;

    if (!currentProject || !activeSpaceId) {
      return { success: false, conflict: false, error: 'No active SaaS Project or Space selected.' };
    }
    if (!editorProject) {
      return { success: false, conflict: false, error: 'No active editor project document to commit.' };
    }

    const currentSpace = spaces.find((s) => s.id === activeSpaceId);
    if (!currentSpace) {
      return { success: false, conflict: false, error: 'Active space not found.' };
    }

    set({ isSyncing: true });

    const snapshot: DesignSnapshot = {
      format: 'interior-studio/kitchen',
      schemaVersion: 2,
      document: editorProject,
    };

    const expectedRevisionId = currentSpace.currentRevisionId ?? null;
    const existingRevs = revisions[activeSpaceId] ?? [];

    const result = commitSpaceRevision(
      currentSpace,
      existingRevs,
      idempotencyRecords,
      {
        orgId: currentOrgId,
        projectId: currentProject.id,
        spaceId: activeSpaceId,
        expectedRevisionId,
        snapshot,
        idempotencyKey,
      }
    );

    if (result.success) {
      const updatedSpace = result.updatedSpace;
      const newRev = result.revision;

      set((state) => ({
        spaces: state.spaces.map((s) => (s.id === activeSpaceId ? updatedSpace : s)),
        revisions: {
          ...state.revisions,
          [activeSpaceId]: [...(state.revisions[activeSpaceId] ?? []), newRev],
        },
        syncState: {
          localProjectId: editorProject.id,
          cloudProjectId: currentProject.id,
          spaceId: activeSpaceId,
          baseRevisionId: newRev.id,
          syncStatus: 'synced',
          lastSyncedAt: newRev.createdAt,
          serverHash: newRev.canonicalHash,
          clientHash: newRev.canonicalHash,
        },
        isSyncing: false,
      }));
    } else {
      set({ isSyncing: false });
    }

    return result;
  },

  importKitchen: async (fileContent: string, projectName?: string) => {
    const { currentOrgId, projects, spaces, revisions, legacyMappings } = get();
    const imported = importStandaloneKitchenFile(fileContent, {
      orgId: currentOrgId,
      projectName,
    });

    set({
      projects: [imported.project, ...projects],
      currentProject: imported.project,
      spaces: [...spaces, imported.space],
      activeSpaceId: imported.space.id,
      revisions: {
        ...revisions,
        [imported.space.id]: [imported.revision],
      },
      legacyMappings: [...legacyMappings, imported.mapping],
    });

    // Open imported document into editorStore
    useEditorStore.getState().openProject(imported.revision.snapshot.document);

    return { project: imported.project, space: imported.space };
  },

  importHome: async (fileContent: string, projectName?: string) => {
    const { currentOrgId, projects, spaces, revisions, legacyMappings } = get();
    const imported = importWholeHomeFile(fileContent, {
      orgId: currentOrgId,
      projectName,
    });

    const newRevisions = { ...revisions };
    for (const rev of imported.revisions) {
      newRevisions[rev.spaceId] = [rev];
    }

    const firstSpace = imported.spaces[0]!;

    set({
      projects: [imported.project, ...projects],
      currentProject: imported.project,
      spaces: [...spaces, ...imported.spaces],
      activeSpaceId: firstSpace.id,
      revisions: newRevisions,
      legacyMappings: [...legacyMappings, ...imported.mappings],
    });

    // Open first room into editor
    const firstRev = imported.revisions[0]!;
    useEditorStore.getState().openProject(firstRev.snapshot.document);

    return { project: imported.project, spaces: imported.spaces };
  },

  checkSyncStatus: () => {
    const { activeSpaceId, revisions, syncState } = get();
    if (!activeSpaceId) {
      return { status: 'draft', hasConflict: false };
    }
    const spaceRevs = revisions[activeSpaceId] ?? [];
    const latestRevision = spaceRevs[spaceRevs.length - 1] ?? null;
    return evaluateSyncConflict(syncState, latestRevision);
  },
}));
