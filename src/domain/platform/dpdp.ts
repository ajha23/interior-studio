/**
 * Digital Personal Data Protection (DPDP) Act 2023 Compliance Primitives.
 * Handles field-level masking of Phone, Email, and Site Address, and Consent Tracking.
 */

export interface ConsentRecord {
  id: string;
  orgId: string;
  noticeVersion: string;
  purpose: string;
  capturedAt: string; // ISO 8601
  withdrawnAt?: string | null; // ISO 8601
}

export interface ClientRecord {
  id: string;
  orgId: string;
  name: string;
  mobile: string;
  email?: string | null;
  siteAddress?: string | null;
  gstin?: string | null;
  consentId?: string | null;
}

export interface SafeClient {
  id: string;
  orgId: string;
  name: string;
  mobile: string;
  email?: string | null;
  siteAddress?: string | null;
  gstin?: string | null;
  consentId?: string | null;
  isPiiMasked: boolean;
}

/**
 * Masks a mobile number, retaining only the first 2 and last 2 digits.
 * E.g., '9876543210' -> '98******10'
 */
export function maskPhoneNumber(mobile: string): string {
  const clean = mobile.trim();
  if (clean.length < 4) {
    return '****';
  }
  const prefix = clean.slice(0, 2);
  const suffix = clean.slice(-2);
  const stars = '*'.repeat(Math.max(clean.length - 4, 4));
  return `${prefix}${stars}${suffix}`;
}

/**
 * Masks an email address, retaining first char, last char of username, and domain.
 * E.g., 'john.doe@example.com' -> 'j***e@example.com'
 */
export function maskEmail(email: string): string {
  const clean = email.trim();
  const atIndex = clean.indexOf('@');
  if (atIndex < 2) {
    return '***@***.com';
  }
  const username = clean.slice(0, atIndex);
  const domain = clean.slice(atIndex);
  
  if (username.length <= 2) {
    return `${username[0]}*${domain}`;
  }
  
  const first = username[0];
  const last = username[username.length - 1];
  return `${first}***${last}${domain}`;
}

/**
 * Masks site address for roles without PII access (e.g. production/viewer).
 */
export function maskAddress(address?: string | null): string {
  if (!address || address.trim().length === 0) return '';
  return '[Protected Site Address]';
}

/**
 * Verifies if consent is active and not withdrawn.
 */
export function isConsentActive(consent: ConsentRecord | null | undefined, asOfDate: Date = new Date()): boolean {
  if (!consent) return false;
  const captured = new Date(consent.capturedAt);
  if (isNaN(captured.getTime()) || captured > asOfDate) return false;
  if (consent.withdrawnAt) {
    const withdrawn = new Date(consent.withdrawnAt);
    if (!isNaN(withdrawn.getTime()) && withdrawn <= asOfDate) {
      return false;
    }
  }
  return true;
}

/**
 * Projects a raw client record to a safe client record, masking PII if the actor lacks permission.
 */
export function toSafeClient(client: ClientRecord, canViewPii: boolean): SafeClient {
  if (canViewPii) {
    return {
      ...client,
      isPiiMasked: false,
    };
  }

  return {
    id: client.id,
    orgId: client.orgId,
    name: client.name,
    mobile: maskPhoneNumber(client.mobile),
    email: client.email ? maskEmail(client.email) : null,
    siteAddress: maskAddress(client.siteAddress),
    gstin: client.gstin || null,
    consentId: client.consentId || null,
    isPiiMasked: true,
  };
}

