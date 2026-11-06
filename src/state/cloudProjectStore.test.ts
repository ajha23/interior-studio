import { beforeEach, describe, expect, it } from 'vitest';
import { createExampleProject } from '@/domain/project/presets';
import { serializeHome, serializeProject, type Home } from '@/domain';
import { setPersistenceAdapter, useCloudProjectStore } from './cloudProjectStore';
import { useEditorStore } from './editorStore';
import { InMemoryPersistenceAdapter } from '@/infrastructure/persistence/inMemoryPersistenceAdapter';
import { OTHER_TEST_ORG_ID, TEST_ACTOR_ID, TEST_ORG_ID } from '@/test/ids';

describe('useCloudProjectStore (Feature 034 State & Integration Tests)', () => {
  beforeEach(() => {
    setPersistenceAdapter(new InMemoryPersistenceAdapter());
    useEditorStore.setState({
      project: createExampleProject(),
      selectedId: null,
    });
    useCloudProjectStore.setState({
      readinessState: 'ready',
      currentOrgId: TEST_ORG_ID,
      activeActorId: TEST_ACTOR_ID,
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
    });
  });

  it('creates SaaS project and spaces within tenant boundary', async () => {
    const store = useCloudProjectStore.getState();
    const project = await store.createProject('Ocean View Residence');

    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(project.name).toBe('Ocean View Residence');
    expect(useCloudProjectStore.getState().currentProject?.id).toBe(project.id);

    const space = await store.createSpace('Gourmet Kitchen', 'kitchen', 0);
    expect(space.projectId).toBe(project.id);
    expect(space.spaceType).toBe('kitchen');
    expect(useCloudProjectStore.getState().activeSpaceId).toBe(space.id);
  });

  it('commits design revision atomically and updates current revision pointer', async () => {
    const store = useCloudProjectStore.getState();
    await store.createProject('Skyline Penthouse');
    const space = await store.createSpace('Kitchen Suite');

    const result = await store.commitCurrentDesign();
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.revision.spaceId).toBe(space.id);
      expect(result.revision.canonicalHash).toHaveLength(64);

      // Verify space pointer advanced
      const updatedSpace = useCloudProjectStore.getState().spaces.find((s) => s.id === space.id);
      expect(updatedSpace?.currentRevisionId).toBe(result.revision.id);

      // Verify sync state updated
      const syncState = useCloudProjectStore.getState().syncState;
      expect(syncState.baseRevisionId).toBe(result.revision.id);
      expect(syncState.syncStatus).toBe('synced');
    }
  });

  it('imports standalone kitchen file and opens document in editor', async () => {
    const example = createExampleProject();
    example.name = 'Nordic Modern Kitchen';
    const file = serializeProject(example);

    const store = useCloudProjectStore.getState();
    const imported = await store.importKitchen(file, 'Imported Nordic Residence');

    expect(imported.project.name).toBe('Imported Nordic Residence');
    expect(imported.space.spaceType).toBe('kitchen');

    // Verify active in editorStore
    const activeEditorProject = useEditorStore.getState().project;
    expect(activeEditorProject?.name).toBe('Nordic Modern Kitchen');
    expect(activeEditorProject?.cabinets.length).toBe(example.cabinets.length);
  });

  it('imports whole-home file creating multi-space SaaS structure', async () => {
    const kitchenProject = createExampleProject();
    const bedroomProject = createExampleProject();
    bedroomProject.id = 'bed-1';
    bedroomProject.name = 'Master Suite';

    const home: Home = {
      schemaVersion: 1,
      id: 'home-villa-777',
      name: 'Contemporary Villa 2BHK',
      kind: 'villa',
      bhk: 2,
      plot: { width: 12000, length: 18000 },
      levels: 2,
      floorHeight: 3000,
      style: 'minimalist',
      rooms: [
        {
          id: 'kitch-room',
          name: 'Main Kitchen',
          type: 'kitchen',
          level: 0,
          x: 1000,
          z: 2000,
          design: kitchenProject,
        },
        {
          id: 'bed-room',
          name: 'Primary Bedroom',
          type: 'bedroom',
          level: 1,
          x: 0,
          z: 0,
          design: bedroomProject,
        },
      ],
    };

    const file = serializeHome(home);
    const store = useCloudProjectStore.getState();
    const imported = await store.importHome(file);

    expect(imported.project.name).toBe('Contemporary Villa 2BHK');
    expect(imported.spaces).toHaveLength(2);
    expect(imported.spaces[0]!.name).toBe('Main Kitchen');
    expect(imported.spaces[1]!.name).toBe('Primary Bedroom');
  });

  it('marks conflict on stale revision commit and preserves local draft in editor', async () => {
    const store = useCloudProjectStore.getState();
    await store.createProject('Conflict Project');
    const space = await store.createSpace('Kitchen Space');

    // First successful commit
    const rev1 = await store.commitCurrentDesign();
    expect(rev1.success).toBe(true);

    // Simulate stale base revision in syncState
    useCloudProjectStore.setState({
      syncState: {
        localProjectId: 'doc-1',
        cloudProjectId: useCloudProjectStore.getState().currentProject!.id,
        spaceId: space.id,
        baseRevisionId: 'stale-rev-id-999',
        syncStatus: 'draft',
      },
    });

    // Make local edit in editorStore
    const currentDoc = useEditorStore.getState().project!;
    useEditorStore.setState({
      project: { ...currentDoc, name: 'Local Draft Edits' },
    });

    const conflictResult = await store.commitCurrentDesign();
    expect(conflictResult.success).toBe(false);
    if (!conflictResult.success) {
      expect(conflictResult.conflict).toBe(true);
    }
    expect(useCloudProjectStore.getState().syncState.syncStatus).toBe('conflict');

    // Verify local editor document was NOT lost/overwritten
    expect(useEditorStore.getState().project?.name).toBe('Local Draft Edits');

    // Fork local draft into a new space branch
    const branchedSpace = await store.resolveConflictForkLocalDraft('Kitchen (Branch Draft)');
    expect(branchedSpace.name).toBe('Kitchen (Branch Draft)');
    expect(useCloudProjectStore.getState().syncState.syncStatus).toBe('synced');
  });

  it('rejects mutating operations when unauthenticated (activeActorId is null)', async () => {
    useCloudProjectStore.getState().setActiveActor(null);
    const store = useCloudProjectStore.getState();

    expect(store.readinessState).toBe('unauthenticated');
    await expect(store.createProject('Unauthorized Project')).rejects.toThrow();

    const commitResult = await store.commitCurrentDesign();
    expect(commitResult.success).toBe(false);
    if (!commitResult.success && !commitResult.conflict) {
      expect(commitResult.error).toContain('Authentication required');
    }
  });

  it('rejects mutating operations when active organization is missing (currentOrgId is null)', async () => {
    useCloudProjectStore.getState().setActiveActor(TEST_ACTOR_ID);
    useCloudProjectStore.getState().setOrgId(null);
    const store = useCloudProjectStore.getState();

    expect(store.readinessState).toBe('organization_required');
    await expect(store.createProject('No Org Project')).rejects.toThrow(
      'Active organization membership is required for cloud operations',
    );

    const commitResult = await store.commitCurrentDesign();
    expect(commitResult.success).toBe(false);
    if (!commitResult.success && !commitResult.conflict) {
      expect(commitResult.error).toContain('Active organization membership is required');
    }
  });

  it('clears remote caches and updates readiness on organization switch (FR-04, T206)', async () => {
    const store = useCloudProjectStore.getState();
    const project = await store.createProject('Org A Project');
    await store.createSpace('Org A Space');

    expect(useCloudProjectStore.getState().projects).toHaveLength(1);
    expect(useCloudProjectStore.getState().currentProject?.id).toBe(project.id);
    expect(useCloudProjectStore.getState().spaces).toHaveLength(1);

    // Switch to Org B
    store.setOrgId(OTHER_TEST_ORG_ID);

    // Remote caches must be purged to prevent cross-tenant leakage
    expect(useCloudProjectStore.getState().currentOrgId).toBe(OTHER_TEST_ORG_ID);
    expect(useCloudProjectStore.getState().projects).toEqual([]);
    expect(useCloudProjectStore.getState().currentProject).toBeNull();
    expect(useCloudProjectStore.getState().spaces).toEqual([]);
    expect(useCloudProjectStore.getState().activeSpaceId).toBeNull();
    expect(useCloudProjectStore.getState().readinessState).toBe('ready');
  });

  it('clears remote caches on sign-out while preserving local drafts (FR-04, T207)', async () => {
    const store = useCloudProjectStore.getState();
    await store.createProject('Signed-In Project');

    expect(useCloudProjectStore.getState().projects).toHaveLength(1);
    expect(useEditorStore.getState().project).not.toBeNull();

    // Sign out
    store.setActiveActor(null);

    expect(useCloudProjectStore.getState().activeActorId).toBeNull();
    expect(useCloudProjectStore.getState().currentOrgId).toBeNull();
    expect(useCloudProjectStore.getState().readinessState).toBe('unauthenticated');
    expect(useCloudProjectStore.getState().projects).toEqual([]);
    expect(useCloudProjectStore.getState().currentProject).toBeNull();

    // Editor local draft remains intact
    expect(useEditorStore.getState().project).not.toBeNull();
  });

  it('resolves conflict by fetching authoritative remote revision from persistence adapter', async () => {
    const store = useCloudProjectStore.getState();
    const adapter = new InMemoryPersistenceAdapter();
    setPersistenceAdapter(adapter);

    const project = await store.createProject('Remote Fetch Project');
    const space = await store.createSpace('Master Kitchen');

    // Commit revision 1
    const rev1 = await store.commitCurrentDesign();
    expect(rev1.success).toBe(true);
    if (!rev1.success) {
      throw new Error('Commit should succeed');
    }

    // Another client commits revision 2 directly into the adapter (not in store memory)
    const rev2Doc = { ...createExampleProject(), name: 'Remote Updated Kitchen 2' };
    const rev2Outcome = await adapter.commitDesignRevision({
      orgId: useCloudProjectStore.getState().currentOrgId!,
      actorId: useCloudProjectStore.getState().activeActorId!,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: rev1.revision.id,
      snapshot: {
        format: 'interior-studio/kitchen',
        schemaVersion: 2,
        document: rev2Doc,
      },
      idempotencyKey: 'remote_client_commit_999',
    });
    expect(rev2Outcome.success).toBe(true);

    // Local client simulates stale state
    useCloudProjectStore.setState({
      syncState: {
        localProjectId: 'doc-1',
        cloudProjectId: project.id,
        spaceId: space.id,
        baseRevisionId: rev1.revision.id,
        syncStatus: 'conflict',
      },
      // Ensure revision 2 is NOT in store.revisions in memory
      revisions: {
        [space.id]: [rev1.revision],
      },
    });

    // Call resolveConflictReloadRemote
    await store.resolveConflictReloadRemote();

    // Verify it fetched the remote revision over the wire and updated editor
    expect(useEditorStore.getState().project?.name).toBe('Remote Updated Kitchen 2');
    expect(useCloudProjectStore.getState().syncState.syncStatus).toBe('synced');
    if (rev2Outcome.success) {
      expect(useCloudProjectStore.getState().syncState.baseRevisionId).toBe(rev2Outcome.revision.id);
    }
  });
});
