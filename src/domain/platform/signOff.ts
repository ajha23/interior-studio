/**
 * Client Sign-Off & DPDP Digital Acceptance Domain Module.
 * Authoritative record of digital quotation sign-off and client legal consent.
 *
 * Rules:
 * - Framework-free TypeScript.
 * - Strict schema validation.
 */

import { z } from 'zod';

export const ClientSignOffSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  quoteNumber: z.string().min(1),
  quoteSha256: z.string().min(8), // Hash of the accepted quotation payload
  clientName: z.string().min(2, 'Client name must be at least 2 characters'),
  clientMobile: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  clientEmail: z.string().email().optional(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  timestamp: z.string(), // ISO 8601
  ipAddress: z.string().default('127.0.0.1'),
  consentNoticeVersion: z.string().default('DPDP-2023-V1'),
  signedBy: z.string().min(2),
  notes: z.string().optional(),
});

export type ClientSignOff = z.infer<typeof ClientSignOffSchema>;

/**
 * Creates and validates an immutable digital acceptance sign-off record.
 */
export function createClientSignOff(params: {
  id: string;
  projectId: string;
  quoteNumber: string;
  quoteSha256: string;
  clientName: string;
  clientMobile: string;
  clientEmail?: string;
  status: 'accepted' | 'rejected';
  ipAddress?: string;
  consentNoticeVersion?: string;
  notes?: string;
}): ClientSignOff {
  const record: ClientSignOff = {
    id: params.id,
    projectId: params.projectId,
    quoteNumber: params.quoteNumber,
    quoteSha256: params.quoteSha256,
    clientName: params.clientName.trim(),
    clientMobile: params.clientMobile.replace(/\D/g, ''),
    clientEmail: params.clientEmail?.trim(),
    status: params.status,
    timestamp: new Date().toISOString(),
    ipAddress: params.ipAddress || '127.0.0.1',
    consentNoticeVersion: params.consentNoticeVersion || 'DPDP-2023-V1',
    signedBy: params.clientName.trim(),
    notes: params.notes?.trim(),
  };

  return ClientSignOffSchema.parse(record);
}

/**
 * Verifies whether a sign-off record meets statutory acceptance criteria.
 */
export function isSignOffAccepted(signOff: ClientSignOff): boolean {
  return (
    signOff.status === 'accepted' &&
    signOff.clientName.length >= 2 &&
    signOff.quoteSha256.length >= 8 &&
    Boolean(signOff.timestamp)
  );
}

