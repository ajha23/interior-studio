/**
 * Cryptographic JWT Verification Engine (Feature 034.2 FR-02, T101, T102, T103).
 * Uses standard Web Crypto API (SubtleCrypto) to verify HMAC-SHA256 signatures,
 * token expirations, clock skew, issuers, and audiences without third-party dependencies.
 */

export interface JwtVerificationOptions {
  secret: string;
  expectedIssuer?: string;
  expectedAudience?: string;
  /** Clock skew allowance in seconds (default: 60). */
  clockSkewSeconds?: number;
}

export type JwtVerificationResult =
  | {
      valid: true;
      payload: Record<string, unknown>;
    }
  | {
      valid: false;
      error: 'MALFORMED_TOKEN' | 'UNSUPPORTED_ALGORITHM' | 'INVALID_SIGNATURE' | 'TOKEN_EXPIRED' | 'TOKEN_NOT_YET_VALID' | 'INVALID_ISSUER' | 'INVALID_AUDIENCE';
      message: string;
    };

/**
 * Base64URL string to Uint8Array decoder.
 */
export function base64UrlToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binaryString = atob(base64 + pad);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Uint8Array to Base64URL string encoder.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Signs a JWT with HMAC-SHA256 (useful for tests and mock session generation).
 */
export async function signJwtHs256(
  payload: Record<string, unknown>,
  secret: string,
  customHeader: Record<string, unknown> = {}
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT', ...customHeader };
  const encoder = new TextEncoder();

  const encodedHeader = bytesToBase64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(dataToSign));
  const signatureBase64Url = bytesToBase64Url(new Uint8Array(signatureBuffer));

  return `${dataToSign}.${signatureBase64Url}`;
}

/**
 * Cryptographically verifies an HMAC-SHA256 JWT using Web Crypto API.
 */
export async function verifyJwtSignature(
  token: string,
  options: JwtVerificationOptions
): Promise<JwtVerificationResult> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'MALFORMED_TOKEN', message: 'JWT must consist of three dot-separated parts' };
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // 1. Decode and check header
  let header: { alg?: string; typ?: string };
  try {
    const headerJson = decoder.decode(base64UrlToBytes(headerB64));
    header = JSON.parse(headerJson);
  } catch {
    return { valid: false, error: 'MALFORMED_TOKEN', message: 'Failed to decode JWT header' };
  }

  if (header.alg !== 'HS256') {
    return { valid: false, error: 'UNSUPPORTED_ALGORITHM', message: `Algorithm "${header.alg}" is not supported. Expected HS256.` };
  }

  // 2. Decode payload
  let payload: Record<string, unknown>;
  try {
    const payloadJson = decoder.decode(base64UrlToBytes(payloadB64));
    payload = JSON.parse(payloadJson);
  } catch {
    return { valid: false, error: 'MALFORMED_TOKEN', message: 'Failed to decode JWT payload' };
  }

  // 3. Verify cryptographic HMAC signature
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(options.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const dataToVerify = encoder.encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlToBytes(signatureB64);

    const isSignatureValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBytes as unknown as BufferSource,
      dataToVerify
    );
    if (!isSignatureValid) {
      return { valid: false, error: 'INVALID_SIGNATURE', message: 'Cryptographic signature verification failed' };
    }
  } catch (err) {
    return {
      valid: false,
      error: 'INVALID_SIGNATURE',
      message: err instanceof Error ? err.message : 'Cryptographic verification exception',
    };
  }

  // 4. Verify Standard Claims (exp, nbf, iss, aud)
  const now = Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 60;

  if (typeof payload.exp === 'number') {
    if (now > payload.exp + skew) {
      return { valid: false, error: 'TOKEN_EXPIRED', message: `Token expired at ${payload.exp} (current time: ${now})` };
    }
  }

  if (typeof payload.nbf === 'number') {
    if (now < payload.nbf - skew) {
      return { valid: false, error: 'TOKEN_NOT_YET_VALID', message: `Token is not valid before ${payload.nbf}` };
    }
  }

  if (options.expectedIssuer && payload.iss !== options.expectedIssuer) {
    return {
      valid: false,
      error: 'INVALID_ISSUER',
      message: `Token issuer "${payload.iss}" does not match expected "${options.expectedIssuer}"`,
    };
  }

  if (options.expectedAudience && payload.aud !== options.expectedAudience) {
    return {
      valid: false,
      error: 'INVALID_AUDIENCE',
      message: `Token audience "${payload.aud}" does not match expected "${options.expectedAudience}"`,
    };
  }

  return { valid: true, payload };
}
