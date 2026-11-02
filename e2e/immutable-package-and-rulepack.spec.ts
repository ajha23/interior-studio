import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const FIXTURE = fileURLToPath(new URL('./fixtures/l-kitchen-12x10.kitchen.json', import.meta.url));

test('immutable production packages & rulepack lifecycle gates (ARC-02, ARC-04, MFG-02)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project file').setInputFiles(FIXTURE);
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 1. Open Deliverables View
  await page.getByRole('button', { name: 'Deliverables' }).click();

  // 2. Verify Immutable Package Hash Banner is displayed
  const hashBanner = page.getByTestId('package-hash-banner');
  await expect(hashBanner).toBeVisible();

  // 3. Verify SHA-256 canonical hash is 64 hex characters
  const hashCode = page.getByTestId('package-hash-code');
  await expect(hashCode).toBeVisible();
  const hashText = (await hashCode.textContent())?.trim() ?? '';
  expect(hashText).toMatch(/^[a-f0-9]{64}$/);

  // 4. Verify RulePack lifecycle status badge
  const statusBadge = page.getByTestId('rulepack-status-badge');
  await expect(statusBadge).toBeVisible();
  await expect(statusBadge).toContainText(/Provisional Fixture|Factory Approved/);

  // 5. Check Readiness Gate (MFG-02)
  const nav = page.getByRole('navigation', { name: 'Sheets' });
  await nav.getByRole('button', { name: /Readiness/ }).click();
  const issues = page.getByTestId('readiness-issues');
  await expect(issues).toBeVisible();

  // 6. Navigate to Client Presentation portal and verify sign-off readiness
  await nav.getByRole('button', { name: /Client presentation/ }).click();
  await expect(page.getByTestId('sign-off-form')).toBeVisible();
  await expect(page.getByText('Digital Quote Acceptance & Sign-Off')).toBeVisible();
});
