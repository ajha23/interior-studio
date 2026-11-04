import { z } from 'zod';
import { KitchenProjectSchema } from '../schema';

export const SpaceTypeSchema = z.enum([
  'kitchen',
  'bedroom',
  'living',
  'dining',
  'bathroom',
  'utility',
  'office',
  'other',
]);
export type SpaceType = z.infer<typeof SpaceTypeSchema>;

export const SaaSProjectStatusSchema = z.enum(['active', 'archived', 'deleted']);
export type SaaSProjectStatus = z.infer<typeof SaaSProjectStatusSchema>;

export const SaaSProjectSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  clientId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  status: SaaSProjectStatusSchema.default('active'),
  createdBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable().optional(),
});
export type SaaSProject = z.infer<typeof SaaSProjectSchema>;

export const SpaceSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  spaceType: SpaceTypeSchema.default('kitchen'),
  level: z.number().int().default(0),
  planPositionMm: z.object({
    x: z.number(), // millimeter coordinate
    z: z.number(), // millimeter coordinate
  }),
  currentRevisionId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Space = z.infer<typeof SpaceSchema>;

export const KitchenDesignSnapshotSchema = z.object({
  format: z.literal('interior-studio/kitchen'),
  schemaVersion: z.number().int(),
  document: KitchenProjectSchema,
});
export type KitchenDesignSnapshot = z.infer<typeof KitchenDesignSnapshotSchema>;

export const HomeRoomDesignSnapshotSchema = z.object({
  format: z.literal('interior-studio/home-room-design'),
  schemaVersion: z.number().int(),
  document: KitchenProjectSchema,
  provenance: z.object({
    homeSourceId: z.string(),
    roomSourceId: z.string(),
    homeKind: z.enum(['apartment', 'villa']),
    level: z.number().int(),
    planPositionMm: z.object({
      x: z.number(),
      z: z.number(),
    }),
  }),
});
export type HomeRoomDesignSnapshot = z.infer<typeof HomeRoomDesignSnapshotSchema>;

export const DesignSnapshotSchema = z.discriminatedUnion('format', [
  KitchenDesignSnapshotSchema,
  HomeRoomDesignSnapshotSchema,
]);
export type DesignSnapshot = z.infer<typeof DesignSnapshotSchema>;

export const DesignRevisionSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  spaceId: z.string().uuid(),
  parentRevisionId: z.string().uuid().nullable().optional(),
  schemaVersion: z.number().int().default(2),
  format: z.string(),
  snapshot: DesignSnapshotSchema,
  canonicalHash: z.string().length(64),
  createdBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
});
export type DesignRevision = z.infer<typeof DesignRevisionSchema>;

export const LegacyImportMappingSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  sourceFormat: z.string(),
  sourceEntityType: z.enum(['kitchen', 'home', 'room']),
  sourceEntityId: z.string(),
  targetProjectId: z.string().uuid(),
  targetSpaceId: z.string().uuid().nullable().optional(),
  firstImportedRevisionId: z.string().uuid().nullable().optional(),
  importedBy: z.string().uuid().optional(),
  importedAt: z.string().datetime(),
});
export type LegacyImportMapping = z.infer<typeof LegacyImportMappingSchema>;

export const IdempotencyRecordSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  actorId: z.string().uuid(),
  operation: z.string(),
  idempotencyKey: z.string(),
  requestHash: z.string(),
  responseStatus: z.number().int(),
  response: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type IdempotencyRecord = z.infer<typeof IdempotencyRecordSchema>;

export const SyncStatusSchema = z.enum(['synced', 'draft', 'syncing', 'conflict', 'failed']);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const LocalProjectSyncStateSchema = z.object({
  localProjectId: z.string(),
  cloudProjectId: z.string().uuid().nullable().optional(),
  spaceId: z.string().uuid().nullable().optional(),
  baseRevisionId: z.string().uuid().nullable().optional(),
  syncStatus: SyncStatusSchema.default('draft'),
  lastSyncedAt: z.string().datetime().nullable().optional(),
  serverHash: z.string().length(64).nullable().optional(),
  clientHash: z.string().length(64).nullable().optional(),
  error: z.string().nullable().optional(),
});
export type LocalProjectSyncState = z.infer<typeof LocalProjectSyncStateSchema>;
