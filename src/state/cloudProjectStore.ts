import { create } from 'zustand';
import { InMemoryPersistenceAdapter } from '@/infrastructure/persistence/inMemoryPersistenceAdapter';
import type { CloudPersistencePort } from '@/domain/project/cloudPersistencePort';
import {
  evaluateSyncConflict,
  type CommitRevisionResult,
} from '@/domain/project/cloudPersistence';
import { CloudPersistenceError } from '@/domain/project/cloudErrors';
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

let activePersistenceAdapter: CloudPersistencePort = new InMemoryPersistenceAdapter();

export function setPersistenceAdapter(adapter: CloudPersistencePort) {
  activePersistenceAdapter = adapter;
}

export function getPersistenceAdapter(): CloudPersistencePort {
  return activePersistenceAdapter;
}

export interface CloudProjectState {
  // Current active tenant and verified actor context (Feature 034.2 FR-01, Feature 034.2.2 FR-03)
  currentOrgId: string | null;
  activeActorId: string | null;
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
  setOrgId: (orgId: string | null) => void;
  setActiveActor: (actorId: string | null) => void;
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
  resolveConflictReloadRemote: () => Promise<void>;
  resolveConflictForkLocalDraft: (newSpaceName?: string) => Promise<Space>;
}

export const useCloudProjectStore = create<CloudProjectState>((set, get) => ({
  currentOrgId: null,
  activeActorId: null,
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

  setOrgId: (orgId: string | null) => set({ currentOrgId: orgId }),
  setActiveActor: (actorId: string | null) => set({ activeActorId: actorId }),
  setSyncModalOpen: (open: boolean) => set({ syncModalOpen: open }),

  createProject: async (name: string, clientId?: string | null) => {
    const { currentOrgId, projects, activeActorId } = get();
    if (!currentOrgId) {
      throw CloudPersistenceError.orgMembershipRequired('Active organization membership is required for cloud operations.');
    }
    if (!activeActorId) {
      throw CloudPersistenceError.unauthenticated('Active authenticated user required for cloud operations.');
    }

    const newProject = await activePersistenceAdapter.createProject({
      orgId: currentOrgId,
      actorId: activeActorId,
      name,
      clientId: clientId ?? null,
    });

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
    const { currentOrgId, activeActorId } = get();
    if (!currentOrgId) {
      throw CloudPersistenceError.orgMembershipRequired('Active organization membership is required for cloud operations.');
    }
    if (!activeActorId) {
      throw CloudPersistenceError.unauthenticated('Active authenticated user required for cloud operations.');
    }

    const updated = await activePersistenceAdapter.archiveProject({
      orgId: currentOrgId,
      actorId: activeActorId,
      projectId,
    });

    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? updated : p)),
      currentProject: state.currentProject?.id === projectId ? updated : state.currentProject,
    }));
  },

  createSpace: async (name: string, spaceType: SpaceType = 'kitchen', level = 0) => {
    const { currentOrgId, currentProject, spaces, activeActorId } = get();
    if (!currentOrgId) {
      throw CloudPersistenceError.orgMembershipRequired('Active organization membership is required for cloud operations.');
    }
    if (!activeActorId) {
      throw CloudPersistenceError.unauthenticated('Active authenticated user required for cloud operations.');
    }
    if (!currentProject) {
      throw new Error('No active SaaS project selected.');
    }

    const newSpace = await activePersistenceAdapter.createSpace({
      orgId: currentOrgId,
      actorId: activeActorId,
      projectId: currentProject.id,
      name,
      type: spaceType,
      level,
    });

    set({
      spaces: [...spaces, newSpace],
      activeSpaceId: newSpace.id,
      syncState: {
        ...get().syncState,
        spaceId: newSpace.id,
        baseRevisionId: null,
        syncStatus: 'draft',
      },
    });
    return newSpace;
  },

  selectSpace: (spaceId: string) => {
    const { spaces, revisions } = get();
    const targetSpace = spaces.find((s) => s.id === spaceId);
    if (!targetSpace) return;

    set({ activeSpaceId: spaceId });

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
    const { currentOrgId, currentProject, spaces, activeSpaceId, syncState, activeActorId } = get();
    const editorProject = useEditorStore.getState().project;

    if (!currentOrgId) {
      return {
        success: false,
        conflict: false,
        error: CloudPersistenceError.orgMembershipRequired('Active organization membership is required for cloud operations.').message,
      };
    }
    if (!activeActorId) {
      return { success: false, conflict: false, error: 'Authentication required. No active actor.' };
    }
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

    const expectedRevisionId =
      (syncState.spaceId === activeSpaceId
        ? syncState.baseRevisionId
        : currentSpace.currentRevisionId) ?? null;

    const outcome = await activePersistenceAdapter.commitDesignRevision({
      orgId: currentOrgId,
      actorId: activeActorId,
      projectId: currentProject.id,
      spaceId: activeSpaceId,
      expectedRevisionId,
      snapshot,
      idempotencyKey: idempotencyKey || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    });

    if (outcome.success) {
      const updatedSpace = outcome.updatedSpace;
      const newRev = outcome.revision;

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

      return {
        success: true,
        revision: outcome.revision,
        updatedSpace: outcome.updatedSpace,
        idempotencyRecord: outcome.idempotencyRecord,
        conflict: false,
      };
    } else if (outcome.conflict) {
      // CAS Conflict: preserve local draft, mark conflict state
      set((state) => ({
        isSyncing: false,
        syncState: {
          ...state.syncState,
          syncStatus: 'conflict',
        },
      }));

      return {
        success: false,
        conflict: true,
        reason: 'CAS_MISMATCH',
        currentRevisionId: outcome.currentRevisionId,
      };
    } else {
      set({ isSyncing: false });
      return {
        success: false,
        conflict: false,
        reason: 'IDEMPOTENCY_CONFLICT',
        error: outcome.error,
      };
    }
  },

  importKitchen: async (fileContent: string, projectName?: string) => {
    const { currentOrgId, projects, spaces, revisions, activeActorId } = get();
    if (!currentOrgId) {
      throw CloudPersistenceError.orgMembershipRequired('Active organization membership is required for cloud operations.');
    }
    if (!activeActorId) {
      throw CloudPersistenceError.unauthenticated('Active authenticated user required for cloud operations.');
    }

    const imported = await activePersistenceAdapter.importKitchen({
      orgId: currentOrgId,
      actorId: activeActorId,
      fileContent,
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
    });

    if (imported.revision.snapshot.document) {
      useEditorStore.getState().openProject(imported.revision.snapshot.document);
    }

    return { project: imported.project, space: imported.space };
  },

  importHome: async (fileContent: string, projectName?: string) => {
    const { currentOrgId, projects, spaces, revisions, activeActorId } = get();
    if (!currentOrgId) {
      throw CloudPersistenceError.orgMembershipRequired('Active organization membership is required for cloud operations.');
    }
    if (!activeActorId) {
      throw CloudPersistenceError.unauthenticated('Active authenticated user required for cloud operations.');
    }

    const imported = await activePersistenceAdapter.importHome({
      orgId: currentOrgId,
      actorId: activeActorId,
      fileContent,
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
    });

    const firstRev = imported.revisions[0]!;
    if (firstRev.snapshot.document) {
      useEditorStore.getState().openProject(firstRev.snapshot.document);
    }

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

  resolveConflictReloadRemote: async () => {
    const { activeSpaceId, currentOrgId, revisions } = get();
    if (!activeSpaceId || !currentOrgId) return;

    const space = await activePersistenceAdapter.getSpace({ orgId: currentOrgId, spaceId: activeSpaceId });
    if (!space || !space.currentRevisionId) return;

    // Fetch authoritative remote revision over the wire via getRevision() (Feature 034.2 FR-07)
    const remoteRev = await activePersistenceAdapter.getRevision({
      orgId: currentOrgId,
      revisionId: space.currentRevisionId,
    });

    if (remoteRev?.snapshot.document) {
      useEditorStore.getState().openProject(remoteRev.snapshot.document);
      const spaceRevs = revisions[activeSpaceId] ?? [];
      const updatedRevs = [
        ...spaceRevs.filter((r) => r.id !== remoteRev.id),
        remoteRev,
      ];
      set({
        revisions: {
          ...revisions,
          [activeSpaceId]: updatedRevs,
        },
        syncState: {
          localProjectId: remoteRev.snapshot.document.id,
          cloudProjectId: space.projectId,
          spaceId: space.id,
          baseRevisionId: remoteRev.id,
          syncStatus: 'synced',
          lastSyncedAt: remoteRev.createdAt,
          serverHash: remoteRev.canonicalHash,
          clientHash: remoteRev.canonicalHash,
        },
      });
    }
  },

  resolveConflictForkLocalDraft: async (newSpaceName = 'Kitchen (Branch)') => {
    const { createSpace, commitCurrentDesign } = get();
    const newSpace = await createSpace(newSpaceName, 'kitchen', 0);
    await commitCurrentDesign();
    return newSpace;
  },
}));
