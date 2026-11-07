import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { createFakeClient, fakeSession } from '@/features/auth/testClient';
import { clearUser, enqueue } from '@/persistence/cloudCache';
import { AccountMenu, unsentWarning } from './AccountMenu';

const alpha = { role: 'designer' as const, organizations: { id: 'org-a', name: 'Alpha Studio', slug: 'alpha', plan: 'free' } };

async function open() {
  const fake = createFakeClient({ session: fakeSession(), memberships: [alpha] });
  render(
    <SessionProvider client={fake.client}>
      <AccountMenu />
    </SessionProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
  return fake;
}

beforeEach(() => clearUser('u-1'));
afterEach(() => vi.restoreAllMocks());

describe('sign out with saves still on this device (spec 043, SC-002)', () => {
  it('signs out straight away when nothing is waiting', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { calls } = await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(calls).toContain('signOut'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('warns first, and stays signed in when the user keeps the changes', async () => {
    const project = createProject({ name: 'Waiting', room: DEFAULT_ROOM, layout: 'empty' });
    await enqueue({ userId: 'u-1', orgId: 'org-a', projectId: project.id, expectedVersionNo: 1, idempotencyKey: 'k', doc: { type: 'kitchen', project }, kind: 'autosave', message: '' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { calls } = await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(unsentWarning(1)));
    expect(calls).not.toContain('signOut');
  });
});
