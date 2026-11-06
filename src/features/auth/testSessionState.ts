/** A complete fake `SessionState` for component tests (unit tests only). Override what a test needs. */
import { vi } from 'vitest';
import type { SessionState } from './sessionContext';

export function fakeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    status: 'signed-out',
    user: null,
    memberships: [],
    error: null,
    signInWithGoogle: vi.fn(async () => {}),
    signInWithPassword: null,
    sendEmailCode: vi.fn(async () => ({ ok: true }) as const),
    verifyEmailCode: vi.fn(async () => ({ ok: true }) as const),
    confirmEmailLink: vi.fn(async () => ({ ok: true }) as const),
    signOut: vi.fn(async () => {}),
    refreshMemberships: vi.fn(async () => {}),
    ...overrides,
  };
}
