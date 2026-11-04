/**
 * Typed Error Model for Cloud Project Persistence (Feature 034.1 FR-11).
 * Pure framework-free TypeScript domain error definitions.
 */

export type CloudPersistenceErrorCode =
  | 'UNAUTHENTICATED'
  | 'ORG_MEMBERSHIP_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'REVISION_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'RATE_LIMITED'
  | 'RETRYABLE_UNAVAILABLE'
  | 'INTERNAL';

export interface CloudPersistenceErrorDetails {
  code: CloudPersistenceErrorCode;
  message: string;
  currentRevisionId?: string | null;
  details?: unknown;
}

export class CloudPersistenceError extends Error {
  readonly code: CloudPersistenceErrorCode;
  readonly currentRevisionId?: string | null;
  readonly details?: unknown;

  constructor({ code, message, currentRevisionId, details }: CloudPersistenceErrorDetails) {
    super(message);
    this.name = 'CloudPersistenceError';
    this.code = code;
    this.currentRevisionId = currentRevisionId;
    this.details = details;
  }

  static unauthenticated(message = 'Authentication required'): CloudPersistenceError {
    return new CloudPersistenceError({ code: 'UNAUTHENTICATED', message });
  }

  static orgMembershipRequired(message = 'Active organization membership required'): CloudPersistenceError {
    return new CloudPersistenceError({ code: 'ORG_MEMBERSHIP_REQUIRED', message });
  }

  static forbidden(message = 'Insufficient permissions or access denied'): CloudPersistenceError {
    return new CloudPersistenceError({ code: 'FORBIDDEN', message });
  }

  static notFound(resource = 'Resource'): CloudPersistenceError {
    return new CloudPersistenceError({ code: 'NOT_FOUND', message: `${resource} not found` });
  }

  static validationFailed(message: string, details?: unknown): CloudPersistenceError {
    return new CloudPersistenceError({ code: 'VALIDATION_FAILED', message, details });
  }

  static revisionConflict(currentRevisionId: string | null, message = 'Design revision conflict detected'): CloudPersistenceError {
    return new CloudPersistenceError({ code: 'REVISION_CONFLICT', message, currentRevisionId });
  }

  static idempotencyKeyReused(message = 'Idempotency key reused with different request payload'): CloudPersistenceError {
    return new CloudPersistenceError({ code: 'IDEMPOTENCY_KEY_REUSED', message });
  }
}
