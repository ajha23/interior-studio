import { describe, expect, it } from 'vitest';
import { InMemoryPersistenceAdapter } from './inMemoryPersistenceAdapter';
import { createExampleProject } from '@/domain/project/presets';

describe('Concurrency, Idempotency & RBAC Integration (Feature 034.2.1 T501)', () => {
  const orgA = '11111111-1111-4111-8111-111111111111';
  const orgB = '22222222-2222-4222-8222-222222222222';
  const actor1 = '33333333-3333-4333-8333-333333333333';

  it('handles concurrent identical idempotency requests safely without duplicate records', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const project = await adapter.createProject({ orgId: orgA, actorId: actor1, name: 'P1' });
    const space = await adapter.createSpace({ orgId: orgA, actorId: actor1, projectId: project.id, name: 'Kitchen' });

    const snapshot = {
      format: 'interior-studio/kitchen' as const,
      schemaVersion: 2,
      document: createExampleProject(),
    };

    const idempotencyKey = 'concurrent_key_test_1';

    // Simulate concurrent calls with exact same payload and idempotency key
    const [result1, result2] = await Promise.all([
      adapter.commitDesignRevision({
        orgId: orgA,
        actorId: actor1,
        projectId: project.id,
        spaceId: space.id,
        expectedRevisionId: null,
        snapshot,
        idempotencyKey,
      }),
      adapter.commitDesignRevision({
        orgId: orgA,
        actorId: actor1,
        projectId: project.id,
        spaceId: space.id,
        expectedRevisionId: null,
        snapshot,
        idempotencyKey,
      }),
    ]);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      // Both should yield the identical revision ID (replayed)
      expect(result1.revision.id).toBe(result2.revision.id);
      expect(result1.idempotencyRecord.idempotencyKey).toBe(idempotencyKey);
    }
  });

  it('rejects idempotency key reuse with different payload (IDEMPOTENCY_KEY_REUSED)', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const project = await adapter.createProject({ orgId: orgA, actorId: actor1, name: 'P1' });
    const space = await adapter.createSpace({ orgId: orgA, actorId: actor1, projectId: project.id, name: 'Kitchen' });

    const snapshot1 = {
      format: 'interior-studio/kitchen' as const,
      schemaVersion: 2,
      document: createExampleProject(),
    };

    const snapshot2 = {
      format: 'interior-studio/kitchen' as const,
      schemaVersion: 2,
      document: { ...createExampleProject(), name: 'Different Content' },
    };

    const idempotencyKey = 'key_payload_conflict_test';

    const first = await adapter.commitDesignRevision({
      orgId: orgA,
      actorId: actor1,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot: snapshot1,
      idempotencyKey,
    });
    expect(first.success).toBe(true);

    const second = await adapter.commitDesignRevision({
      orgId: orgA,
      actorId: actor1,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot: snapshot2,
      idempotencyKey,
    });
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.reason).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('isolates projects and revisions strictly by tenant org_id', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const projOrgA = await adapter.createProject({ orgId: orgA, actorId: actor1, name: 'OrgA Project' });
    const projOrgB = await adapter.createProject({ orgId: orgB, actorId: actor1, name: 'OrgB Project' });

    const listOrgA = await adapter.listProjects({ orgId: orgA });
    const listOrgB = await adapter.listProjects({ orgId: orgB });

    expect(listOrgA.map((p) => p.id)).toContain(projOrgA.id);
    expect(listOrgA.map((p) => p.id)).not.toContain(projOrgB.id);

    expect(listOrgB.map((p) => p.id)).toContain(projOrgB.id);
    expect(listOrgB.map((p) => p.id)).not.toContain(projOrgA.id);
  });

  it('rejects cross-tenant space access', async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const project = await adapter.createProject({ orgId: orgA, actorId: actor1, name: 'OrgA Project' });
    const space = await adapter.createSpace({ orgId: orgA, actorId: actor1, projectId: project.id, name: 'OrgA Space' });

    // Request from orgB for orgA space must return null
    const spaceFromB = await adapter.getSpace({ orgId: orgB, spaceId: space.id });
    expect(spaceFromB).toBeNull();
  });
});
