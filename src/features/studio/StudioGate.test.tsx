import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionContext, type Membership, type SessionState } from '@/features/auth/sessionContext';
import { StudioGate } from './StudioGate';

const alpha: Membership = { orgId: 'org-a', orgName: 'Alpha Studio', orgSlug: 'alpha', role: 'admin' };

function session(memberships: Membership[]): SessionState {
  return {
    status: 'signed-in',
    user: { id: 'u1', email: 'admin.a@example.test', name: 'Alpha Admin', avatarUrl: null },
    memberships,
    error: null,
    signInWithGoogle: vi.fn(async () => {}),
    signInWithPassword: null,
    signOut: vi.fn(async () => {}),
    refreshMemberships: vi.fn(async () => {}),
  };
}

describe('StudioGate', () => {
  it('renders the studio page with the membership for a slug the user belongs to', () => {
    render(
      <SessionContext.Provider value={session([alpha])}>
        <StudioGate slug="alpha">{(studio) => <p>inside {studio.membership.orgName} as {studio.membership.role}, can invite: {String(studio.actions.invite)}</p>}</StudioGate>
      </SessionContext.Provider>,
    );
    expect(screen.getByText('inside Alpha Studio as admin, can invite: true')).toBeInTheDocument();
  });

  it('shows no access for another studio and never renders (or fetches for) its page', () => {
    const page = vi.fn(() => <p>studio page</p>);
    render(
      <SessionContext.Provider value={session([alpha])}>
        <StudioGate slug="beta">{page}</StudioGate>
      </SessionContext.Provider>,
    );
    expect(screen.getByRole('heading', { name: "You don't have access to this studio" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your studio' })).toHaveAttribute('href', '#/');
    expect(page).not.toHaveBeenCalled();
    expect(screen.queryByText('studio page')).not.toBeInTheDocument();
  });
});
