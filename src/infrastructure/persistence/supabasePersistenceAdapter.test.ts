import { describe, expect, it, vi } from 'vitest';
import { SupabasePersistenceAdapter, type SupabaseClientLike, type SupabaseFilterBuilder } from './supabasePersistenceAdapter';
import { CloudPersistenceError } from '@/domain/project/cloudErrors';
import { createExampleProject } from '@/domain/project/presets';

describe('SupabasePersistenceAdapter Atomic Imports (Feature 034.2.1 T301-T305)', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';

  function createMockClient(mockRpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>): SupabaseClientLike {
    const filterBuilder = {} as unknown as SupabaseFilterBuilder;
    return {
      from: () => filterBuilder,
      rpc: mockRpc,
    };
  }

  it('calls import_kitchen_project RPC and maps returned entities', async () => {
    const kitchenDoc = createExampleProject();
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        projectId: 'proj-123',
        spaceId: 'space-456',
        revisionId: 'rev-789',
        canonicalHash: 'hash-abc',
        project: {
          id: 'proj-123',
          org_id: orgId,
          name: 'Imported Kitchen',
          status: 'active',
          created_by: actorId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        space: {
          id: 'space-456',
          org_id: orgId,
          project_id: 'proj-123',
          name: 'Kitchen',
          space_type: 'kitchen',
          level: 0,
          current_revision_id: 'rev-789',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        revision: {
          id: 'rev-789',
          org_id: orgId,
          project_id: 'proj-123',
          space_id: 'space-456',
          schema_version: 2,
          format: 'interior-studio/kitchen',
          snapshot_jsonb: { format: 'interior-studio/kitchen', schemaVersion: 2, document: kitchenDoc },
          canonical_hash: 'hash-abc',
          created_by: actorId,
          created_at: new Date().toISOString(),
        },
      },
      error: null,
    });

    const mockClient = createMockClient(mockRpc);
    const adapter = new SupabasePersistenceAdapter(mockClient);
    const result = await adapter.importKitchen({
      orgId,
      actorId,
      projectName: 'Imported Kitchen',
      fileContent: JSON.stringify(kitchenDoc),
      idempotencyKey: 'idemp-kitch-1',
    });

    expect(mockRpc).toHaveBeenCalledWith('import_kitchen_project', expect.objectContaining({
      p_org_id: orgId,
      p_actor_id: actorId,
      p_project_name: 'Imported Kitchen',
      p_idempotency_key: 'idemp-kitch-1',
    }));

    expect(result.project.id).toBe('proj-123');
    expect(result.space.id).toBe('space-456');
    expect(result.revision.id).toBe('rev-789');
  });

  it('calls import_home_project RPC and maps multi-room entities', async () => {
    const kitchenDoc = createExampleProject();
    const homeDoc = {
      id: 'home-root-1',
      name: '2BHK Apartment',
      bhk: 2,
      kind: 'apartment',
      rooms: [
        { id: 'room-1', name: 'Kitchen', type: 'kitchen', level: 0, x: 0, z: 0, design: kitchenDoc },
        { id: 'room-2', name: 'Master Bed', type: 'bedroom', level: 0, x: 4000, z: 0, design: kitchenDoc },
      ],
    };

    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        projectId: 'proj-home-1',
        project: {
          id: 'proj-home-1',
          org_id: orgId,
          name: '2BHK Apartment',
          status: 'active',
          created_by: actorId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        spaces: [
          { id: 'space-kitch', org_id: orgId, project_id: 'proj-home-1', name: 'Kitchen', space_type: 'kitchen', level: 0, current_revision_id: 'rev-kitch' },
          { id: 'space-bed', org_id: orgId, project_id: 'proj-home-1', name: 'Master Bed', space_type: 'bedroom', level: 0, current_revision_id: 'rev-bed' },
        ],
        revisions: [
          { id: 'rev-kitch', org_id: orgId, project_id: 'proj-home-1', space_id: 'space-kitch', schema_version: 2, format: 'interior-studio/home-room-design', canonical_hash: 'hash-k' },
          { id: 'rev-bed', org_id: orgId, project_id: 'proj-home-1', space_id: 'space-bed', schema_version: 2, format: 'interior-studio/home-room-design', canonical_hash: 'hash-b' },
        ],
      },
      error: null,
    });

    const mockClient = createMockClient(mockRpc);
    const adapter = new SupabasePersistenceAdapter(mockClient);
    const result = await adapter.importHome({
      orgId,
      actorId,
      projectName: '2BHK Apartment',
      fileContent: JSON.stringify(homeDoc),
      idempotencyKey: 'idemp-home-1',
    });

    expect(mockRpc).toHaveBeenCalledWith('import_home_project', expect.objectContaining({
      p_org_id: orgId,
      p_actor_id: actorId,
      p_project_name: '2BHK Apartment',
      p_idempotency_key: 'idemp-home-1',
    }));

    expect(result.project.id).toBe('proj-home-1');
    expect(result.spaces).toHaveLength(2);
    expect(result.revisions).toHaveLength(2);
  });

  it('throws CloudPersistenceError when RPC returns FORBIDDEN or UNAUTHENTICATED', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: false,
        reason: 'FORBIDDEN',
        error: 'Actor lacks permission to create projects in this organization',
      },
      error: null,
    });

    const mockClient = createMockClient(mockRpc);
    const adapter = new SupabasePersistenceAdapter(mockClient);
    await expect(adapter.importKitchen({
      orgId,
      actorId,
      fileContent: JSON.stringify(createExampleProject()),
    })).rejects.toThrow(CloudPersistenceError);
  });
});
