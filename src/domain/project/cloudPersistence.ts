/**
 * Pure Framework-Free Domain Service for Cloud Project Foundation & Persistence (Feature 034).
 * Adheres strictly to Constitution Principles I, II, III, IV, VI, VII, VIII, X.
 */

import { parseHomeFile, type Home } from '../home/schema';
import { parseProjectFile } from '../project/serialization';
import type { KitchenProject } from '../schema';
import { computeCanonicalSha256 } from './canonicalHash';

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
import type {
  DesignRevision,
  DesignSnapshot,
  IdempotencyRecord,
  LegacyImportMapping,
  LocalProjectSyncState,
  SaaSProject,
  Space,
  SpaceType,
  SyncStatus,
} from './cloudTypes';

export interface CommitRevisionInput {
  orgId: string;
  projectId: string;
  spaceId: string;
  expectedRevisionId: string | null;
  snapshot: DesignSnapshot;
  actorId?: string;
  idempotencyKey?: string;
}

export type CommitRevisionResult =
  | {
      success: true;
      revision: DesignRevision;
      updatedSpace: Space;
      idempotentReplay?: boolean;
    }
  | {
      success: false;
      conflict: true;
      reason: string;
      currentRevisionId: string | null;
    }
  | {
      success: false;
      conflict: false;
      error: string;
    };

/**
 * Executes compare-and-swap (CAS) commit of a design revision.
 * Enforces:
 * - Expected parent revision matches current space state (atomic CAS).
 * - Same-space lineage constraint.
 * - Deterministic UTF-8 canonical SHA-256 hash.
 * - Idempotency replay and conflict detection.
 */
export function commitSpaceRevision(
  space: Space,
  existingRevisions: DesignRevision[],
  idempotencyRecords: IdempotencyRecord[],
  input: CommitRevisionInput,
  now = new Date()
): CommitRevisionResult {
  // 1. Tenant and Project Context Validation
  if (space.orgId !== input.orgId) {
    return { success: false, conflict: false, error: 'Tenant boundary mismatch.' };
  }
  if (space.projectId !== input.projectId || space.id !== input.spaceId) {
    return { success: false, conflict: false, error: 'Project or space context mismatch.' };
  }

  // 2. Canonical SHA-256 Hash Calculation
  const canonicalHash = computeCanonicalSha256(input.snapshot);

  // 3. Idempotency Check
  if (input.idempotencyKey) {
    const existing = idempotencyRecords.find(
      (r) =>
        r.orgId === input.orgId &&
        r.actorId === (input.actorId ?? 'system') &&
        r.operation === 'commit_revision' &&
        r.idempotencyKey === input.idempotencyKey
    );
    if (existing) {
      if (existing.requestHash === canonicalHash) {
        const cachedRevision = existingRevisions.find(
          (r) => r.id === (existing.response['revisionId'] as string)
        );
        if (cachedRevision) {
          return {
            success: true,
            revision: cachedRevision,
            updatedSpace: space,
            idempotentReplay: true,
          };
        }
      } else {
        return {
          success: false,
          conflict: true,
          reason: 'Idempotency conflict: same idempotency key provided with different payload.',
          currentRevisionId: space.currentRevisionId ?? null,
        };
      }
    }
  }

  // 4. Compare-and-Swap (CAS) Check (T407, T408)
  const currentRevId = space.currentRevisionId ?? null;
  if (input.expectedRevisionId !== currentRevId) {
    return {
      success: false,
      conflict: true,
      reason: `Stale commit: expected revision '${input.expectedRevisionId}', but current space revision is '${currentRevId}'.`,
      currentRevisionId: currentRevId,
    };
  }

  // 5. Parent Lineage Integrity
  if (input.expectedRevisionId) {
    const parent = existingRevisions.find((r) => r.id === input.expectedRevisionId);
    if (!parent) {
      return {
        success: false,
        conflict: false,
        error: `Parent revision '${input.expectedRevisionId}' not found in revision history.`,
      };
    }
    if (parent.spaceId !== space.id) {
      return {
        success: false,
        conflict: false,
        error: `Parent revision '${parent.id}' belongs to space '${parent.spaceId}', not current space '${space.id}'.`,
      };
    }
  }

  // 6. Create Immutable Revision
  const revisionId = generateUUID();
  const newRevision: DesignRevision = {
    id: revisionId,
    orgId: input.orgId,
    projectId: input.projectId,
    spaceId: input.spaceId,
    parentRevisionId: input.expectedRevisionId,
    schemaVersion: input.snapshot.schemaVersion,
    format: input.snapshot.format,
    snapshot: input.snapshot,
    canonicalHash,
    createdBy: input.actorId,
    createdAt: now.toISOString(),
  };

  // 7. Advance Space Current Pointer
  const updatedSpace: Space = {
    ...space,
    currentRevisionId: revisionId,
    updatedAt: now.toISOString(),
  };

  return {
    success: true,
    revision: newRevision,
    updatedSpace,
  };
}

