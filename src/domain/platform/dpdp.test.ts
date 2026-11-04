import { describe, it, expect } from 'vitest';
import {
  maskPhoneNumber,
  maskEmail,
  maskAddress,
  isConsentActive,
  toSafeClient,
  exportClientData,
  eraseClientData,
  type ClientRecord,
  type ConsentRecord,
} from './dpdp';

describe('DPDP Act 2023 Masking & Consent (Step A)', () => {
  it('correctly masks standard Indian 10-digit mobile numbers', () => {
    expect(maskPhoneNumber('9876543210')).toBe('98******10');
    expect(maskPhoneNumber('9123456789')).toBe('91******89');
  });

  it('handles edge case phone numbers safely', () => {
    expect(maskPhoneNumber('123')).toBe('****');
    expect(maskPhoneNumber('1234')).toBe('12****34');
  });

  it('correctly masks emails while preserving domain', () => {
    expect(maskEmail('john.doe@interiorstudio.com')).toBe('j***e@interiorstudio.com');
    expect(maskEmail('me@test.com')).toBe('m*@test.com');
    expect(maskEmail('bad')).toBe('***@***.com');
  });

  it('masks address for protected roles', () => {
    expect(maskAddress('Villa 42, Palm Meadows, Whitefield, Bengaluru')).toBe('[Protected Site Address]');
    expect(maskAddress('')).toBe('');
    expect(maskAddress(null)).toBe('');
  });

  it('checks active consent and handles withdrawal', () => {
    const validConsent: ConsentRecord = {
      id: 'c1',
      orgId: 'org1',
      noticeVersion: 'v1.0',
      purpose: 'modular_kitchen_design',
      capturedAt: '2026-01-01T00:00:00.000Z',
      withdrawnAt: null,
    };

    expect(isConsentActive(validConsent)).toBe(true);

    const withdrawnConsent: ConsentRecord = {
      ...validConsent,
      withdrawnAt: '2026-02-01T00:00:00.000Z',
    };

    // Checked after withdrawal date
    expect(isConsentActive(withdrawnConsent, new Date('2026-03-01'))).toBe(false);

    // Checked before withdrawal date
    expect(isConsentActive(withdrawnConsent, new Date('2026-01-15'))).toBe(true);
  });

  it('projects raw client to safe client based on PII permission', () => {
    const rawClient: ClientRecord = {
      id: 'client_101',
      orgId: 'org1',
      name: 'Dr. Rahul Sharma',
      mobile: '9876543210',
      email: 'rahul.sharma@hospital.org',
      siteAddress: 'Flat 402, Prestige Tower, Bangalore',
      gstin: '29ABCDE1234F1Z5',
      consentId: 'c1',
    };

    // User with PII permission (e.g. Designer or Owner)
    const privilegedView = toSafeClient(rawClient, true);
    expect(privilegedView.isPiiMasked).toBe(false);
    expect(privilegedView.mobile).toBe('9876543210');
    expect(privilegedView.email).toBe('rahul.sharma@hospital.org');
    expect(privilegedView.siteAddress).toBe('Flat 402, Prestige Tower, Bangalore');

    // User without PII permission (e.g. Production or Viewer)
    const maskedView = toSafeClient(rawClient, false);
    expect(maskedView.isPiiMasked).toBe(true);
    expect(maskedView.mobile).toBe('98******10');
    expect(maskedView.email).toBe('r***a@hospital.org');
    expect(maskedView.siteAddress).toBe('[Protected Site Address]');
    expect(maskedView.name).toBe('Dr. Rahul Sharma'); // Name remains visible for identification
    expect(maskedView.gstin).toBe('29ABCDE1234F1Z5');
  });

  it('exports structured client data bundle per DPDP Section 11', () => {
    const rawClient: ClientRecord = {
      id: 'client_202',
      orgId: 'org1',
      name: 'Pooja Hegde',
      mobile: '9845012345',
      email: 'pooja@example.com',
      siteAddress: 'Indiranagar 100ft Rd, Bangalore',
      gstin: null,
      consentId: 'consent_99',
    };

    const consent: ConsentRecord = {
      id: 'consent_99',
      orgId: 'org1',
      noticeVersion: 'DPDP-2023-V1',
      purpose: 'kitchen_design_and_execution',
      capturedAt: '2026-03-01T10:00:00.000Z',
    };

    const exported = exportClientData(rawClient, consent, ['proj_villa_01']);
    expect(exported.exportVersion).toBe('DPDP-2023-EXPORT-V1');
    expect(exported.client.name).toBe('Pooja Hegde');
    expect(exported.client.mobile).toBe('9845012345');
    expect(exported.consent?.noticeVersion).toBe('DPDP-2023-V1');
    expect(exported.associatedProjects).toEqual(['proj_villa_01']);
  });

  it('erases client PII per DPDP Section 12 while preserving project link and generating audit payload', () => {
    const rawClient: ClientRecord = {
      id: 'client_303',
      orgId: 'org1',
      name: 'Amitabh Sen',
      mobile: '9900112233',
      email: 'amitabh@sen.org',
      siteAddress: 'Salt Lake Sector V, Kolkata',
      gstin: '19ABCDE1234F1Z5',
      consentId: 'c_amitabh',
    };

    const { erasedClient, auditPayload } = eraseClientData(rawClient);

    expect(erasedClient.id).toBe('client_303');
    expect(erasedClient.name).toBe('Anonymized Client');
    expect(erasedClient.mobile).toBe('0000000000');
    expect(erasedClient.email).toBeNull();
    expect(erasedClient.siteAddress).toBe('Redacted per DPDP Section 12');
    expect(erasedClient.gstin).toBeNull();

    expect(auditPayload.action).toBe('client.erased');
    expect(auditPayload.clientId).toBe('client_303');
    expect(auditPayload.retainedData).toContain('anonymized form');
  });
});

