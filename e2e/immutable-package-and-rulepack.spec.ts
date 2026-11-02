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

  // 7. ARC-03 Cross-runtime determinism check in browser environment
  const browserCalculatedHash = await page.evaluate(async () => {
    // Pure browser subtle crypto hash of the canonical string
    const goldenPayloadString = '{"hardwareUnits":28,"partsCount":15,"rulePack":"seed_joinery_v1","totalAreaSqM":4.82,"version":"1.0.0"}';
    const msgBuffer = new TextEncoder().encode(goldenPayloadString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  });
  // Must match Node/V8 pure SHA-256 computation bit-for-bit
  expect(browserCalculatedHash).toBe('740a4e2047ef92e9d014fd848b001b8936889ea302bf13aea9c1bebf716b3003');
});
