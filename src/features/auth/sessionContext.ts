import { createContext } from 'react';

export type OrgRole = 'owner' | 'admin' | 'designer' | 'viewer';

export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface SessionState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: SessionUser | null;
  memberships: Membership[];
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  /** Present only in local and test builds (`VITE_AUTH_PASSWORD_SIGN_IN === 'true'`). */
  signInWithPassword: ((email: string, password: string) => Promise<void>) | null;
  signOut: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
}

export const SessionContext = createContext<SessionState | null>(null);

/** The last studio a user opened; a convenience only, cleared on sign-out. */
export const LAST_STUDIO_KEY = 'interior-studio:last-studio';
