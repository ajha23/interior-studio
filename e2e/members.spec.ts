// Spec 042, User Story 3: Settings → Members. Invites, roles, and who sees what.
import { expect, test, type Page } from '@playwright/test';
import { ensureLocalUser } from './support/localAdmin';

test.use({ storageState: { cookies: [], origins: [] } });

async function signInAs(page: Page, email: string, hash = '#/s/alpha/settings/members') {
  await page.goto(`/${hash}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
}

test('an owner sees members, pending invites and can invite a colleague', async ({ page }) => {
  await signInAs(page, 'owner.a@example.test');
  const members = page.getByRole('list', { name: 'Members' });
  await expect(members.getByText('Alpha Owner')).toBeVisible();
  await expect(members.getByText('viewer.a@example.test')).toBeVisible();
  // Owners see the pending-invites section (its contents depend on earlier runs; the invite below is this test's own).
  await expect(page.getByRole('heading', { name: 'Pending invites' })).toBeVisible();

  const email = `new.member.${Date.now()}@example.test`;
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByRole('status')).toContainText('Ask them to sign in with Google using this address');
  await expect(page.getByRole('list', { name: 'Pending invites' }).getByText(email)).toBeVisible();
  await expect(page.getByRole('option', { name: 'Owner' })).toHaveCount(0);
});

test('inviting an existing member is refused by the database', async ({ page }) => {
  await signInAs(page, 'admin.a@example.test');
  await page.getByLabel('Email address').fill('owner.a@example.test');
  await page.getByLabel('Role', { exact: true }).selectOption('viewer');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByRole('alert')).toContainText('Already a member');
});

test("an owner changes a member's role and it persists", async ({ page }) => {
  await signInAs(page, 'owner.a@example.test');
  const role = page.getByRole('combobox', { name: 'Role for Alpha Viewer' });
  await role.selectOption('designer');
  await expect(page.getByRole('status')).toContainText('Alpha Viewer is now designer');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Role for Alpha Viewer' })).toHaveValue('designer');
  // Put the seed back for the next run.
  await page.getByRole('combobox', { name: 'Role for Alpha Viewer' }).selectOption('viewer');
  await expect(page.getByRole('status')).toContainText('Alpha Viewer is now viewer');
});

for (const email of ['designer.a@example.test', 'viewer.a@example.test']) {
  test(`${email.split('@')[0]} sees the members read-only`, async ({ page }) => {
    await signInAs(page, email);
    await expect(page.getByRole('list', { name: 'Members' }).getByText('Alpha Owner')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Invite a colleague' })).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByText('Pending invites')).toHaveCount(0);
  });
}

test('an invited person signs in for the first time and lands in the studio with the invited role', async ({ page }) => {
  // The seed holds a pending Alpha invite (designer) for invitee.a@example.test; the account is new.
  await ensureLocalUser('invitee.a@example.test');
  await signInAs(page, 'invitee.a@example.test', '');
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
  await page.getByRole('link', { name: 'Settings' }).click();
  const me = page.getByRole('listitem').filter({ hasText: 'invitee.a@example.test' });
  await expect(me).toContainText('(you)');
  await expect(me).toContainText('Designer');
});
