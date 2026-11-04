import { describe, expect, it } from 'vitest';
import { signJwtHs256, verifyJwtSignature } from './jwtVerifier';

describe('Cryptographic JWT Verification (Feature 034.2 FR-02)', () => {
  const secret = 'super_secure_supabase_jwt_secret_key_12345';
  const wrongSecret = 'another_unrelated_secret_key_67890';

  it('verifies valid HMAC-SHA256 signature and returns decoded payload', async () => {
    const claims = {
      sub: 'user_123',
      org_id: 'org_456',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = await signJwtHs256(claims, secret);
    const result = await verifyJwtSignature(token, {
      secret,
      expectedAudience: 'authenticated',
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.sub).toBe('user_123');
      expect(result.payload.org_id).toBe('org_456');
    }
  });

  it('rejects token when secret does not match', async () => {
    const claims = { sub: 'user_123', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, { secret: wrongSecret });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('INVALID_SIGNATURE');
    }
  });

  it('rejects token when payload has been tampered with', async () => {
    const token = await signJwtHs256(
      { sub: 'user_regular', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret
    );
    const parts = token.split('.');

    // Tamper with payload in the middle to elevate privilege
    const tamperedPayload = btoa(
      JSON.stringify({ sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).replace(/=+$/, '');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = await verifyJwtSignature(tamperedToken, { secret });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('INVALID_SIGNATURE');
    }
  });

  it('rejects expired token', async () => {
    const claims = {
      sub: 'user_123',
      exp: Math.floor(Date.now() / 1000) - 100, // 100s in past
    };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, {
      secret,
      clockSkewSeconds: 10,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('TOKEN_EXPIRED');
    }
  });

  it('rejects token missing mandatory exp claim', async () => {
    const claims = { sub: 'user_123' };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, { secret });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('MALFORMED_TOKEN');
      expect(result.message).toContain('expiration ("exp") claim');
    }
  });

  it('verifies token with array audience when expected audience is present', async () => {
    const claims = {
      sub: 'user_123',
      aud: ['authenticated', 'storage_user'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, {
      secret,
      expectedAudience: 'authenticated',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects token with array audience when expected audience is missing', async () => {
    const claims = {
      sub: 'user_123',
      aud: ['analytics_consumer', 'storage_user'],
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, {
      secret,
      expectedAudience: 'authenticated',
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('INVALID_AUDIENCE');
    }
  });

  it('rejects token before valid window (nbf in future)', async () => {
    const claims = {
      sub: 'user_123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: Math.floor(Date.now() / 1000) + 500, // 500s in future
    };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, {
      secret,
      clockSkewSeconds: 10,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('TOKEN_NOT_YET_VALID');
    }
  });

  it('rejects token when audience does not match expected', async () => {
    const claims = {
      sub: 'user_123',
      aud: 'unauthorized_audience',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, {
      secret,
      expectedAudience: 'authenticated',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('INVALID_AUDIENCE');
    }
  });

  it('rejects token when issuer does not match expected', async () => {
    const claims = {
      sub: 'user_123',
      iss: 'https://attacker.com/auth',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await signJwtHs256(claims, secret);

    const result = await verifyJwtSignature(token, {
      secret,
      expectedIssuer: 'https://supabase.studio.interior/auth',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('INVALID_ISSUER');
    }
  });
});
