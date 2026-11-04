/**
 * Supabase Cloud Persistence Adapter (Feature 034.1 FR-04, FR-06, T302).
 * Interacts with PostgreSQL tables and the transactional commit_design_revision RPC.
 */

import { computeCanonicalSha256 } from '@/domain/project/canonicalHash';
import { CloudPersistenceError } from '@/domain/project/cloudErrors';
import type {
  ArchiveProjectParams,
  CloudPersistencePort,
  CommitDesignRevisionParams,
  CommitRevisionOutcome,
  CreateProjectParams,
  CreateSpaceParams,
  GetProjectParams,
  GetSpaceParams,
  GetSyncStateParams,
  ImportHomeParams,
  ImportKitchenParams,
  ListProjectsParams,
  ListSpacesParams,
} from '@/domain/project/cloudPersistencePort';
import type {
  DesignRevision,
  IdempotencyRecord,
  LocalProjectSyncState,
  SaaSProject,
  Space,
} from '@/domain/project/cloudTypes';

export interface SupabaseFilterBuilder {
  select(columns?: string): SupabaseFilterBuilder;
  insert(values: Record<string, unknown>): SupabaseFilterBuilder;
  update(values: Record<string, unknown>): SupabaseFilterBuilder;
  delete(): SupabaseFilterBuilder;
  eq(column: string, value: unknown): SupabaseFilterBuilder;
  neq(column: string, value: unknown): SupabaseFilterBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseFilterBuilder;
  single(): Promise<{ data: unknown; error: Error | null }>;
  then<TResult1 = { data: unknown; error: Error | null }>(
    onfulfilled?: (value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>
  ): Promise<TResult1>;
}

export interface SupabaseClientLike {
  from(table: string): SupabaseFilterBuilder;
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: Error | null }>;
}

export class SupabasePersistenceAdapter implements CloudPersistencePort {
  constructor(private client: SupabaseClientLike) {}

  async createProject(params: CreateProjectParams): Promise<SaaSProject> {
    const { data, error } = await this.client
      .from('projects')
      .insert({
        org_id: params.orgId,
        name: params.name,
        client_id: params.clientId ?? null,
        created_by: params.actorId,
      })
      .select()
      .single();

    if (error || !data) {
      throw CloudPersistenceError.validationFailed('Failed to create project', error);
    }

    const d = data as Record<string, unknown>;
    return {
      id: String(d.id),
      orgId: String(d.org_id),
      clientId: (d.client_id as string) || null,
      name: String(d.name),
      status: d.status as SaaSProject['status'],
      createdBy: (d.created_by as string) || undefined,
      createdAt: String(d.created_at),
      updatedAt: String(d.updated_at),
      archivedAt: (d.archived_at as string) || null,
    };
  }

  async listProjects(params: ListProjectsParams): Promise<SaaSProject[]> {
    const { data, error } = await this.client
      .from('projects')
      .select()
      .eq('org_id', params.orgId)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    if (error) {
      throw CloudPersistenceError.validationFailed('Failed to list projects', error);
    }

    const rows = (data as Record<string, unknown>[] | null) || [];
    return rows.map((row) => ({
      id: String(row.id),
      orgId: String(row.org_id),
      clientId: (row.client_id as string) || null,
      name: String(row.name),
      status: row.status as SaaSProject['status'],
      createdBy: (row.created_by as string) || undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      archivedAt: (row.archived_at as string) || null,
    }));
  }

  async getProject(params: GetProjectParams): Promise<SaaSProject | null> {
    const { data, error } = await this.client
      .from('projects')
      .select()
      .eq('id', params.projectId)
      .eq('org_id', params.orgId)
      .single();

    if (error || !data) return null;

    const d = data as Record<string, unknown>;
    return {
      id: String(d.id),
      orgId: String(d.org_id),
      clientId: (d.client_id as string) || null,
      name: String(d.name),
      status: d.status as SaaSProject['status'],
      createdBy: (d.created_by as string) || undefined,
      createdAt: String(d.created_at),
      updatedAt: String(d.updated_at),
      archivedAt: (d.archived_at as string) || null,
    };
  }

  async archiveProject(params: ArchiveProjectParams): Promise<SaaSProject> {
    const { data, error } = await this.client
      .from('projects')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', params.projectId)
      .eq('org_id', params.orgId)
      .select()
      .single();

    if (error || !data) {
      throw CloudPersistenceError.notFound('Project');
    }

    const d = data as Record<string, unknown>;
    return {
      id: String(d.id),
      orgId: String(d.org_id),
      clientId: (d.client_id as string) || null,
      name: String(d.name),
      status: d.status as SaaSProject['status'],
      createdBy: (d.created_by as string) || undefined,
      createdAt: String(d.created_at),
      updatedAt: String(d.updated_at),
      archivedAt: (d.archived_at as string) || null,
    };
  }

