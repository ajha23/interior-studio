// Spec 054, research R5: every Supabase Auth error the email sign-in can meet maps to one message.
// The error shapes are copied from the local-stack spike (2026-11-06).
import { describe, expect, it } from 'vitest';
import { emailAuthError } from './emailAuthErrors';

const err = (code: string | undefined, message: string, status?: number) => ({ code, message, status });

describe('emailAuthError', () => {
  it('same address within the cooldown: wait message with the seconds left', () => {
    const r = emailAuthError(err('over_email_send_rate_limit', 'For security purposes, you can only request this after 42 seconds.', 429), 'send');
    expect(r).toEqual({ message: 'Please wait 42 seconds before asking for another email.', retryAfterSeconds: 42 });
  });

  it('one second left reads naturally', () => {
    expect(emailAuthError(err('over_email_send_rate_limit', 'For security purposes, you can only request this after 1 seconds.'), 'send').message).toBe(
      'Please wait 1 second before asking for another email.',
    );
  });

  it('project-wide hourly cap: the same code without seconds, and the message offers Google', () => {
    const r = emailAuthError(err('over_email_send_rate_limit', 'email rate limit exceeded', 429), 'send');
    expect(r.message).toBe('Too many sign-in emails right now. Try again in a few minutes or continue with Google.');
    expect(r.retryAfterSeconds).toBeUndefined();
  });

  it('wrong or expired code (Supabase reports both as otp_expired)', () => {
    expect(emailAuthError(err('otp_expired', 'Token has expired or is invalid', 403), 'code').message).toBe('That code is not right or has expired.');
  });

  it('used, expired or superseded link', () => {
    expect(emailAuthError(err('otp_expired', 'Email link is invalid or has expired', 403), 'link').message).toBe('This sign-in link has expired.');
  });

  it('too many verification attempts', () => {
    expect(emailAuthError(err('over_request_rate_limit', 'Request rate limit reached', 429), 'code').message).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it.each(['email_address_invalid', 'validation_failed'])('invalid address (%s)', (code) => {
    expect(emailAuthError(err(code, 'Unable to validate email address: invalid format', 400), 'send').message).toBe('Enter a valid email address.');
  });

  it('a sending failure or an unknown error while sending', () => {
    const text = "We couldn't send the email. Try again or continue with Google.";
    expect(emailAuthError(err('unexpected_failure', 'Error sending magic link email', 500), 'send').message).toBe(text);
    expect(emailAuthError(err(undefined, 'Failed to fetch'), 'send').message).toBe(text);
    expect(emailAuthError(null, 'send').message).toBe(text);
  });

  it('an unknown error while verifying points back to a new email', () => {
    expect(emailAuthError(err(undefined, 'boom', 500), 'code').message).toBe("That didn't work. Try again or ask for a new email.");
    expect(emailAuthError(err(undefined, 'boom', 500), 'link').message).toBe('This sign-in link has expired.');
  });
});
