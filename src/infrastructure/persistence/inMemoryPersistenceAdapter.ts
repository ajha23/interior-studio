/**
 * In-Memory Cloud Persistence Adapter (Feature 034.1 FR-04, T302, T307).
 * Implements CloudPersistencePort with rigorous transactional constraints,
 * Compare-and-Swap (CAS) revision atomicity, and durable idempotency ledgering.
 */

import { computeCanonicalSha256 } from '@/domain/project/canonicalHash';
import { CloudPersistenceError } from '@/domain/project/cloudErrors';
import {
  importStandaloneKitchenFile,
  importWholeHomeFile,
} from '@/domain/project/cloudPersistence';
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
  LegacyImportMapping,
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

export class InMemoryPersistenceAdapter implements CloudPersistencePort {
  private projects = new Map<string, SaaSProject>();
  private spaces = new Map<string, Space>();
  private revisions = new Map<string, DesignRevision>();
  private idempotency = new Map<string, IdempotencyRecord>();
  private mappings = new Map<string, LegacyImportMapping>();
  private outbox: Array<{
    id: string;
    orgId: string;
    eventType: string;
    aggregateId: string;
    payload: unknown;
  }> = [];

  async createProject(params: CreateProjectParams): Promise<SaaSProject> {
    const now = new Date().toISOString();
    const project: SaaSProject = {
      id: generateUUID(),
      orgId: params.orgId,
      clientId: params.clientId ?? null,
      name: params.name,
      status: 'active',
      createdBy: params.actorId,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(project.id, project);
    return project;
  }

  async listProjects(params: ListProjectsParams): Promise<SaaSProject[]> {
    return Array.from(this.projects.values()).filter(
      (p) => p.orgId === params.orgId && p.status !== 'deleted'
    );
  }

  async getProject(params: GetProjectParams): Promise<SaaSProject | null> {
    const project = this.projects.get(params.projectId);
    if (!project || project.orgId !== params.orgId || project.status === 'deleted') {
      return null;
    }
    return project;
  }

  async archiveProject(params: ArchiveProjectParams): Promise<SaaSProject> {
    const project = await this.getProject({ orgId: params.orgId, projectId: params.projectId });
    if (!project) {
      throw CloudPersistenceError.notFound('Project');
    }

    const updated: SaaSProject = {
      ...project,
      status: 'archived',
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.projects.set(updated.id, updated);
    return updated;
  }

  async createSpace(params: CreateSpaceParams): Promise<Space> {
    const project = await this.getProject({ orgId: params.orgId, projectId: params.projectId });
    if (!project) {
      throw CloudPersistenceError.notFound('Project');
    }

    const now = new Date().toISOString();
    const space: Space = {
      id: generateUUID(),
      orgId: params.orgId,
      projectId: params.projectId,
      name: params.name,
      spaceType: params.type || 'kitchen',
      level: params.level || 0,
      planPositionMm: params.planPositionMm || { x: 0, z: 0 },
      currentRevisionId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.spaces.set(space.id, space);
    return space;
  }

  async listSpaces(params: ListSpacesParams): Promise<Space[]> {
    return Array.from(this.spaces.values()).filter(
      (s) => s.orgId === params.orgId && s.projectId === params.projectId
    );
  }

  async getSpace(params: GetSpaceParams): Promise<Space | null> {
    const space = this.spaces.get(params.spaceId);
    if (!space || space.orgId !== params.orgId) {
      return null;
    }
    return space;
  }

  async getRevision(params: { orgId: string; revisionId: string }): Promise<DesignRevision | null> {
    const rev = this.revisions.get(params.revisionId);
    if (!rev || rev.orgId !== params.orgId) {
      return null;
    }
    return rev;
  }

  async commitDesignRevision(params: CommitDesignRevisionParams): Promise<CommitRevisionOutcome> {
    const space = await this.getSpace({ orgId: params.orgId, spaceId: params.spaceId });
    if (!space || space.projectId !== params.projectId) {
      return {
        success: false,
        conflict: false,
        reason: 'NOT_FOUND',
        error: 'Target space not found in this project and organization',
      };
    }

    const canonicalHash = computeCanonicalSha256(params.snapshot);
    const idempKey = `${params.orgId}:${params.actorId}:commit:${params.idempotencyKey}`;
    const existingIdemp = this.idempotency.get(idempKey);

    // Idempotency Verification (FR-07, T405, T406)
    if (existingIdemp) {
      if (existingIdemp.requestHash === canonicalHash) {
        const storedRevId = (existingIdemp.response as { revisionId?: string })?.revisionId;
        const storedRev = storedRevId ? this.revisions.get(storedRevId) : null;
        if (storedRev) {
          return {
            success: true,
            conflict: false,
            revision: storedRev,
            updatedSpace: space,
            idempotencyRecord: existingIdemp,
          };
        }
      } else {
        return {
          success: false,
          conflict: false,
          reason: 'IDEMPOTENCY_KEY_REUSED',
          error: 'Idempotency key reused with different request payload',
        };
      }
    }

    // Compare-and-Swap (CAS) Concurrency Check (FR-06, T403)
    if (space.currentRevisionId !== params.expectedRevisionId) {
      return {
        success: false,
        conflict: true,
        reason: 'REVISION_CONFLICT',
        currentRevisionId: space.currentRevisionId ?? null,
        error: 'Space current revision has changed since the local draft was created',
      };
    }

    // Atomic Insertion
    const revisionId = generateUUID();
    const now = new Date().toISOString();
    const revision: DesignRevision = {
      id: revisionId,
      orgId: params.orgId,
      projectId: params.projectId,
      spaceId: params.spaceId,
      parentRevisionId: space.currentRevisionId,
      schemaVersion: params.snapshot.schemaVersion,
      format: params.snapshot.format,
      snapshot: params.snapshot,
      canonicalHash,
      createdBy: params.actorId,
      createdAt: now,
    };

    const updatedSpace: Space = {
      ...space,
      currentRevisionId: revisionId,
      updatedAt: now,
    };

    const idempRecord: IdempotencyRecord = {
      id: generateUUID(),
      orgId: params.orgId,
      actorId: params.actorId,
      operation: 'commit_design_revision',
      idempotencyKey: params.idempotencyKey,
      requestHash: canonicalHash,
      responseStatus: 200,
      response: { revisionId, currentRevisionId: revisionId, canonicalHash },
      createdAt: now,
    };

    // Commit writes
    this.revisions.set(revision.id, revision);
    this.spaces.set(updatedSpace.id, updatedSpace);
    this.idempotency.set(idempKey, idempRecord);
    this.outbox.push({
      id: generateUUID(),
      orgId: params.orgId,
      eventType: 'space.revision_committed',
      aggregateId: params.spaceId,
      payload: { revisionId, canonicalHash },
    });

    return {
      success: true,
      conflict: false,
      revision,
      updatedSpace,
      idempotencyRecord: idempRecord,
    };
  }

  async importKitchen(params: ImportKitchenParams) {
    const result = importStandaloneKitchenFile(params.fileContent, {
      orgId: params.orgId,
      actorId: params.actorId,
      projectName: params.projectName,
    });

    this.projects.set(result.project.id, result.project);
    this.spaces.set(result.space.id, result.space);
    this.revisions.set(result.revision.id, result.revision);
    this.mappings.set(result.mapping.id, result.mapping);

    return {
      project: result.project,
      space: result.space,
      revision: result.revision,
    };
  }

  async importHome(params: ImportHomeParams) {
    const result = importWholeHomeFile(params.fileContent, {
      orgId: params.orgId,
      actorId: params.actorId,
      projectName: params.projectName,
    });

    this.projects.set(result.project.id, result.project);
    for (const s of result.spaces) {
      this.spaces.set(s.id, s);
    }
    for (const r of result.revisions) {
      this.revisions.set(r.id, r);
    }
    for (const m of result.mappings) {
      this.mappings.set(m.id, m);
    }

    return {
      project: result.project,
      spaces: result.spaces,
      revisions: result.revisions,
    };
  }

  async getSyncState(params: GetSyncStateParams): Promise<LocalProjectSyncState> {
    const space = await this.getSpace({ orgId: params.orgId, spaceId: params.spaceId });
    const serverRevId = space?.currentRevisionId ?? null;
    const serverRev = serverRevId ? this.revisions.get(serverRevId) : null;
    const serverHash = serverRev?.canonicalHash ?? null;

    let syncStatus: LocalProjectSyncState['syncStatus'] = 'synced';

    if (params.baseRevisionId !== serverRevId) {
      syncStatus = 'conflict';
    } else if (params.localHash !== serverHash) {
      syncStatus = 'draft';
    }

    return {
      localProjectId: params.spaceId,
      cloudProjectId: space?.projectId,
      spaceId: params.spaceId,
      baseRevisionId: params.baseRevisionId,
      syncStatus,
      lastSyncedAt: new Date().toISOString(),
      serverHash,
      clientHash: params.localHash,
    };
  }

  // Inspection helpers for testing
  getOutboxEvents() {
    return [...this.outbox];
  }
}
