/**
 * Supabase Auth errors from email sign-in → the message the user sees (spec 054, FR-009, FR-013,
 * research R5). Pure: the limits themselves are enforced by Supabase Auth, never here.
 */
export type EmailAuthContext = 'send' | 'code' | 'link';

export interface EmailAuthMessage {
  message: string;
  /** Seconds until another email may be requested, when Supabase says so. */
  retryAfterSeconds?: number;
}

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

const COULD_NOT_SEND = "We couldn't send the email. Try again or continue with Google.";
const LINK_EXPIRED = 'This sign-in link has expired.';

export function emailAuthError(error: unknown, context: EmailAuthContext): EmailAuthMessage {
  const e = (error && typeof error === 'object' ? error : {}) as AuthErrorLike;
  const code = e.code ?? '';
  const text = e.message ?? '';

  if (code === 'over_email_send_rate_limit') {
    const wait = /after (\d+) seconds?/i.exec(text);
    if (wait) {
      const seconds = Number(wait[1]);
      return { message: `Please wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'} before asking for another email.`, retryAfterSeconds: seconds };
    }
    return { message: 'Too many sign-in emails right now. Try again in a few minutes or continue with Google.' };
  }
  if (code === 'over_request_rate_limit') return { message: 'Too many attempts. Wait a minute and try again.' };
  if (code === 'email_address_invalid' || code === 'validation_failed') return { message: 'Enter a valid email address.' };

  if (context === 'link') return { message: LINK_EXPIRED };
  if (context === 'code') {
    return { message: code === 'otp_expired' ? 'That code is not right or has expired.' : "That didn't work. Try again or ask for a new email." };
  }
  return { message: COULD_NOT_SEND };
}