/**
 * Imports a standalone kitchen file (*.json) into a SaaS Project + Space + Initial Revision.
 * Preserves legacy editor IDs and all scene elements inside the snapshot document.
 */
export function importStandaloneKitchenFile(
  fileContent: string,
  options: {
    orgId: string;
    actorId?: string;
    clientId?: string | null;
    projectName?: string;
  },
  now = new Date()
): {
  project: SaaSProject;
  space: Space;
  revision: DesignRevision;
  mapping: LegacyImportMapping;
} {
  const parseResult = parseProjectFile(fileContent);
  if (!parseResult.ok) {
    throw new Error(`Invalid kitchen project file: ${parseResult.errors.join('; ')}`);
  }

  const projectDoc: KitchenProject = parseResult.project;
  const projectId = generateUUID();
  const spaceId = generateUUID();
  const revisionId = generateUUID();

  const snapshot: DesignSnapshot = {
    format: 'interior-studio/kitchen',
    schemaVersion: 2,
    document: projectDoc,
  };
  const canonicalHash = computeCanonicalSha256(snapshot);

  const project: SaaSProject = {
    id: projectId,
    orgId: options.orgId,
    clientId: options.clientId ?? null,
    name: options.projectName || projectDoc.name || 'Imported Kitchen',
    status: 'active',
    createdBy: options.actorId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const space: Space = {
    id: spaceId,
    orgId: options.orgId,
    projectId,
    name: 'Kitchen',
    spaceType: 'kitchen',
    level: 0,
    planPositionMm: { x: 0, z: 0 },
    currentRevisionId: revisionId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const revision: DesignRevision = {
    id: revisionId,
    orgId: options.orgId,
    projectId,
    spaceId,
    parentRevisionId: null,
    schemaVersion: 2,
    format: 'interior-studio/kitchen',
    snapshot,
    canonicalHash,
    createdBy: options.actorId,
    createdAt: now.toISOString(),
  };

  const mapping: LegacyImportMapping = {
    id: generateUUID(),
    orgId: options.orgId,
    sourceFormat: 'interior-studio/kitchen',
    sourceEntityType: 'kitchen',
    sourceEntityId: projectDoc.id,
    targetProjectId: projectId,
    targetSpaceId: spaceId,
    firstImportedRevisionId: revisionId,
    importedBy: options.actorId,
    importedAt: now.toISOString(),
  };

  return { project, space, revision, mapping };
}

/**
 * Imports a whole-home file (apartment/villa) into one SaaS Project with one Space per HomeRoom.
 * Preserves room level, x/z coordinates, room types, and provenance IDs.
 */
export function importWholeHomeFile(
  fileContent: string,
  options: {
    orgId: string;
    actorId?: string;
    clientId?: string | null;
    projectName?: string;
  },
  now = new Date()
): {
  project: SaaSProject;
  spaces: Space[];
  revisions: DesignRevision[];
  mappings: LegacyImportMapping[];
} {
  const parseResult = parseHomeFile(fileContent);
  if (!parseResult.ok) {
    throw new Error(`Invalid home file: ${parseResult.errors.join('; ')}`);
  }

  const home: Home = parseResult.home;
  const projectId = generateUUID();
  const spaces: Space[] = [];
  const revisions: DesignRevision[] = [];
  const mappings: LegacyImportMapping[] = [];

  const project: SaaSProject = {
    id: projectId,
    orgId: options.orgId,
    clientId: options.clientId ?? null,
    name: options.projectName || home.name || `${home.bhk}BHK ${home.kind}`,
    status: 'active',
    createdBy: options.actorId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // Map Home root mapping
  mappings.push({
    id: generateUUID(),
    orgId: options.orgId,
    sourceFormat: 'interior-studio/home',
    sourceEntityType: 'home',
    sourceEntityId: home.id,
    targetProjectId: projectId,
    targetSpaceId: null,
    firstImportedRevisionId: null,
    importedBy: options.actorId,
    importedAt: now.toISOString(),
  });

  for (const room of home.rooms) {
    const spaceId = generateUUID();
    const revisionId = generateUUID();

    const snapshot: DesignSnapshot = {
      format: 'interior-studio/home-room-design',
      schemaVersion: 2,
      document: room.design,
      provenance: {
        homeSourceId: home.id,
        roomSourceId: room.id,
        homeKind: home.kind,
        level: room.level,
        planPositionMm: { x: room.x, z: room.z },
      },
    };
    const canonicalHash = computeCanonicalSha256(snapshot);

    const space: Space = {
      id: spaceId,
      orgId: options.orgId,
      projectId,
      name: room.name,
      spaceType: (['kitchen', 'bedroom', 'living', 'dining', 'bathroom', 'utility', 'office'].includes(room.type)
        ? room.type
        : 'other') as SpaceType,
      level: room.level,
      planPositionMm: { x: room.x, z: room.z },
      currentRevisionId: revisionId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const revision: DesignRevision = {
      id: revisionId,
      orgId: options.orgId,
      projectId,
      spaceId,
      parentRevisionId: null,
      schemaVersion: 2,
      format: 'interior-studio/home-room-design',
      snapshot,
      canonicalHash,
      createdBy: options.actorId,
      createdAt: now.toISOString(),
    };

    const mapping: LegacyImportMapping = {
      id: generateUUID(),
      orgId: options.orgId,
      sourceFormat: 'interior-studio/home-room',
      sourceEntityType: 'room',
      sourceEntityId: room.id,
      targetProjectId: projectId,
      targetSpaceId: spaceId,
      firstImportedRevisionId: revisionId,
      importedBy: options.actorId,
      importedAt: now.toISOString(),
    };

    spaces.push(space);
    revisions.push(revision);
    mappings.push(mapping);
  }

  return { project, spaces, revisions, mappings };
}

/**
 * Evaluates authorization for project/space access according to approved product decision D034-02:
 * - Feature 034 supports 'all_projects' and 'assigned_projects' ONLY.
 * - 'team_projects', 'client_projects', and 'specific_projects' are explicitly REJECTED in 034.
 * - 'assigned_projects' REQUIRES non-null targetProjectId AND user assignment in assignedProjectIds.
 */
export function evaluateCloudProjectScope(
  actor: {
    userId: string;
    orgId: string;
    assignedProjectIds: string[];
    hasAllProjectsPermission?: boolean;
    hasAssignedProjectsPermission?: boolean;
  },
  requestedScope: string,
  targetProjectId: string | null | undefined
): { allowed: boolean; reason?: string } {
  // Reject unsupported scopes explicitly (D034-02, T306a)
  if (['team_projects', 'client_projects', 'specific_projects'].includes(requestedScope)) {
    return {
      allowed: false,
      reason: `Scope '${requestedScope}' is not supported in Feature 034. Only 'all_projects' and 'assigned_projects' are supported.`,
    };
  }

  if (requestedScope === 'all_projects') {
    if (actor.hasAllProjectsPermission) {
      return { allowed: true };
    }
    return { allowed: false, reason: "Missing required 'all_projects' permission grant." };
  }

  if (requestedScope === 'assigned_projects') {
    // Missing project context MUST deny (T305, T305a)
    if (!targetProjectId) {
      return {
        allowed: false,
        reason: "Access denied: 'assigned_projects' scope requires explicit non-null project context.",
      };
    }
    if (actor.hasAssignedProjectsPermission && actor.assignedProjectIds.includes(targetProjectId)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `User is not an assigned member of project '${targetProjectId}'.`,
    };
  }

  return {
    allowed: false,
    reason: `Unknown or unhandled scope '${requestedScope}'.`,
  };
}

/**
 * Evaluates local client draft status relative to server state (T508a, T610a, T610b).
 * Ensures zero silent last-write-wins: local drafts conflicting with newer server revisions are preserved.
 */
export function evaluateSyncConflict(
  localSync: LocalProjectSyncState,
  serverRevision: DesignRevision | null
): {
  status: SyncStatus;
  hasConflict: boolean;
  canAutoCommit: boolean;
  reason?: string;
} {
  if (!serverRevision) {
    // Server has no revisions yet: clean initial commit
    return {
      status: 'draft',
      hasConflict: false,
      canAutoCommit: true,
    };
  }

  const baseRev = localSync.baseRevisionId ?? null;
  const serverRevId = serverRevision.id;

  if (baseRev === serverRevId) {
    if (localSync.clientHash && localSync.clientHash === serverRevision.canonicalHash) {
      return {
        status: 'synced',
        hasConflict: false,
        canAutoCommit: false,
      };
    }
    // Local modifications made on top of current revision: ready to commit
    return {
      status: 'draft',
      hasConflict: false,
      canAutoCommit: true,
    };
  }

  // Base revision diverged from server revision -> Stale Conflict
  return {
    status: 'conflict',
    hasConflict: true,
    canAutoCommit: false,
    reason: `Local draft is based on revision '${baseRev}', but server has advanced to revision '${serverRevId}'.`,
  };
}
