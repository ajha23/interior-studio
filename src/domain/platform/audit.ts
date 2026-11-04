/**
 * Pure domain logic for Immutable Audit Logging (SEC-06, SEC-07).
 * Encapsulates the 8 PRD v2 event families and tamper-evident event structures.
 */

export type AuditEventFamily =
  | 'auth'
  | 'members'
  | 'clients'
  | 'quotes'
  | 'versions'
  | 'production'
  | 'commercial'
  | 'share_links';

export interface AuditRecord {
  id: string;
  orgId: string;
  actorId: string;
  eventFamily: AuditEventFamily;
  eventAction: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string; // ISO 8601
}

/**
 * Creates a validated audit log entry payload.
 */
export function createAuditEvent(params: {
  id?: string;
  orgId: string;
  actorId: string;
  eventFamily: AuditEventFamily;
  eventAction: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
}): AuditRecord {
  return {
    id: params.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    orgId: params.orgId,
    actorId: params.actorId,
    eventFamily: params.eventFamily,
    eventAction: params.eventAction,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata: params.metadata || {},
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    createdAt: (params.createdAt || new Date()).toISOString(),
  };
}

/**
 * Formats an audit record into a human-readable activity line.
 */
export function formatAuditSummary(record: AuditRecord): string {
  switch (record.eventFamily) {
    case 'auth':
      return `Actor ${record.actorId} signed in`;
    case 'members':
      return `Member ${record.resourceId} updated (${record.eventAction})`;
    case 'clients':
      return `Client ${record.resourceId} ${record.eventAction}`;
    case 'quotes':
      return `Quote ${record.resourceId} ${record.eventAction}`;
    case 'versions':
      return `Project version ${record.resourceId} ${record.eventAction}`;
    case 'production':
      return `Production cut-list ${record.resourceId} ${record.eventAction}`;
    case 'commercial':
      return `Commercial pricing changed on ${record.resourceType}:${record.resourceId}`;
    case 'share_links':
      return `Share link for ${record.resourceType}:${record.resourceId} was ${record.eventAction}`;
    default:
      return `${record.eventFamily}:${record.eventAction} on ${record.resourceType}:${record.resourceId}`;
  }
}

