/**
 * Authoritative Application Persistence Port Interface (Feature 034.1 FR-04, T301).
 * Pure framework-free TypeScript port for cloud project, space, and revision persistence.
 */

import type {
  DesignRevision,
  DesignSnapshot,
  IdempotencyRecord,
  LocalProjectSyncState,
  SaaSProject,
  Space,
  SpaceType,
} from './cloudTypes';

export type CommitRevisionOutcome =
  | {
      success: true;
      conflict: false;
      revision: DesignRevision;
      updatedSpace: Space;
      idempotencyRecord: IdempotencyRecord;
    }
  | {
      success: false;
      conflict: true;
      reason: 'REVISION_CONFLICT';
      currentRevisionId: string | null;
      error: string;
    }
  | {
      success: false;
      conflict: false;
      reason: 'IDEMPOTENCY_KEY_REUSED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_FAILED';
      error: string;
    };

export interface CreateProjectParams {
  orgId: string;
  actorId: string;
  name: string;
  clientId?: string | null;
}

export interface ListProjectsParams {
  orgId: string;
  actorId?: string;
}

export interface GetProjectParams {
  orgId: string;
  projectId: string;
}

export interface ArchiveProjectParams {
  orgId: string;
  actorId: string;
  projectId: string;
  idempotencyKey?: string;
}

export interface CreateSpaceParams {
  orgId: string;
  actorId: string;
  projectId: string;
  name: string;
  type?: SpaceType;
  level?: number;
  planPositionMm?: { x: number; z: number };
}

export interface ListSpacesParams {
  orgId: string;
  projectId: string;
}

export interface GetSpaceParams {
  orgId: string;
  spaceId: string;
}

export interface CommitDesignRevisionParams {
  orgId: string;
  actorId: string;
  projectId: string;
  spaceId: string;
  expectedRevisionId: string | null;
  snapshot: DesignSnapshot;
  idempotencyKey: string;
}

export interface ImportKitchenParams {
  orgId: string;
  actorId: string;
  fileContent: string;
  projectName?: string;
  idempotencyKey?: string;
}

export interface ImportHomeParams {
  orgId: string;
  actorId: string;
  fileContent: string;
  projectName?: string;
  idempotencyKey?: string;
}

export interface GetRevisionParams {
  orgId: string;
  revisionId: string;
}

export interface GetSyncStateParams {
  orgId: string;
  spaceId: string;
  localHash: string;
  baseRevisionId: string | null;
}

export interface CloudPersistencePort {
  createProject(params: CreateProjectParams): Promise<SaaSProject>;
  listProjects(params: ListProjectsParams): Promise<SaaSProject[]>;
  getProject(params: GetProjectParams): Promise<SaaSProject | null>;
  archiveProject(params: ArchiveProjectParams): Promise<SaaSProject>;
  createSpace(params: CreateSpaceParams): Promise<Space>;
  listSpaces(params: ListSpacesParams): Promise<Space[]>;
  getSpace(params: GetSpaceParams): Promise<Space | null>;
  getRevision(params: GetRevisionParams): Promise<DesignRevision | null>;
  commitDesignRevision(params: CommitDesignRevisionParams): Promise<CommitRevisionOutcome>;
  importKitchen(params: ImportKitchenParams): Promise<{ project: SaaSProject; space: Space; revision: DesignRevision }>;
  importHome(params: ImportHomeParams): Promise<{ project: SaaSProject; spaces: Space[]; revisions: DesignRevision[] }>;
  getSyncState(params: GetSyncStateParams): Promise<LocalProjectSyncState>;
}
