/**
 * Verified Actor & Organization Membership Resolver (Feature 034.1 FR-01, T101, T102, T103).
 * Cryptographically verifies tokens or trusted session context; denies untrusted header-spoofing in production.
 */

import type { ActorContext, ActorRole } from '@/domain/platform/authorization/types';
import { CloudPersistenceError } from '@/domain/project/cloudErrors';
import { verifyJwtSignature } from './jwtVerifier';

export interface VerifiedMembershipRecord {
  userId: string;
  orgId: string;
  status: 'active' | 'suspended' | 'invited';
  roles: ActorRole[];
}

export interface ActorResolverOptions {
  /** Optional lookup to check active membership in database or directory. */
  membershipLookup?: (userId: string, orgId: string) => Promise<VerifiedMembershipRecord | null> | VerifiedMembershipRecord | null;
  /** Cryptographic JWT verification secret. Falls back to SUPABASE_JWT_SECRET. */
  jwtSecret?: string;
  expectedIssuer?: string;
  expectedAudience?: string;
  /** Allow test header bypass only when explicitly set (never in production). */
  allowTestHeaders?: boolean;
}

/**
 * Resolves verified actor context from the request.
 * Derives user ID strictly from the verified session / JWT subject,
 * verifies active tenant membership in the target organization,
 * and explicitly rejects forged client identity headers.
 */
export async function resolveVerifiedActor(
  req: Request,
  options: ActorResolverOptions = {}
): Promise<ActorContext | null> {
  const isProduction = process.env.NODE_ENV === 'production';
  const authHeader = req.headers.get('authorization');

  // Check for Bearer token
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    const secret = options.jwtSecret || process.env.SUPABASE_JWT_SECRET;

    // Fail closed: secret MUST be configured; unverified decoding is forbidden (FR-03, T103)
    if (!secret) {
      throw CloudPersistenceError.unauthenticated(
        'JWT verification secret is required but not configured. Unverified token decoding is rejected.'
      );
    }

    const verifyResult = await verifyJwtSignature(token, {
      secret,
      expectedIssuer: options.expectedIssuer,
      expectedAudience: options.expectedAudience,
    });
    if (!verifyResult.valid) {
      throw CloudPersistenceError.unauthenticated(`Invalid JWT: ${verifyResult.message}`);
    }
    const payload = verifyResult.payload;

    if (!payload || !payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    const userId = payload.sub;
    const headerOrgId = req.headers.get('x-org-id');
    const claimOrgId = payload.org_id as string | undefined;

    // Disallow cross-tenant mismatch between token claim and requested header
    if (claimOrgId && headerOrgId && claimOrgId !== headerOrgId) {
      throw CloudPersistenceError.forbidden(
        'Token tenant claim does not match requested organization'
      );
    }

    const requestedOrgId = headerOrgId || claimOrgId;

    if (!requestedOrgId) {
      return null;
    }

    // Active membership verification is mandatory for cloud operations (FR-04, T104)
    if (!options.membershipLookup) {
      throw CloudPersistenceError.unauthenticated(
        'Active organization membership lookup is required for cloud operations.'
      );
    }

    const membership = await options.membershipLookup(userId, requestedOrgId);
    if (!membership || membership.status !== 'active') {
      throw CloudPersistenceError.orgMembershipRequired(
        'User is not an active member of the requested organization'
      );
    }

    return {
      id: userId,
      orgId: requestedOrgId,
      roles: membership.roles,
      teamId: payload.team_id as string | undefined,
      clientId: payload.client_id as string | undefined,
    };
  }

  // Reject caller-supplied identity headers in production or if test headers are not explicitly allowed
  if (isProduction || !options.allowTestHeaders) {
    if (req.headers.has('x-user-id') || req.headers.has('x-user-roles')) {
      // Discard untrusted identity claims
      return null;
    }
  }

  // Only allowed in local test/dev when explicitly enabled
  if (options.allowTestHeaders) {
    const userId = req.headers.get('x-user-id');
    const orgId = req.headers.get('x-org-id');
    if (!userId || !orgId) return null;

    let roles: ActorRole[] = [];
    const rolesHeader = req.headers.get('x-user-roles');
    if (rolesHeader) {
      try {
        roles = JSON.parse(rolesHeader);
      } catch {
        roles = [];
      }
    }

    return {
      id: userId,
      orgId,
      roles,
      teamId: req.headers.get('x-team-id') || undefined,
      clientId: req.headers.get('x-client-id') || undefined,
    };
  }

  return null;
}
