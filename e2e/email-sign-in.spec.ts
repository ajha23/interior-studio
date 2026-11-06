// Spec 054: email sign-in with a 6-digit code (User Story 1) and the emailed link (User Story 2),
// against the local stack. Emails are read from Mailpit. Every test uses a fresh address, so the
// 60-second per-address interval never collides between tests.
import { expect, test, type Page } from '@playwright/test';
import { createLocalInvite, ensureLocalUser } from './support/localAdmin';
import { emailCount, latestEmail } from './support/mailpit';

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

test.describe('User Story 2: sign in by clicking the link', () => {
  test('the link signs in on another device after one click', async ({ page, browser }) => {
    const address = fresh('link-other-device');
    await requestEmail(page, address);
    const { link } = await latestEmail(address);
    expect(new URL(link).pathname).toBe('/auth/confirm');

    const phone = await browser.newContext(); // no storage shared with `page`: another device
    const other = await phone.newPage();
    await other.goto(link);
    await expect(other.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeVisible();
    await expect(other.getByRole('button', { name: 'Account' })).toHaveCount(0);
    await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(other).toHaveURL(/\/#\/s\/[a-z0-9-]+\/projects$/);
    await expect(other.getByTestId('studio-plan')).toHaveText('Free');
    expect(new URL(other.url()).search).toBe('');
    await phone.close();
  });

  test('opening the link without clicking does not use it up (mail scanners)', async ({ page, browser }) => {
    const address = fresh('link-scanner');
    await requestEmail(page, address);
    const { link } = await latestEmail(address);

    // A scanner fetches the page and may even run its scripts, but never clicks.
    expect((await page.request.get(link)).ok()).toBe(true);
    const scannerContext = await browser.newContext();
    const scanner = await scannerContext.newPage();
    await scanner.goto(link);
    await expect(scanner.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await scannerContext.close();

    const person = await browser.newContext();
    const tab = await person.newPage();
    await tab.goto(link);
    await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(tab).toHaveURL(/#\/s\/[a-z0-9-]+\/projects$/);
    await person.close();
  });

  test('a link whose code was already used shows expired', async ({ page, browser }) => {
    const address = fresh('link-used');
    await requestEmail(page, address);
    const { code, link } = await latestEmail(address);
    await enterCode(page, code);
    await expect(page).toHaveURL(/#\/s\/[a-z0-9-]+\/projects$/);

    const other = await browser.newContext();
    const tab = await other.newPage();
    await tab.goto(link);
    await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(tab.getByRole('alert')).toHaveText('This sign-in link has expired.');
    await tab.getByRole('link', { name: 'Back to sign-in' }).click();
    await expect(tab.getByRole('button', { name: 'Email me a sign-in code' })).toBeVisible();
    await other.close();
  });

  test('the link in the same browser restores the page asked for', async ({ page, context }) => {
    // A fresh address invited to Alpha, so the deep link is a page it can open after joining.
    const address = fresh('link-return-to');
    await createLocalInvite(ALPHA_ID, address, 'designer', ALPHA_OWNER);
    await requestEmail(page, address, '#/s/alpha/settings/members');
    const { link } = await latestEmail(address);
    const tab = await context.newPage(); // the email client opens a new tab
    await tab.goto(link);
    await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(tab).toHaveURL(/\/#\/s\/alpha\/settings\/members$/);
    // The first tab, waiting on the code step, is signed in too.
    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  });
});

test.describe('User Story 4: abuse cannot run up cost or flood an inbox', () => {
  test('asking again within 60 seconds shows the wait message and sends no second email', async ({ page }) => {
    const address = fresh('cooldown');
    await requestEmail(page, address);
    await latestEmail(address);
    await page.getByRole('button', { name: 'Use a different email' }).click();
    await page.getByLabel('Work email').fill(address);
    await page.getByRole('button', { name: 'Email me a sign-in code' }).click();
    await expect(page.getByRole('alert')).toHaveText(/^Please wait \d+ seconds? before asking for another email\.$/);
    await expect(page.getByLabel('Work email')).toBeVisible();
    expect(await emailCount(address)).toBe(1);
  });

  test('an unknown address and a known one look the same', async ({ page }) => {
    const known = fresh('known');
    await ensureLocalUser(known); // an existing, confirmed account
    const unknown = fresh('unknown');

    const send = async (address: string) => {
      await page.goto('/');
      await page.getByLabel('Work email').fill(address);
      const response = page.waitForResponse((r) => r.url().includes('/auth/v1/otp') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Email me a sign-in code' }).click();
      const r = await response;
      const status = await page.getByRole('status').textContent();
      await page.getByRole('button', { name: 'Use a different email' }).click();
      return { http: r.status(), body: await r.json(), status: status?.replace(address, '<address>') };
    };

    const a = await send(known);
    const b = await send(unknown);
    expect(a).toEqual(b);
    expect(a.http).toBe(200);
  });
});
