// Spec 042, User Story 2: land in my studio, switch studios, no access to other studios.
// Each test signs in as the user it needs (local stack, spec 041 seed + both@example.test).
import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const BETA_ID = 'bbbbbbbb-0000-4000-8000-000000000000';

async function signInAs(page: Page, email: string, hash = '') {
  await page.goto(`/${hash}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
}

test('a member of one studio lands on its projects with the studio name shown', async ({ page }) => {
  await signInAs(page, 'designer.a@example.test');
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
  await expect(page.getByTestId('studio-name')).toHaveText('Alpha Studio');
  await expect(page.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('a member of two studios picks one, then switches; URL and header follow', async ({ page }) => {
  await signInAs(page, 'both@example.test');
  await expect(page.getByRole('heading', { name: 'Choose a studio' })).toBeVisible();
  await page.getByRole('button', { name: /Beta Studio/ }).click();
  await expect(page).toHaveURL(/#\/s\/beta\/projects$/);
  await expect(page.getByTestId('studio-name')).toHaveText('Beta Studio');

  await page.getByRole('button', { name: 'Switch studio' }).click();
  await page.getByRole('menuitem', { name: /Alpha Studio/ }).click();
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
  await expect(page.getByTestId('studio-name')).toHaveText('Alpha Studio');

  // The last studio used is remembered for the next visit to #/.
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
});

test('switching studio keeps the section: settings stay settings', async ({ page }) => {
  await signInAs(page, 'both@example.test', '#/s/alpha/settings/members');
  await expect(page).toHaveURL(/#\/s\/alpha\/settings\/members$/);
  await page.getByRole('button', { name: 'Switch studio' }).click();
  await page.getByRole('menuitem', { name: /Beta Studio/ }).click();
  await expect(page).toHaveURL(/#\/s\/beta\/settings\/members$/);
});

test("another studio's address shows no access and fetches nothing from it", async ({ page }) => {
  const betaRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(BETA_ID) || r.url().includes('slug=eq.beta')) betaRequests.push(r.url());
  });
  await signInAs(page, 'designer.a@example.test', '#/s/beta/projects');
  await expect(page.getByRole('heading', { name: "You don't have access to this studio" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your studio' })).toBeVisible();
  expect(betaRequests).toEqual([]);
});

test('a new user without an invite gets their own Free studio', async ({ page }) => {
  // stranger@example.test has no membership and no invite (seed). Spec 042, User Story 5.
  await signInAs(page, 'stranger@example.test');
  await expect(page).toHaveURL(/#\/s\/[a-z0-9-]+\/projects$/);
  await expect(page.getByTestId('studio-name')).toHaveText("No's studio");
  await expect(page.getByTestId('studio-plan')).toHaveText('Free');
  const first = page.url();

  // Signing in again creates no second studio: same studio, and no switcher.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await signInAs(page, 'stranger@example.test');
  await expect(page).toHaveURL(first);
  await expect(page.getByRole('button', { name: 'Switch studio' })).toHaveCount(0);
});
