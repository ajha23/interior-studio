import { describe, expect, it, vi } from 'vitest';
import {
  SupabasePersistenceAdapter,
  type SupabaseClientLike,
  type SupabaseFilterBuilder,
} from './supabasePersistenceAdapter';
import { createExampleProject } from '@/domain/project/presets';

describe('Database Integration & Security Remediation (Feature 034.2.2 T501)', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const spaceId = '44444444-4444-4444-8444-444444444444';

  function createMockClient(
    mockRpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>,
    spaceRevisionHolder: { current: string | null } = { current: 'rev-initial-001' }
  ): SupabaseClientLike {
    const builder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(async () => {
        return {
          data: {
            id: spaceId,
            org_id: orgId,
            project_id: projectId,
            name: 'Kitchen',
            space_type: 'kitchen',
            level: 0,
            plan_position_mm: { x: 0, z: 0 },
            current_revision_id: spaceRevisionHolder.current,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        };
      }),
      then: vi.fn().mockImplementation((fn) => Promise.resolve({ data: null, error: null }).then(fn)),
    } as unknown as SupabaseFilterBuilder;

    return {
      from: () => builder,
      rpc: mockRpc,
    };
  }

  describe('Concurrent Compare-and-Swap (CAS) Revision Commit', () => {
    it('succeeds for the winner and yields REVISION_CONFLICT for concurrent stale caller', async () => {
      const spaceRevisionHolder = { current: 'rev-initial-001' as string | null };

      // Mock RPC simulating PostgreSQL commit_design_revision with row-level locks
      const mockRpc = vi.fn().mockImplementation(async (fn: string, params: Record<string, unknown>) => {
        if (fn === 'commit_design_revision') {
          const expected = params.p_expected_revision_id as string | null;
          if (expected !== spaceRevisionHolder.current) {
            return {
              data: {
                success: false,
                conflict: true,
                reason: 'REVISION_CONFLICT',
                currentRevisionId: spaceRevisionHolder.current,
                error: `Design revision conflict: current revision ${spaceRevisionHolder.current} does not match expected ${expected}.`,
              },
              error: null,
            };
          }

          // Advance revision
          const newRevisionId = `rev-committed-${Date.now()}`;
          spaceRevisionHolder.current = newRevisionId;

          return {
            data: {
              success: true,
              revisionId: newRevisionId,
              committedAt: new Date().toISOString(),
            },
            error: null,
          };
        }
        return { data: null, error: new Error(`Unknown RPC ${fn}`) };
      });

      const adapter = new SupabasePersistenceAdapter(createMockClient(mockRpc, spaceRevisionHolder));

      const snapshot = {
        format: 'interior-studio/kitchen' as const,
        schemaVersion: 2,
        document: createExampleProject(),
      };

      // Caller A commits against rev-initial-001
      const resA = await adapter.commitDesignRevision({
        orgId,
        actorId,
        projectId,
        spaceId,
        expectedRevisionId: 'rev-initial-001',
        snapshot,
        idempotencyKey: 'idemp-caller-A',
      });

      expect(resA.success).toBe(true);
      if (resA.success) {
        expect(resA.revision.parentRevisionId).toBe('rev-initial-001');
        expect(spaceRevisionHolder.current).toMatch(/^rev-committed-/);
      }

      // Caller B concurrently attempts to commit against stale rev-initial-001
      const resB = await adapter.commitDesignRevision({
        orgId,
        actorId,
        projectId,
        spaceId,
        expectedRevisionId: 'rev-initial-001',
        snapshot,
        idempotencyKey: 'idemp-caller-B',
      });

      expect(resB.success).toBe(false);
      if (!resB.success) {
        expect(resB.conflict).toBe(true);
        expect(resB.reason).toBe('REVISION_CONFLICT');
      }
    });
  });

  describe('Full-Request Normalized Import Idempotency', () => {
    it('rejects idempotency key reuse with different payload/project name', async () => {
      const existingRecords: Record<string, { request_hash: string; response: unknown }> = {};

      const mockRpc = vi.fn().mockImplementation(async (fn: string, params: Record<string, unknown>) => {
        if (fn === 'import_kitchen_project') {
          const key = params.p_idempotency_key as string;
          const hash = params.p_canonical_hash as string;

          if (existingRecords[key]) {
            if (existingRecords[key]!.request_hash !== hash) {
              return {
                data: null,
                error: new Error('IDEMPOTENCY_KEY_REUSED: Idempotency key reused with different request payload'),
              };
            }
            return { data: existingRecords[key]!.response, error: null };
          }

          const response = {
            success: true,
            projectId: 'proj-123',
            spaceId: 'space-456',
            revisionId: 'rev-789',
            canonicalHash: 'hash-abc',
            project: { id: 'proj-123', org_id: orgId, name: params.p_project_name, status: 'active', created_by: actorId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            space: { id: 'space-456', org_id: orgId, project_id: 'proj-123', name: 'Kitchen', space_type: 'kitchen', level: 0, current_revision_id: 'rev-789', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            revision: { id: 'rev-789', org_id: orgId, project_id: 'proj-123', space_id: 'space-456', schema_version: 2, format: 'interior-studio/kitchen', snapshot_jsonb: params.p_snapshot_jsonb, canonical_hash: 'hash-abc', created_by: actorId, created_at: new Date().toISOString() },
          };

          existingRecords[key] = { request_hash: hash, response };
          return { data: response, error: null };
        }
        return { data: null, error: new Error(`Unknown RPC ${fn}`) };
      });

      const adapter = new SupabasePersistenceAdapter(createMockClient(mockRpc));
      const doc = createExampleProject();

      // First call succeeds
      const first = await adapter.importKitchen({
        orgId,
        actorId,
        projectName: 'Original Project Name',
        fileContent: JSON.stringify(doc),
        idempotencyKey: 'idemp-import-shared-key',
      });
      expect(first.project.name).toBe('Original Project Name');

      // Second call reuses same idempotency key but specifies a DIFFERENT project name
      await expect(
        adapter.importKitchen({
          orgId,
          actorId,
          projectName: 'Tampered Project Name',
          fileContent: JSON.stringify(doc),
          idempotencyKey: 'idemp-import-shared-key',
        })
      ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
    });
  });

  describe('Service-Role Spoofing Prevention (Migration 00012 Guard)', () => {
    it('fails closed when client context attempts to assert service_role in revision RPC', async () => {
      const mockRpc = vi.fn().mockImplementation(async (fn: string) => {
        if (fn === 'commit_design_revision' || fn === 'import_kitchen_project') {
          return {
            data: null,
            error: new Error('Access denied: service_role privilege cannot be claimed from authenticated client sessions (42501)'),
          };
        }
        return { data: null, error: null };
      });

      const adapter = new SupabasePersistenceAdapter(createMockClient(mockRpc));

      const outcome = await adapter.commitDesignRevision({
        orgId,
        actorId: 'spoofed-service-role-client',
        projectId,
        spaceId,
        expectedRevisionId: null,
        snapshot: {
          format: 'interior-studio/kitchen',
          schemaVersion: 2,
          document: createExampleProject(),
        },
        idempotencyKey: 'key-spoof-1',
      });

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toMatch(/Access denied: service_role privilege cannot be claimed/);
      }
    });

    it('fails closed when client context attempts to assert service_role in import RPC', async () => {
      const mockRpc = vi.fn().mockImplementation(async () => {
        return {
          data: null,
          error: new Error('Access denied: service_role privilege cannot be claimed from authenticated client sessions (42501)'),
        };
      });

      const adapter = new SupabasePersistenceAdapter(createMockClient(mockRpc));

      await expect(
        adapter.importKitchen({
          orgId,
          actorId: 'spoofed-service-role-client',
          projectName: 'Forbidden Service Project',
          fileContent: JSON.stringify(createExampleProject()),
          idempotencyKey: 'key-spoof-import',
        })
      ).rejects.toThrow(/Access denied: service_role privilege cannot be claimed/);
    });
  });
});