  async createSpace(params: CreateSpaceParams): Promise<Space> {
    const { data, error } = await this.client
      .from('spaces')
      .insert({
        org_id: params.orgId,
        project_id: params.projectId,
        name: params.name,
        space_type: params.type || 'kitchen',
        level: params.level || 0,
        plan_x_mm: params.planPositionMm?.x || 0,
        plan_z_mm: params.planPositionMm?.z || 0,
      })
      .select()
      .single();

    if (error || !data) {
      throw CloudPersistenceError.validationFailed('Failed to create space', error);
    }

    const d = data as Record<string, unknown>;
    return {
      id: String(d.id),
      orgId: String(d.org_id),
      projectId: String(d.project_id),
      name: String(d.name),
      spaceType: d.space_type as Space['spaceType'],
      level: Number(d.level) || 0,
      planPositionMm: { x: Number(d.plan_x_mm) || 0, z: Number(d.plan_z_mm) || 0 },
      currentRevisionId: (d.current_revision_id as string) || null,
      createdAt: String(d.created_at),
      updatedAt: String(d.updated_at),
    };
  }

  async listSpaces(params: ListSpacesParams): Promise<Space[]> {
    const { data, error } = await this.client
      .from('spaces')
      .select()
      .eq('project_id', params.projectId)
      .eq('org_id', params.orgId);

    if (error) {
      throw CloudPersistenceError.validationFailed('Failed to list spaces', error);
    }

    const rows = (data as Record<string, unknown>[] | null) || [];
    return rows.map((row) => ({
      id: String(row.id),
      orgId: String(row.org_id),
      projectId: String(row.project_id),
      name: String(row.name),
      spaceType: row.space_type as Space['spaceType'],
      level: Number(row.level) || 0,
      planPositionMm: { x: Number(row.plan_x_mm) || 0, z: Number(row.plan_z_mm) || 0 },
      currentRevisionId: (row.current_revision_id as string) || null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  async getSpace(params: GetSpaceParams): Promise<Space | null> {
    const { data, error } = await this.client
      .from('spaces')
      .select()
      .eq('id', params.spaceId)
      .eq('org_id', params.orgId)
      .single();

    if (error || !data) return null;

    const d = data as Record<string, unknown>;
    return {
      id: String(d.id),
      orgId: String(d.org_id),
      projectId: String(d.project_id),
      name: String(d.name),
      spaceType: d.space_type as Space['spaceType'],
      level: Number(d.level) || 0,
      planPositionMm: { x: Number(d.plan_x_mm) || 0, z: Number(d.plan_z_mm) || 0 },
      currentRevisionId: (d.current_revision_id as string) || null,
      createdAt: String(d.created_at),
      updatedAt: String(d.updated_at),
    };
  }

  async commitDesignRevision(params: CommitDesignRevisionParams): Promise<CommitRevisionOutcome> {
    const canonicalHash = computeCanonicalSha256(params.snapshot);

    const { data, error } = await this.client.rpc('commit_design_revision', {
      p_org_id: params.orgId,
      p_actor_id: params.actorId,
      p_project_id: params.projectId,
      p_space_id: params.spaceId,
      p_expected_revision_id: params.expectedRevisionId,
      p_schema_version: params.snapshot.schemaVersion,
      p_format: params.snapshot.format,
      p_snapshot_jsonb: params.snapshot,
      p_canonical_hash: canonicalHash,
      p_idempotency_key: params.idempotencyKey,
    });

    if (error) {
      return {
        success: false,
        conflict: false,
        reason: 'VALIDATION_FAILED',
        error: error.message || 'Database error occurred during commit',
      };
    }

    const res = data as {
      success?: boolean;
      conflict?: boolean;
      reason?: 'REVISION_CONFLICT' | 'IDEMPOTENCY_KEY_REUSED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_FAILED';
      currentRevisionId?: string;
      error?: string;
      revisionId: string;
      committedAt?: string;
    } | null;

    if (!res || !res.success) {
      if (res?.conflict) {
        return {
          success: false,
          conflict: true,
          reason: 'REVISION_CONFLICT',
          currentRevisionId: res.currentRevisionId || null,
          error: res.error || 'Revision conflict',
        };
      }
      const nonConflictReason =
        res?.reason === 'REVISION_CONFLICT' ? 'VALIDATION_FAILED' : (res?.reason || 'VALIDATION_FAILED');
      return {
        success: false,
        conflict: false,
        reason: nonConflictReason,
        error: res?.error || 'Operation failed',
      };
    }

    const space = await this.getSpace({ orgId: params.orgId, spaceId: params.spaceId });

    const revision: DesignRevision = {
      id: res.revisionId,
      orgId: params.orgId,
      projectId: params.projectId,
      spaceId: params.spaceId,
      parentRevisionId: params.expectedRevisionId,
      schemaVersion: params.snapshot.schemaVersion,
      format: params.snapshot.format,
      snapshot: params.snapshot,
      canonicalHash,
      createdBy: params.actorId,
      createdAt: res.committedAt || new Date().toISOString(),
    };

    const idempotencyRecord: IdempotencyRecord = {
      id: res.revisionId,
      orgId: params.orgId,
      actorId: params.actorId,
      operation: 'commit_design_revision',
      idempotencyKey: params.idempotencyKey,
      requestHash: canonicalHash,
      responseStatus: 200,
      response: res as unknown as Record<string, unknown>,
      createdAt: res.committedAt || new Date().toISOString(),
    };

    return {
      success: true,
      conflict: false,
      revision,
      updatedSpace: space!,
      idempotencyRecord,
    };
  }

  async importKitchen(params: ImportKitchenParams) {
    const project = await this.createProject({
      orgId: params.orgId,
      actorId: params.actorId,
      name: params.projectName || 'Imported Kitchen Project',
    });

    const space = await this.createSpace({
      orgId: params.orgId,
      actorId: params.actorId,
      projectId: project.id,
      name: 'Kitchen',
      type: 'kitchen',
    });

    const snapshot = {
      schemaVersion: 2,
      format: 'interior-studio/kitchen' as const,
      document: JSON.parse(params.fileContent),
    };

    const commitResult = await this.commitDesignRevision({
      orgId: params.orgId,
      actorId: params.actorId,
      projectId: project.id,
      spaceId: space.id,
      expectedRevisionId: null,
      snapshot,
      idempotencyKey: params.idempotencyKey || `import_kitch_${Date.now()}`,
    });

    if (!commitResult.success) {
      throw new Error(`Failed to commit imported kitchen: ${commitResult.error}`);
    }

    return {
      project,
      space: commitResult.updatedSpace,
      revision: commitResult.revision,
    };
  }

  async importHome(params: ImportHomeParams) {
    const home = JSON.parse(params.fileContent);
    const project = await this.createProject({
      orgId: params.orgId,
      actorId: params.actorId,
      name: params.projectName || home.name || `${home.bhk}BHK ${home.kind}`,
    });

    const spaces: Space[] = [];
    const revisions: DesignRevision[] = [];

    for (const room of home.rooms || []) {
      const space = await this.createSpace({
        orgId: params.orgId,
        actorId: params.actorId,
        projectId: project.id,
        name: room.name,
        type: room.type,
        level: room.level,
        planPositionMm: { x: room.x, z: room.z },
      });

      const commit = await this.commitDesignRevision({
        orgId: params.orgId,
        actorId: params.actorId,
        projectId: project.id,
        spaceId: space.id,
        expectedRevisionId: null,
        snapshot: {
          schemaVersion: 2,
          format: 'interior-studio/kitchen',
          document: room.design,
        },
        idempotencyKey: `${params.idempotencyKey || 'import_home'}_${room.id}`,
      });

      if (commit.success) {
        spaces.push(commit.updatedSpace);
        revisions.push(commit.revision);
      }
    }

    return {
      project,
      spaces,
      revisions,
    };
  }

  async getSyncState(params: GetSyncStateParams): Promise<LocalProjectSyncState> {
    const space = await this.getSpace({ orgId: params.orgId, spaceId: params.spaceId });
    const serverRevId = space?.currentRevisionId ?? null;

    let syncStatus: LocalProjectSyncState['syncStatus'] = 'synced';

    if (params.baseRevisionId !== serverRevId) {
      syncStatus = 'conflict';
    }

    return {
      localProjectId: params.spaceId,
      cloudProjectId: space?.projectId,
      spaceId: params.spaceId,
      baseRevisionId: params.baseRevisionId,
      syncStatus,
      lastSyncedAt: new Date().toISOString(),
      serverHash: null,
      clientHash: params.localHash,
    };
  }
}
