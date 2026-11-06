import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionProvider } from './SessionProvider';
import { useSession } from './useSession';
import { createFakeClient, fakeSession, type FakeMembershipRow } from './testClient';

const alpha: FakeMembershipRow = { role: 'designer', organizations: { id: 'org-a', name: 'Alpha Studio', slug: 'alpha' } };

function Probe() {
  const s = useSession();
  return (
    <div>
      <span data-testid="status">{s.status}</span>
      <span data-testid="email">{s.user?.email ?? ''}</span>
      <span data-testid="name">{s.user?.name ?? ''}</span>
      <span data-testid="studios">{s.memberships.map((m) => `${m.orgSlug}:${m.role}`).join(',')}</span>
      <span data-testid="error">{s.error ?? ''}</span>
      <button onClick={() => void s.signOut()}>sign out</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('SessionProvider', () => {
  it('starts loading, then reports signed-out without a session', async () => {
    const { client } = createFakeClient();
    render(
      <SessionProvider client={client}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
  });

  it('with a session, accepts pending invites once and then loads memberships', async () => {
    const { client, calls } = createFakeClient({ session: fakeSession(), memberships: [alpha] });
    render(
      <SessionProvider client={client}>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    expect(screen.getByTestId('email')).toHaveTextContent('designer.a@example.test');
    expect(screen.getByTestId('name')).toHaveTextContent('Alpha Designer');
    expect(screen.getByTestId('studios')).toHaveTextContent('alpha:designer');
    const rpc = calls.indexOf('rpc:accept_pending_invites');
    const select = calls.findIndex((c) => c.startsWith('select:org_members:'));
    expect(calls.filter((c) => c === 'rpc:accept_pending_invites')).toHaveLength(1);
    expect(rpc).toBeGreaterThanOrEqual(0);
    expect(select).toBeGreaterThan(rpc);
  });

  it('sign-out clears memberships and the last-used studio', async () => {
    localStorage.setItem('interior-studio:last-studio', 'alpha');
    const { client, calls } = createFakeClient({ session: fakeSession(), memberships: [alpha] });
    render(
      <SessionProvider client={client}>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('studios')).toHaveTextContent('alpha:designer'));
    await act(async () => screen.getByRole('button', { name: 'sign out' }).click());
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(screen.getByTestId('studios')).toHaveTextContent('');
    expect(localStorage.getItem('interior-studio:last-studio')).toBeNull();
    expect(calls).toContain('signOut');
  });

  it('a failing membership load sets an error but keeps the user signed in', async () => {
    const { client } = createFakeClient({ session: fakeSession(), membershipError: 'network down' });
    render(
      <SessionProvider client={client}>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('network down'));
    expect(screen.getByTestId('status')).toHaveTextContent('signed-in');
  });

  it('reacts to a sign-in event from the client', async () => {
    const { client, emit } = createFakeClient({ memberships: [alpha] });
    render(
      <SessionProvider client={client}>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    act(() => emit('SIGNED_IN', fakeSession('u-2', 'owner.a@example.test', 'Alpha Owner')));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    expect(screen.getByTestId('email')).toHaveTextContent('owner.a@example.test');
    expect(screen.getByTestId('studios')).toHaveTextContent('alpha:designer');
  });
});
