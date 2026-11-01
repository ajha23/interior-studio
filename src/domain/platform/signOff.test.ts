import { describe, it, expect } from 'vitest';
import { createClientSignOff, isSignOffAccepted, ClientSignOffSchema } from './signOff';

describe('Client Sign-Off Domain Module', () => {
  it('creates and validates a valid client acceptance sign-off record', () => {
    const signOff = createClientSignOff({
      id: 'signoff_001',
      projectId: 'proj_kitchen_101',
      quoteNumber: 'QT-2026-001',
      quoteSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      clientName: 'Sunita Sharma',
      clientMobile: '9876543210',
      clientEmail: 'sunita.sharma@example.com',
      status: 'accepted',
      ipAddress: '103.21.124.5',
      consentNoticeVersion: 'DPDP-2023-V1',
      notes: 'Approved with high-gloss laminate finish',
    });

    expect(signOff.status).toBe('accepted');
    expect(signOff.signedBy).toBe('Sunita Sharma');
    expect(signOff.clientMobile).toBe('9876543210');
    expect(isSignOffAccepted(signOff)).toBe(true);
  });

  it('rejects invalid mobile numbers or missing client name', () => {
    expect(() =>
      createClientSignOff({
        id: 'signoff_002',
        projectId: 'proj_kitchen_101',
        quoteNumber: 'QT-2026-001',
        quoteSha256: 'hash12345678',
        clientName: 'A', // Too short (<2 chars)
        clientMobile: '9876543210',
        status: 'accepted',
      })
    ).toThrow();

    expect(() =>
      createClientSignOff({
        id: 'signoff_003',
        projectId: 'proj_kitchen_101',
        quoteNumber: 'QT-2026-001',
        quoteSha256: 'hash12345678',
        clientName: 'Sunita Sharma',
        clientMobile: '12345', // Invalid Indian mobile
        status: 'accepted',
      })
    ).toThrow();
  });

  it('parses valid schema directly', () => {
    const parsed = ClientSignOffSchema.parse({
      id: 's1',
      projectId: 'p1',
      quoteNumber: 'Q1',
      quoteSha256: 'abcdef12345678',
      clientName: 'Ramesh Patel',
      clientMobile: '9123456789',
      status: 'pending',
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
      consentNoticeVersion: 'DPDP-2023-V1',
      signedBy: 'Ramesh Patel',
    });

    expect(parsed.status).toBe('pending');
    expect(isSignOffAccepted(parsed)).toBe(false);
  });
});

