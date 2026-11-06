import { createContext } from 'react';

export type OrgRole = 'owner' | 'admin' | 'designer' | 'viewer';

/** The studio's plan, e.g. 'free' (self-serve studios, spec 042 US5), 'pro', 'inhouse'. Module gating is spec 055. */
export type StudioPlan = string;

export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
  plan: StudioPlan;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Result of an email sign-in step (spec 054). On success, the session arrives via onAuthStateChange. */
export type EmailResult = { ok: true } | { ok: false; message: string; retryAfterSeconds?: number };

export interface SessionState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: SessionUser | null;
  memberships: Membership[];
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  /** Present only in local and test builds (`VITE_AUTH_PASSWORD_SIGN_IN === 'true'`). */
  signInWithPassword: ((email: string, password: string) => Promise<void>) | null;
  /** Sends the sign-in email (link + 6-digit code) to the address (spec 054, FR-002). */
  sendEmailCode: (email: string) => Promise<EmailResult>;
  /** Signs in with the 6-digit code from the email. */
  verifyEmailCode: (email: string, code: string) => Promise<EmailResult>;
  /** Signs in with the emailed link's token, on any device (spec 054, FR-004). */
  confirmEmailLink: (tokenHash: string) => Promise<EmailResult>;
  signOut: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
}

export const SessionContext = createContext<SessionState | null>(null);

/** The last studio a user opened; a convenience only, cleared on sign-out. */
export const LAST_STUDIO_KEY = 'interior-studio:last-studio';
