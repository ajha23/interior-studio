import { describe, expect, it } from 'vitest';
import { createExampleProject } from './presets';
import { serializeProject } from './serialization';
import type { KitchenProject } from '../schema';
import { serializeHome, type Home } from '../home/schema';
import {
  commitSpaceRevision,
  evaluateCloudProjectScope,
  evaluateSyncConflict,
  importStandaloneKitchenFile,
  importWholeHomeFile,
} from './cloudPersistence';
import type {
  DesignRevision,
  DesignSnapshot,
  IdempotencyRecord,
  LocalProjectSyncState,
  Space,
} from './cloudTypes';

describe('Cloud Project Foundation & Persistence (Feature 034 Domain Tests)', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const spaceId = '33333333-3333-4333-8333-333333333333';
  const actorId = '44444444-4444-4444-8444-444444444444';

  function createTestSpace(): Space {
    return {
      id: spaceId,
      orgId,
      projectId,
      name: 'Kitchen',
      spaceType: 'kitchen',
      level: 0,
      planPositionMm: { x: 0, z: 0 },
      currentRevisionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function createTestSnapshot(name = 'Test'): DesignSnapshot {
    const project = createExampleProject();
    project.name = name;
    return {
      format: 'interior-studio/kitchen',
      schemaVersion: 2,
      document: project,
    };
  }

  describe('Compare-and-Swap (CAS) Revision Commit (T406, T407, T408, T409)', () => {
    it('commits initial revision when expectedRevisionId is null', () => {
      const space = createTestSpace();
      const snapshot = createTestSnapshot('V1');

      const result = commitSpaceRevision(space, [], [], {
        orgId,
        projectId,
        spaceId,
        expectedRevisionId: null,
        snapshot,
        actorId,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.revision.spaceId).toBe(spaceId);
        expect(result.revision.parentRevisionId).toBeNull();
        expect(result.updatedSpace.currentRevisionId).toBe(result.revision.id);
        expect(result.revision.canonicalHash).toHaveLength(64);
      }
    });

    it('commits sequential revision when expectedRevisionId matches currentRevisionId', () => {
      const space = createTestSpace();
      const rev1Snapshot = createTestSnapshot('V1');
      const res1 = commitSpaceRevision(space, [], [], {
        orgId,
        projectId,
        spaceId,
        expectedRevisionId: null,
        snapshot: rev1Snapshot,
        actorId,
      });
      expect(res1.success).toBe(true);
      if (!res1.success) return;

      const spaceV1 = res1.updatedSpace;
      const revisions: DesignRevision[] = [res1.revision];

      const rev2Snapshot = createTestSnapshot('V2');
      const res2 = commitSpaceRevision(spaceV1, revisions, [], {
        orgId,
        projectId,
        spaceId,
        expectedRevisionId: res1.revision.id,
        snapshot: rev2Snapshot,
        actorId,
      });

      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.revision.parentRevisionId).toBe(res1.revision.id);
        expect(res2.updatedSpace.currentRevisionId).toBe(res2.revision.id);
      }
    });

    it('rejects stale commit with conflict when expectedRevisionId does not match current pointer', () => {
      const space = createTestSpace();
      space.currentRevisionId = 'current-server-rev-999';

      const result = commitSpaceRevision(space, [], [], {
        orgId,
        projectId,
        spaceId,
        expectedRevisionId: 'stale-client-rev-111',
        snapshot: createTestSnapshot('Stale'),
        actorId,
      });

      expect(result.success).toBe(false);
      if (!result.success && result.conflict) {
        expect(result.conflict).toBe(true);
        expect(result.currentRevisionId).toBe('current-server-rev-999');
      }
    });

    it('replays identical response for matching idempotency key and request hash', () => {
      const space = createTestSpace();
      const snapshot = createTestSnapshot('Idempotent');
      const idempotencyKey = 'req_idempotent_123';

      const res1 = commitSpaceRevision(space, [], [], {
        orgId,
        projectId,
        spaceId,
        expectedRevisionId: null,
        snapshot,
        actorId,
        idempotencyKey,
      });
      expect(res1.success).toBe(true);
      if (!res1.success) return;

      const idempotencyRecords: IdempotencyRecord[] = [
        {
          id: 'idem-1',
          orgId,
          actorId,
          operation: 'commit_revision',
          idempotencyKey,
          requestHash: res1.revision.canonicalHash,
          responseStatus: 200,
          response: { revisionId: res1.revision.id },
          createdAt: new Date().toISOString(),
        },
      ];

      const res2 = commitSpaceRevision(
        res1.updatedSpace,
        [res1.revision],
        idempotencyRecords,
        {
          orgId,
          projectId,
          spaceId,
          expectedRevisionId: null,
          snapshot,
          actorId,
          idempotencyKey,
        }
      );

      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.idempotentReplay).toBe(true);
        expect(res2.revision.id).toBe(res1.revision.id);
      }
    });
  });

  describe('Import Compatibility & Provenance (T601, T602, T603, T604)', () => {
    it('imports standalone kitchen file into 1 SaaS project and 1 Space with legacy mapping', () => {
      const projectDoc = createExampleProject();
      projectDoc.name = 'Luxury Modular Kitchen';
      const fileContent = serializeProject(projectDoc);

      const result = importStandaloneKitchenFile(fileContent, {
        orgId,
        actorId,
        projectName: 'Villa Horizon Kitchen',
      });

      expect(result.project.name).toBe('Villa Horizon Kitchen');
      expect(result.project.orgId).toBe(orgId);
      expect(result.space.spaceType).toBe('kitchen');
      expect(result.space.projectId).toBe(result.project.id);
      expect(result.revision.spaceId).toBe(result.space.id);

      // Verify original editor IDs are preserved inside snapshot
      const snapshotDoc = (result.revision.snapshot as { document: KitchenProject }).document;
      expect(snapshotDoc.id).toBe(projectDoc.id);
      expect(snapshotDoc.cabinets.length).toBe(projectDoc.cabinets.length);

      // Verify legacy mapping
      expect(result.mapping.sourceEntityId).toBe(projectDoc.id);
      expect(result.mapping.targetProjectId).toBe(result.project.id);
      expect(result.mapping.targetSpaceId).toBe(result.space.id);
    });

    it('imports whole-home multi-room file into 1 SaaS project with 1 Space per HomeRoom', () => {
      const kitchenProject = createExampleProject();
      const bedroomProject = createExampleProject();
      bedroomProject.id = 'bedroom-doc-002';
      bedroomProject.name = 'Master Bedroom';

      const homeDoc: Home = {
        schemaVersion: 1,
        id: 'home-villa-101',
        name: 'Hilltop Villa 3BHK',
        kind: 'villa',
        bhk: 3,
        plot: { width: 15000, length: 20000 },
        levels: 2,
        floorHeight: 3000,
        style: 'contemporary',
        rooms: [
          {
            id: 'room-kitch-1',
            name: 'Open Island Kitchen',
            type: 'kitchen',
            level: 0,
            x: 2000,
            z: 3000,
            design: kitchenProject,
          },
          {
            id: 'room-bed-1',
            name: 'Primary Bedroom',
            type: 'bedroom',
            level: 1,
            x: 0,
            z: 0,
            design: bedroomProject,
          },
        ],
      };

      const fileContent = serializeHome(homeDoc);
      const result = importWholeHomeFile(fileContent, {
        orgId,
        actorId,
      });

      expect(result.project.name).toBe('Hilltop Villa 3BHK');
      expect(result.spaces).toHaveLength(2);
      expect(result.revisions).toHaveLength(2);
      expect(result.mappings).toHaveLength(3); // 1 home + 2 rooms

      // Space 0: Kitchen at level 0
      const space0 = result.spaces[0]!;
      expect(space0.name).toBe('Open Island Kitchen');
      expect(space0.spaceType).toBe('kitchen');
      expect(space0.level).toBe(0);
      expect(space0.planPositionMm).toEqual({ x: 2000, z: 3000 });

      // Space 1: Bedroom at level 1
      const space1 = result.spaces[1]!;
      expect(space1.name).toBe('Primary Bedroom');
      expect(space1.spaceType).toBe('bedroom');
      expect(space1.level).toBe(1);

      // Verify provenance preserved in snapshot
      const snap0 = result.revisions[0]!.snapshot as { provenance: { homeSourceId: string; roomSourceId: string } };
      expect(snap0.provenance.homeSourceId).toBe('home-villa-101');
      expect(snap0.provenance.roomSourceId).toBe('room-kitch-1');
    });
  });

  describe('Scoped Authorization Evaluator (T304a, T305a, T306a, T306b)', () => {
    const assignedProjectId = 'proj-assigned-abc';

    it('allows all_projects scope when actor has all-projects permission', () => {
      const evalResult = evaluateCloudProjectScope(
        {
          userId: actorId,
          orgId,
          assignedProjectIds: [],
          hasAllProjectsPermission: true,
        },
        'all_projects',
        null
      );
      expect(evalResult.allowed).toBe(true);
    });

    it('allows assigned_projects scope only when non-null project matches assigned ID', () => {
      const evalResult = evaluateCloudProjectScope(
        {
          userId: actorId,
          orgId,
          assignedProjectIds: [assignedProjectId],
          hasAssignedProjectsPermission: true,
        },
        'assigned_projects',
        assignedProjectId
      );
      expect(evalResult.allowed).toBe(true);
    });

    it('denies assigned_projects scope when target project ID is null/missing (T305a)', () => {
      const evalResult = evaluateCloudProjectScope(
        {
          userId: actorId,
          orgId,
          assignedProjectIds: [assignedProjectId],
          hasAssignedProjectsPermission: true,
        },
        'assigned_projects',
        null
      );
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.reason).toContain('requires explicit non-null project context');
    });

    it('denies assigned_projects scope when user is not assigned to the target project', () => {
      const evalResult = evaluateCloudProjectScope(
        {
          userId: actorId,
          orgId,
          assignedProjectIds: [assignedProjectId],
          hasAssignedProjectsPermission: true,
        },
        'assigned_projects',
        'different-proj-xyz'
      );
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.reason).toContain('not an assigned member');
    });

    it('explicitly rejects unsupported scopes (team_projects, client_projects, specific_projects)', () => {
      for (const unsupported of ['team_projects', 'client_projects', 'specific_projects']) {
        const evalResult = evaluateCloudProjectScope(
          {
            userId: actorId,
            orgId,
            assignedProjectIds: [assignedProjectId],
            hasAllProjectsPermission: true,
          },
          unsupported,
          assignedProjectId
        );
        expect(evalResult.allowed).toBe(false);
        expect(evalResult.reason).toContain('not supported in Feature 034');
      }
    });
  });

  describe('Sync Conflict Evaluation (T508a, T610a, T610b)', () => {
    it('detects synced state when base revision and hash match server', () => {
      const hash = 'a'.repeat(64);
      const localState: LocalProjectSyncState = {
        localProjectId: 'local-1',
        cloudProjectId: projectId,
        spaceId,
        baseRevisionId: 'rev-server-1',
        syncStatus: 'draft',
        clientHash: hash,
      };

      const serverRevision: DesignRevision = {
        id: 'rev-server-1',
        orgId,
        projectId,
        spaceId,
        parentRevisionId: null,
        schemaVersion: 2,
        format: 'interior-studio/kitchen',
        snapshot: createTestSnapshot(),
        canonicalHash: hash,
        createdAt: new Date().toISOString(),
      };

      const syncResult = evaluateSyncConflict(localState, serverRevision);
      expect(syncResult.status).toBe('synced');
      expect(syncResult.hasConflict).toBe(false);
      expect(syncResult.canAutoCommit).toBe(false);
    });

    it('detects draft ready to commit when local modifications exist on top of current revision', () => {
      const localState: LocalProjectSyncState = {
        localProjectId: 'local-1',
        cloudProjectId: projectId,
        spaceId,
        baseRevisionId: 'rev-server-1',
        syncStatus: 'draft',
        clientHash: 'b'.repeat(64), // changed locally
      };

      const serverRevision: DesignRevision = {
        id: 'rev-server-1',
        orgId,
        projectId,
        spaceId,
        parentRevisionId: null,
        schemaVersion: 2,
        format: 'interior-studio/kitchen',
        snapshot: createTestSnapshot(),
        canonicalHash: 'a'.repeat(64),
        createdAt: new Date().toISOString(),
      };

      const syncResult = evaluateSyncConflict(localState, serverRevision);
      expect(syncResult.status).toBe('draft');
      expect(syncResult.hasConflict).toBe(false);
      expect(syncResult.canAutoCommit).toBe(true);
    });

    it('detects stale conflict when base revision diverged from server revision', () => {
      const localState: LocalProjectSyncState = {
        localProjectId: 'local-1',
        cloudProjectId: projectId,
        spaceId,
        baseRevisionId: 'rev-server-older',
        syncStatus: 'draft',
        clientHash: 'b'.repeat(64),
      };

      const serverRevision: DesignRevision = {
        id: 'rev-server-newer',
        orgId,
        projectId,
        spaceId,
        parentRevisionId: 'rev-server-older',
        schemaVersion: 2,
        format: 'interior-studio/kitchen',
        snapshot: createTestSnapshot(),
        canonicalHash: 'c'.repeat(64),
        createdAt: new Date().toISOString(),
      };

      const syncResult = evaluateSyncConflict(localState, serverRevision);
      expect(syncResult.status).toBe('conflict');
      expect(syncResult.hasConflict).toBe(true);
      expect(syncResult.canAutoCommit).toBe(false);
      expect(syncResult.reason).toContain('Local draft is based on revision');
    });
  });
});
