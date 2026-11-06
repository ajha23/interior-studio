// Signs in once as a seeded designer (local stack, spec 041 seed) and saves the session, so every
// other test starts signed in. Tests that need a different user open their own context.
import { expect, test as setup } from '@playwright/test';

setup('sign in as designer.a', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('designer.a@example.test');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await expect(page).toHaveURL(/#\/s\/alpha\/projects$/, { timeout: 30_000 });
  await page.context().storageState({ path: 'playwright/.auth/designer.json' });
});
