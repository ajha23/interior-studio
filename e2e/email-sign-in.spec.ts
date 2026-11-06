// Spec 054: email sign-in with a 6-digit code (User Story 1) and the emailed link (User Story 2),
// against the local stack. Emails are read from Mailpit. Every test uses a fresh address, so the
// 60-second per-address interval never collides between tests.
import { expect, test, type Page } from '@playwright/test';
import { createLocalInvite } from './support/localAdmin';
import { latestEmail } from './support/mailpit';

test.use({ storageState: { cookies: [], origins: [] } });

const ALPHA_ID = 'aaaaaaaa-0000-4000-8000-000000000000';
const ALPHA_OWNER = 'a1000000-0000-4000-8000-000000000001';

const fresh = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function requestEmail(page: Page, address: string, hash = '') {
  await page.goto(`/${hash}`);
  await page.getByLabel('Work email').fill(address);
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click();
  await expect(page.getByRole('status')).toContainText(`We sent a code to ${address}.`);
}

async function enterCode(page: Page, code: string) {
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('User Story 1: sign in with a code from my email', () => {
  test('a new address signs in with the emailed code and gets its own Free studio', async ({ page }) => {
    const address = fresh('code-new');
    await requestEmail(page, address);
    const email = await latestEmail(address);
    expect(email.subject).toBe(`Your Interior Studio sign-in code: ${email.code}`);
    await enterCode(page, email.code);
    await expect(page).toHaveURL(/#\/s\/[a-z0-9-]+\/projects$/);
    await expect(page.getByTestId('studio-plan')).toHaveText('Free');
  });

  test('an invited address joins the inviting studio by code', async ({ page }) => {
    const address = fresh('code-invited');
    await createLocalInvite(ALPHA_ID, address, 'designer', ALPHA_OWNER);
    await requestEmail(page, address);
    await enterCode(page, (await latestEmail(address)).code);
    await expect(page).toHaveURL(/#\/s\/alpha\/projects$/);
    await expect(page.getByTestId('studio-name')).toHaveText('Alpha Studio');
    await expect(page.getByRole('button', { name: 'Switch studio' })).toHaveCount(0);
  });

  test('a wrong code shows the error and the right one still works', async ({ page }) => {
    const address = fresh('code-wrong');
    await requestEmail(page, address);
    const { code } = await latestEmail(address);
    await enterCode(page, code === '000000' ? '111111' : '000000');
    await expect(page.getByRole('alert')).toHaveText('That code is not right or has expired.');
    await enterCode(page, code);
    await expect(page).toHaveURL(/#\/s\/[a-z0-9-]+\/projects$/);
  });
});
