import { describe, it, expect } from 'vitest';
import { createAuditEvent, formatAuditSummary, type AuditRecord } from './audit';

describe('Audit Log Formatting & Event Families (Step A)', () => {
  it('creates a validated audit event payload with timestamp', () => {
    const event = createAuditEvent({
      orgId: 'org_123',
      actorId: 'usr_designer',
      eventFamily: 'production',
      eventAction: 'cutlist_downloaded',
      resourceType: 'project',
      resourceId: 'prj_kitchen_rahul',
      metadata: { format: 'opticut_csv', partCount: 142 },
    });

    expect(event.orgId).toBe('org_123');
    expect(event.actorId).toBe('usr_designer');
    expect(event.eventFamily).toBe('production');
    expect(event.eventAction).toBe('cutlist_downloaded');
    expect(event.metadata.partCount).toBe(142);
    expect(typeof event.createdAt).toBe('string');
  });

  it('formats audit records across required PRD v2 event families', () => {
    const piiEvent: AuditRecord = {
      id: 'a1',
      orgId: 'org1',
      actorId: 'usr_designer',
      eventFamily: 'clients',
      eventAction: 'pii_viewed',
      resourceType: 'client',
      resourceId: 'cl_rahul',
      metadata: {},
      createdAt: new Date().toISOString(),
    };

    expect(formatAuditSummary(piiEvent)).toContain('Client cl_rahul pii_viewed');

    const cutlistEvent: AuditRecord = {
      id: 'a2',
      orgId: 'org1',
      actorId: 'usr_factory',
      eventFamily: 'production',
      eventAction: 'cutlist_downloaded',
      resourceType: 'project',
      resourceId: 'prj_rahul',
      metadata: {},
      createdAt: new Date().toISOString(),
    };

    expect(formatAuditSummary(cutlistEvent)).toContain('Production cut-list prj_rahul cutlist_downloaded');

    const quoteEvent: AuditRecord = {
      id: 'a3',
      orgId: 'org1',
      actorId: 'usr_designer',
      eventFamily: 'quotes',
      eventAction: 'sent',
      resourceType: 'quote',
      resourceId: 'qt_1001',
      metadata: {},
      createdAt: new Date().toISOString(),
    };

    expect(formatAuditSummary(quoteEvent)).toContain('Quote qt_1001 sent');
  });
});

