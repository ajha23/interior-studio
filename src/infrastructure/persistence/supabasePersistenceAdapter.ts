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
  DesignSnapshot,
  IdempotencyRecord,
  LocalProjectSyncState,
  SaaSProject,
  Space,
} from '@/domain/project/cloudTypes';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

  async getRevision(params: { orgId: string; revisionId: string }): Promise<DesignRevision | null> {
    const { data, error } = await this.client
      .from('design_revisions')
      .select()
      .eq('id', params.revisionId)
      .eq('org_id', params.orgId)
      .single();

    if (error || !data) return null;

    const d = data as Record<string, unknown>;
    return {
      id: String(d.id),
      orgId: String(d.org_id),
      projectId: String(d.project_id),
      spaceId: String(d.space_id),
      parentRevisionId: (d.parent_revision_id as string) || null,
      schemaVersion: Number(d.schema_version) || 2,
      format: String(d.format),
      snapshot: d.snapshot_jsonb as DesignRevision['snapshot'],
      canonicalHash: String(d.canonical_hash),
      createdBy: (d.created_by as string) || undefined,
      createdAt: String(d.created_at),
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

  async importKitchen(params: ImportKitchenParams): Promise<{
    project: SaaSProject;
    space: Space;
    revision: DesignRevision;
  }> {
    const doc = JSON.parse(params.fileContent);
    const snapshot: DesignSnapshot = {
      schemaVersion: 2,
      format: 'interior-studio/kitchen',
      document: doc,
    };
    const canonicalHash = computeCanonicalSha256(snapshot);
    const idempotencyKey = params.idempotencyKey || `import_kitch_${generateUUID()}`;

    const { data, error } = await this.client.rpc('import_kitchen_project', {
      p_org_id: params.orgId,
      p_actor_id: params.actorId,
      p_project_name: params.projectName || doc.name || 'Imported Kitchen Project',
      p_snapshot_jsonb: snapshot,
      p_canonical_hash: canonicalHash,
      p_idempotency_key: idempotencyKey,
      p_source_file_id: params.sourceFileId || 'kitchen_upload',
    });

    if (error || !data) {
      throw CloudPersistenceError.validationFailed('Failed to import kitchen project', error);
    }

    const res = data as Record<string, unknown>;
    if (res.success === false) {
      if (res.reason === 'UNAUTHENTICATED') {
        throw CloudPersistenceError.unauthenticated(String(res.error || 'Authentication required'));
      }
      if (res.reason === 'FORBIDDEN') {
        throw CloudPersistenceError.forbidden(String(res.error || 'Permission denied'));
      }
      throw new Error(`Import failed: ${res.reason || res.error}`);
    }

    const projData = res.project as Record<string, unknown>;
    const spaceData = res.space as Record<string, unknown>;
    const revData = res.revision as Record<string, unknown>;

    const project: SaaSProject = {
      id: String(projData.id),
      orgId: String(projData.org_id),
      clientId: (projData.client_id as string) || null,
      name: String(projData.name),
      status: projData.status as SaaSProject['status'],
      createdBy: (projData.created_by as string) || undefined,
      createdAt: String(projData.created_at),
      updatedAt: String(projData.updated_at),
      archivedAt: (projData.archived_at as string) || null,
    };

    const space: Space = {
      id: String(spaceData.id),
      orgId: String(spaceData.org_id),
      projectId: String(spaceData.project_id),
      name: String(spaceData.name),
      spaceType: spaceData.space_type as Space['spaceType'],
      level: Number(spaceData.level) || 0,
      planPositionMm: (spaceData.plan_position_mm as { x: number; z: number }) || { x: 0, z: 0 },
      currentRevisionId: (spaceData.current_revision_id as string) || null,
      createdAt: String(spaceData.created_at),
      updatedAt: String(spaceData.updated_at),
    };

    const revision: DesignRevision = {
      id: String(revData.id),
      orgId: String(revData.org_id),
      projectId: String(revData.project_id),
      spaceId: String(revData.space_id),
      parentRevisionId: null,
      schemaVersion: Number(revData.schema_version) || 2,
      format: String(revData.format),
      snapshot: (revData.snapshot_jsonb || snapshot) as DesignRevision['snapshot'],
      canonicalHash: String(revData.canonical_hash || canonicalHash),
      createdBy: (revData.created_by as string) || undefined,
      createdAt: String(revData.created_at),
    };

    return { project, space, revision };
  }

  async importHome(params: ImportHomeParams): Promise<{
    project: SaaSProject;
    spaces: Space[];
    revisions: DesignRevision[];
  }> {
    const home = JSON.parse(params.fileContent);
    const roomsJsonb = (home.rooms || []).map((room: Record<string, unknown>) => {
      const snapshot: DesignSnapshot = {
        format: 'interior-studio/home-room-design',
        schemaVersion: 2,
        document: room.design as DesignSnapshot['document'],
        provenance: {
          homeSourceId: String(home.id || ''),
          roomSourceId: String(room.id || generateUUID()),
          homeKind: (home.kind === 'villa' ? 'villa' : 'apartment') as 'villa' | 'apartment',
          level: Number(room.level) || 0,
          planPositionMm: { x: Number(room.x) || 0, z: Number(room.z) || 0 },
        },
      };
      return {
        id: String(room.id || generateUUID()),
        name: String(room.name || 'Room'),
        type: String(room.type || 'other'),
        level: Number(room.level) || 0,
        x: Number(room.x) || 0,
        z: Number(room.z) || 0,
        snapshot,
        canonical_hash: computeCanonicalSha256(snapshot),
      };
    });

    const homeCanonicalHash = computeCanonicalSha256({
      homeId: home.id,
      rooms: roomsJsonb.map((r: { canonical_hash: string }) => r.canonical_hash),
    });
    const idempotencyKey = params.idempotencyKey || `import_home_${generateUUID()}`;

    const { data, error } = await this.client.rpc('import_home_project', {
      p_org_id: params.orgId,
      p_actor_id: params.actorId,
      p_project_name: params.projectName || home.name || `${home.bhk || 2}BHK ${home.kind || 'apartment'}`,
      p_home_id: String(home.id || ''),
      p_rooms_jsonb: roomsJsonb,
      p_canonical_hash: homeCanonicalHash,
      p_idempotency_key: idempotencyKey,
    });

    if (error || !data) {
      throw CloudPersistenceError.validationFailed('Failed to import home project', error);
    }

    const res = data as Record<string, unknown>;
    if (res.success === false) {
      if (res.reason === 'UNAUTHENTICATED') {
        throw CloudPersistenceError.unauthenticated(String(res.error || 'Authentication required'));
      }
      if (res.reason === 'FORBIDDEN') {
        throw CloudPersistenceError.forbidden(String(res.error || 'Permission denied'));
      }
      throw new Error(`Import failed: ${res.reason || res.error}`);
    }

    const projData = res.project as Record<string, unknown>;
    const project: SaaSProject = {
      id: String(projData.id),
      orgId: String(projData.org_id),
      clientId: (projData.client_id as string) || null,
      name: String(projData.name),
      status: projData.status as SaaSProject['status'],
      createdBy: (projData.created_by as string) || undefined,
      createdAt: String(projData.created_at),
      updatedAt: String(projData.updated_at),
      archivedAt: (projData.archived_at as string) || null,
    };

    const spacesRows = (res.spaces as Record<string, unknown>[]) || [];
    const spaces: Space[] = spacesRows.map((s) => ({
      id: String(s.id),
      orgId: String(s.org_id || params.orgId),
      projectId: String(s.project_id || project.id),
      name: String(s.name),
      spaceType: (s.space_type as Space['spaceType']) || 'other',
      level: Number(s.level) || 0,
      planPositionMm: (s.plan_position_mm as { x: number; z: number }) || { x: 0, z: 0 },
      currentRevisionId: (s.current_revision_id as string) || null,
      createdAt: String(s.created_at || new Date().toISOString()),
      updatedAt: String(s.updated_at || new Date().toISOString()),
    }));

    const revisionsRows = (res.revisions as Record<string, unknown>[]) || [];
    const revisions: DesignRevision[] = revisionsRows.map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id || params.orgId),
      projectId: String(r.project_id || project.id),
      spaceId: String(r.space_id),
      parentRevisionId: null,
      schemaVersion: Number(r.schema_version) || 2,
      format: String(r.format || 'interior-studio/home-room-design'),
      snapshot: r.snapshot_jsonb as DesignRevision['snapshot'],
      canonicalHash: String(r.canonical_hash),
      createdBy: (r.created_by as string) || undefined,
      createdAt: String(r.created_at || new Date().toISOString()),
    }));

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
