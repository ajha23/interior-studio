import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Membership } from '@/features/auth/sessionContext';
import { actionsFor } from './roleActions';
import { inviteErrorMessage, type Member, type MembersApi, type PendingInvite } from './membersApi';
import { MembersSettings } from './MembersSettings';

const members: Member[] = [
  { userId: 'u-owner', name: 'Alpha Owner', email: 'owner.a@example.test', avatarUrl: null, role: 'owner' },
  { userId: 'u-viewer', name: 'Alpha Viewer', email: 'viewer.a@example.test', avatarUrl: null, role: 'viewer' },
];
const invites: PendingInvite[] = [{ id: 'i1', email: 'invitee.a@example.test', role: 'designer', invitedAt: '2026-11-06T00:00:00Z' }];

function fakeApi(overrides: Partial<MembersApi> = {}): MembersApi {
  return {
    listMembers: vi.fn(async () => members),
    listInvites: vi.fn(async () => invites),
    invite: vi.fn(async () => ({ ok: true as const })),
    changeRole: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

function studio(role: Membership['role']) {
  const membership: Membership = { orgId: 'org-a', orgName: 'Alpha Studio', orgSlug: 'alpha', role, plan: 'inhouse' };
  return { membership, actions: actionsFor(role) };
}

describe('MembersSettings', () => {
  it('owners see members with roles, pending invites and the invite form', async () => {
    const api = fakeApi();
    render(<MembersSettings studio={studio('owner')} userId="u-owner" api={api} />);
    expect(await screen.findByText('Alpha Viewer')).toBeInTheDocument();
    expect(screen.getByText('owner.a@example.test')).toBeInTheDocument();
    expect(screen.getByText('invitee.a@example.test')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Invite a colleague' })).toBeInTheDocument();
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('never offers owner as a role, in the invite form or the role selectors', async () => {
    render(<MembersSettings studio={studio('admin')} userId="u-admin" api={fakeApi()} />);
    await screen.findByText('Alpha Viewer');
    for (const select of screen.getAllByRole('combobox')) {
      expect(within(select).queryByRole('option', { name: 'Owner' })).not.toBeInTheDocument();
    }
  });

  it('the owner row has no role selector', async () => {
    render(<MembersSettings studio={studio('owner')} userId="u-owner" api={fakeApi()} />);
    await screen.findByText('Alpha Viewer');
    expect(screen.queryByRole('combobox', { name: 'Role for Alpha Owner' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Role for Alpha Viewer' })).toBeInTheDocument();
  });

  it('designers and viewers see the member list read-only', async () => {
    for (const role of ['designer', 'viewer'] as const) {
      const api = fakeApi();
      const { unmount } = render(<MembersSettings studio={studio(role)} userId="u-x" api={api} />);
      expect(await screen.findByText('Alpha Viewer')).toBeInTheDocument();
      expect(screen.queryByRole('form', { name: 'Invite a colleague' })).not.toBeInTheDocument();
      expect(screen.queryAllByRole('combobox')).toHaveLength(0);
      expect(screen.queryByText('invitee.a@example.test')).not.toBeInTheDocument();
      expect(api.listInvites).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('inviting adds a pending invite with a sign-in hint', async () => {
    const api = fakeApi();
    render(<MembersSettings studio={studio('owner')} userId="u-owner" api={api} />);
    await screen.findByText('Alpha Viewer');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'New.Person@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(api.invite).toHaveBeenCalledWith('org-a', 'New.Person@example.test', 'designer', 'u-owner'));
    expect(await screen.findByRole('status')).toHaveTextContent('Ask them to sign in with Google using this address');
  });

  it('shows the database refusal for an existing member', async () => {
    const api = fakeApi({ invite: vi.fn(async () => ({ ok: false as const, message: inviteErrorMessage({ code: '23505', message: 'already a member' }) })) });
    render(<MembersSettings studio={studio('admin')} userId="u-admin" api={api} />);
    await screen.findByText('Alpha Viewer');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'viewer.a@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already a member');
  });

  it('changing a role saves it and reloads the list', async () => {
    const api = fakeApi();
    render(<MembersSettings studio={studio('owner')} userId="u-owner" api={api} />);
    await screen.findByText('Alpha Viewer');
    fireEvent.change(screen.getByRole('combobox', { name: 'Role for Alpha Viewer' }), { target: { value: 'designer' } });
    await waitFor(() => expect(api.changeRole).toHaveBeenCalledWith('org-a', 'u-viewer', 'designer'));
    await waitFor(() => expect(api.listMembers).toHaveBeenCalledTimes(2));
  });

  it('a failed load says what happened and offers to try again', async () => {
    const api = fakeApi({ listMembers: vi.fn(async () => Promise.reject(new Error('network down'))) });
    render(<MembersSettings studio={studio('owner')} userId="u-owner" api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('inviteErrorMessage', () => {
  it('turns database codes into sentences', () => {
    expect(inviteErrorMessage({ code: '23505', message: 'already a member' })).toMatch(/^Already a member/);
    expect(inviteErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' })).toMatch(/^Already invited/);
    expect(inviteErrorMessage({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/owners and admins/);
  });
});
