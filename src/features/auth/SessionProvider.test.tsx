import 'fake-indexeddb/auto';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { getDoc, putDoc } from '@/persistence/cloudCache';
import { SessionProvider } from './SessionProvider';
import { useSession } from './useSession';
import { createFakeClient, fakeSession, type FakeMembershipRow } from './testClient';

const alpha: FakeMembershipRow = { role: 'designer', organizations: { id: 'org-a', name: 'Alpha Studio', slug: 'alpha', plan: 'free' } };

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

  it('with a session, starts the session once (invites, own studio) and then loads memberships', async () => {
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
    const rpc = calls.indexOf('rpc:start_session');
    const select = calls.findIndex((c) => c.startsWith('select:org_members:'));
    expect(calls.filter((c) => c === 'rpc:start_session')).toHaveLength(1);
    expect(rpc).toBeGreaterThanOrEqual(0);
    expect(select).toBeGreaterThan(rpc);
    // Only the signed-in user's own membership rows (members can read their colleagues' rows too).
    expect(calls[select]).toBe('select:org_members:role, organizations ( id, name, slug, plan ):user_id=u-1');
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

  it('sign-out clears this user’s studio projects cached on the device (spec 043, FR-011a)', async () => {
    const project = createProject({ name: 'Cached', room: DEFAULT_ROOM, layout: 'empty' });
    await putDoc({ userId: 'u-1', orgId: 'org-a', projectId: project.id, versionNo: 1, doc: { type: 'kitchen', project }, name: 'Cached' });
    await putDoc({ userId: 'u-2', orgId: 'org-a', projectId: project.id, versionNo: 1, doc: { type: 'kitchen', project }, name: 'Cached' });
    const { client } = createFakeClient({ session: fakeSession(), memberships: [alpha] });
    render(
      <SessionProvider client={client}>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('studios')).toHaveTextContent('alpha:designer'));
    await act(async () => screen.getByRole('button', { name: 'sign out' }).click());
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(await getDoc('u-1', 'org-a', project.id)).toBeNull();
    expect(await getDoc('u-2', 'org-a', project.id)).not.toBeNull();
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

describe('SessionProvider — email sign-in (spec 054)', () => {
  let api: ReturnType<typeof useSession> | null = null;
  const keep = (s: ReturnType<typeof useSession>) => {
    api = s;
  };
  function Capture({ onSession }: { onSession: (s: ReturnType<typeof useSession>) => void }) {
    const s = useSession();
    useEffect(() => onSession(s));
    return <span data-testid="status">{s.status}</span>;
  }
  async function mount(options: Parameters<typeof createFakeClient>[0] = {}) {
    const fake = createFakeClient({ memberships: [alpha], ...options });
    render(
      <SessionProvider client={fake.client}>
        <Capture onSession={keep} />
      </SessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    return fake;
  }

  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/#/s/alpha/settings/members');
  });

  it('sendEmailCode trims and lower-cases the address, asks for a link back to /auth/confirm, and remembers the page', async () => {
    const { calls } = await mount();
    let result: Awaited<ReturnType<NonNullable<typeof api>['sendEmailCode']>> | undefined;
    await act(async () => {
      result = await api!.sendEmailCode('  New.Person@Studio.Example ');
    });
    expect(result).toEqual({ ok: true });
    const call = calls.find((c) => c.startsWith('signInWithOtp:'));
    expect(JSON.parse(call!.slice('signInWithOtp:'.length))).toEqual({
      email: 'new.person@studio.example',
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm`, shouldCreateUser: true },
    });
    expect(sessionStorage.getItem('interior-studio:email-pending')).toBe('new.person@studio.example');
    expect(JSON.parse(localStorage.getItem('interior-studio:email-return-to')!).hash).toBe('#/s/alpha/settings/members');
  });

  it('sendEmailCode maps errors through emailAuthError and keeps nothing pending', async () => {
    await mount({ otpError: { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 30 seconds.', status: 429 } });
    let result: unknown;
    await act(async () => {
      result = await api!.sendEmailCode('a@b.example');
    });
    expect(result).toEqual({ ok: false, message: 'Please wait 30 seconds before asking for another email.', retryAfterSeconds: 30 });
    expect(sessionStorage.getItem('interior-studio:email-pending')).toBeNull();
  });

  it('verifyEmailCode strips spaces, signs in, and then starts the session as Google does', async () => {
    const { calls } = await mount();
    let result: unknown;
    await act(async () => {
      result = await api!.verifyEmailCode('New@Studio.Example', '123 456');
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toContain('verifyOtp:{"email":"new@studio.example","token":"123456","type":"email"}');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    expect(calls).toContain('rpc:start_session');
  });

  it('verifyEmailCode maps a wrong code to the code message', async () => {
    await mount({ verifyError: { code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 } });
    let result: unknown;
    await act(async () => {
      result = await api!.verifyEmailCode('a@b.example', '000000');
    });
    expect(result).toEqual({ ok: false, message: 'That code is not right or has expired.' });
  });

  it('confirmEmailLink verifies the token hash and hands the remembered page to the normal return-to', async () => {
    localStorage.setItem('interior-studio:email-return-to', JSON.stringify({ hash: '#/s/alpha/projects', at: Date.now() }));
    window.history.replaceState(null, '', '/auth/confirm?token_hash=pkce_abc&type=email');
    const { calls } = await mount();
    await act(async () => {
      await api!.confirmEmailLink('pkce_abc');
    });
    expect(calls).toContain('verifyOtp:{"token_hash":"pkce_abc","type":"email"}');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));
    expect(window.location.hash).toBe('#/s/alpha/projects');
    expect(localStorage.getItem('interior-studio:email-return-to')).toBeNull();
  });

  it('confirmEmailLink maps a used link to the link message', async () => {
    await mount({ verifyError: { code: 'otp_expired', message: 'Email link is invalid or has expired', status: 403 } });
    let result: unknown;
    await act(async () => {
      result = await api!.confirmEmailLink('pkce_used');
    });
    expect(result).toEqual({ ok: false, message: 'This sign-in link has expired.' });
  });

  it('sign-out also forgets the pending address and the email return-to hint', async () => {
    await mount();
    await act(async () => {
      await api!.sendEmailCode('a@b.example');
      await api!.verifyEmailCode('a@b.example', '123456');
    });
    localStorage.setItem('interior-studio:email-return-to', JSON.stringify({ hash: '#/s/alpha/projects', at: Date.now() }));
    sessionStorage.setItem('interior-studio:email-pending', 'a@b.example');
    await act(async () => {
      await api!.signOut();
    });
    expect(sessionStorage.getItem('interior-studio:email-pending')).toBeNull();
    expect(localStorage.getItem('interior-studio:email-return-to')).toBeNull();
  });
});
