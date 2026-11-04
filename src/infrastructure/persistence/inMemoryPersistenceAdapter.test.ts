import { describe, expect, it } from 'vitest';
import { InMemoryPersistenceAdapter } from './inMemoryPersistenceAdapter';
import { createExampleProject } from '@/domain/project/presets';
import { serializeProject } from '@/domain/project/serialization';
import type { DesignSnapshot } from '@/domain/project/cloudTypes';

describe('InMemoryPersistenceAdapter (Feature 034.1 FR-04, FR-06, FR-07)', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';

  const createSnapshot = (name: string): DesignSnapshot => ({
    schemaVersion: 2,
    format: 'interior-studio/kitchen',
    document: {
      ...createExampleProject(),
      name,
    },
  });

  it('performs durable project and space lifecycle operations', async () => {
    const adapter = new InMemoryPersistenceAdapter();

    const project = await adapter.createProject({
      orgId,
      actorId,
      name: 'Skyline Penthouse',
    });
    expect(project.id).toBeDefined();
    expect(project.status).toBe('active');

    const space = await adapter.createSpace({
      orgId,
      actorId,
      projectId: project.id,
      name: 'Gourmet Kitchen',
      type: 'kitchen',
    });
    expect(space.id).toBeDefined();
    expect(space.currentRevisionId).toBeNull();

    const spaces = await adapter.listSpaces({ orgId, projectId: project.id });
    expect(spaces).toHaveLength(1);

    const archived = await adapter.archiveProject({
      orgId,
      actorId,
      projectId: project.id,
    });
    expect(archived.status).toBe('archived');
  });

  it('executes atomic revision commit and updates space current pointer', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const project = await adapter.createProject({ orgId, actorId, name: 'Project 1' });
    const space = await adapter.createSpace({ orgId, actorId, projectId: project.id, name: 'Space 1' });

    const result = await adapter.commitDesignRevision({
      orgId,
      actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot: createSnapshot('Rev 1'),
      idempotencyKey: 'idemp_key_001',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.revision.id).toBeDefined();
      expect(result.updatedSpace.currentRevisionId).toBe(result.revision.id);
      expect(result.revision.parentRevisionId).toBeNull();
    }

    // Verify outbox event emitted
    const outbox = adapter.getOutboxEvents();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.eventType).toBe('space.revision_committed');
  });

  it('detects CAS conflict when expectedRevisionId does not match server pointer', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const project = await adapter.createProject({ orgId, actorId, name: 'Project CAS' });
    const space = await adapter.createSpace({ orgId, actorId, projectId: project.id, name: 'Space CAS' });

    // Commit rev 1
    const rev1 = await adapter.commitDesignRevision({
      orgId,
      actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot: createSnapshot('Rev 1'),
      idempotencyKey: 'k1',
    });
    expect(rev1.success).toBe(true);

    // Another client commits with stale expectedRevisionId = null
    const staleResult = await adapter.commitDesignRevision({
      orgId,
      actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null, // Stale! Current is rev1
      snapshot: createSnapshot('Rev 2 Stale'),
      idempotencyKey: 'k2',
    });

    expect(staleResult.success).toBe(false);
    if (!staleResult.success && staleResult.conflict) {
      expect(staleResult.reason).toBe('REVISION_CONFLICT');
      if (rev1.success) {
        expect(staleResult.currentRevisionId).toBe(rev1.revision.id);
      }
    }
  });

  it('replays identical response for matching idempotency key and request hash', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const project = await adapter.createProject({ orgId, actorId, name: 'Project Idemp' });
    const space = await adapter.createSpace({ orgId, actorId, projectId: project.id, name: 'Space Idemp' });
    const snapshot = createSnapshot('Idempotent Snapshot');

    const res1 = await adapter.commitDesignRevision({
      orgId,
      actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot,
      idempotencyKey: 'idemp_key_fixed',
    });
    expect(res1.success).toBe(true);

    // Replay with identical key and payload
    const res2 = await adapter.commitDesignRevision({
      orgId,
      actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot,
      idempotencyKey: 'idemp_key_fixed',
    });

    expect(res2.success).toBe(true);
    if (res1.success && res2.success) {
      expect(res2.revision.id).toBe(res1.revision.id);
      expect(res2.revision.canonicalHash).toBe(res1.revision.canonicalHash);
    }
  });

  it('rejects same idempotency key with different request payload', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const project = await adapter.createProject({ orgId, actorId, name: 'Project Conflict' });
    const space = await adapter.createSpace({ orgId, actorId, projectId: project.id, name: 'Space Conflict' });

    const res1 = await adapter.commitDesignRevision({
      orgId,
      actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot: createSnapshot('Snapshot Version A'),
      idempotencyKey: 'idemp_reused_key',
    });
    expect(res1.success).toBe(true);

    // Call again with SAME key but DIFFERENT snapshot content
    const res2 = await adapter.commitDesignRevision({
      orgId,
      actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot: createSnapshot('Snapshot Version B Changed'),
      idempotencyKey: 'idemp_reused_key',
    });

    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.reason).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('imports standalone kitchen file and persists mapping', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const rawProject = createExampleProject();
    rawProject.name = 'Modular Kitchen 2026';
    const content = serializeProject(rawProject);

    const result = await adapter.importKitchen({
      orgId,
      actorId,
      fileContent: content,
    });

    expect(result.project.name).toBe('Modular Kitchen 2026');
    expect(result.space.name).toBe('Kitchen');
    expect(result.revision.id).toBe(result.space.currentRevisionId);
  });
});
