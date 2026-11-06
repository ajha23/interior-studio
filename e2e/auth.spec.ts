// Spec 042, User Story 1: sign in, keep the session, sign out. Every test starts signed out.
import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page, email = 'designer.a@example.test') {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
}

test('a signed-out visit to any route shows the sign-in screen', async ({ page }) => {
  for (const hash of ['#/', '#/s/alpha/projects', '#/project/p1', '#/home/h1']) {
    await page.goto(`/${hash}`);
    await expect(page.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  }
});

test('after signing in from a deep link the user lands on that page', async ({ page }) => {
  await page.goto('/#/s/alpha/settings/members');
  await signIn(page);
  await expect(page).toHaveURL(/#\/s\/alpha\/settings\/members$/);
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
});

test('signing in at the root lands in the studio, and the session survives a reload', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
  await page.reload();
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeHidden();
});

test('sign out from the account menu ends the session', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByText('designer.a@example.test')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeVisible();
});

test('a wrong password says so and stays on the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('designer.a@example.test');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await expect(page.getByRole('alert')).toContainText(/invalid/i);
  await expect(page.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeVisible();
});
