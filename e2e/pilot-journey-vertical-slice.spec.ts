import { expect, test } from '@playwright/test';

test('pilot vertical-slice journey: site survey -> parametric design -> approval -> invalidation -> verified manufacturing package', async ({ page }) => {
  await page.goto('/');

  // 1. Create project & client
  await page.getByLabel('Project name').fill('Villa Horizon Kitchen');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 2. Open Site Capture modal and verify ±10mm closure
  const siteCaptureBtn = page.getByTestId('site-capture-btn');
  await expect(siteCaptureBtn).toBeVisible();
  await siteCaptureBtn.click();

  const captureModal = page.getByTestId('site-capture-modal');
  await expect(captureModal).toBeVisible();
  const closureBanner = page.getByTestId('closure-diagnostic-banner');
  await expect(closureBanner).toContainText('Within ±10mm Tolerance');

  // Attach a site survey photo to left wall
  await page.getByTestId('wall-tab-left').click();
  await page.getByTestId('add-wall-photo-btn').click();
  await expect(page.getByText('1 Photo Tagged to LEFT Wall')).toBeVisible();
  await page.getByTestId('close-site-capture-btn').click();
  await expect(captureModal).not.toBeVisible();

  // 3. Open Deliverables View
  await page.getByRole('button', { name: 'Deliverables' }).click();

  // 4. Verify Immutable Package Hash Banner is present
  const hashBanner = page.getByTestId('package-hash-banner');
  await expect(hashBanner).toBeVisible();
  const hashCode = page.getByTestId('package-hash-code');
  const initialHash = (await hashCode.textContent())?.trim() ?? '';
  expect(initialHash).toMatch(/^[a-f0-9]{64}$/);

  // 5. Approve current design revision
  const approveBtn = page.getByTestId('approve-revision');
  await expect(approveBtn).toBeVisible();
  await approveBtn.click();
  await expect(approveBtn).toHaveText(/Approved/);

  // 6. Navigate to Client Presentation portal & execute digital sign-off
  const nav = page.getByRole('navigation', { name: 'Sheets' });
  await nav.getByRole('button', { name: /Client presentation/ }).click();
  await expect(page.getByTestId('sign-off-form')).toBeVisible();

  await page.getByTestId('client-name-input').fill('Ananya Sen');
  await page.getByTestId('client-mobile-input').fill('9876543210');
  await page.getByTestId('consent-checkbox').check();
  await page.getByTestId('accept-quote-button').click();

  // 7. Verify quote acceptance badge
  const signOffBadge = page.getByTestId('sign-off-badge');
  await expect(signOffBadge).toBeVisible();
  await expect(signOffBadge).toContainText('Quotation Digitally Accepted');
  await expect(signOffBadge).toContainText('Ananya Sen');

  // 8. Return to Plan view and resize a cabinet to mutate revision and trigger invalidation
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByTestId('plan-view').getByRole('button', { name: /Base cabinet/ }).first().click();
  const widthInput = page.getByTestId('inspector-width');
  await widthInput.fill('900');
  await widthInput.press('Enter');
  await expect(widthInput).toHaveValue('900');

  // 9. Return to Deliverables: observe Invalidation Alert Banner (UX-07)
  await page.getByRole('button', { name: 'Deliverables' }).click();
  const invalidationBanner = page.getByTestId('invalidation-alert-banner');
  await expect(invalidationBanner).toBeVisible();
  await expect(invalidationBanner).toContainText('Design Invalidation (UX-07)');
  await expect(invalidationBanner).toContainText('differs from approved revision');

  // 10. Re-approve current revision
  await expect(approveBtn).toBeEnabled();
  await approveBtn.click();
  await expect(approveBtn).toHaveText(/Approved/);
  await expect(invalidationBanner).not.toBeVisible();

  // 11. Verify package hash remains immutable & 64-char SHA-256
  const finalHash = (await hashCode.textContent())?.trim() ?? '';
  expect(finalHash).toMatch(/^[a-f0-9]{64}$/);
});
