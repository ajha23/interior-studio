import { expect, test } from '@playwright/test';

test('site measurement & wall photos: mobile capture wizard, closure diagnostic, and wall-tagged photos', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Site Survey Villa');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 1. Open Site Capture from TopBar
  const siteCaptureBtn = page.getByTestId('site-capture-btn');
  await expect(siteCaptureBtn).toBeVisible();
  await siteCaptureBtn.click();

  const modal = page.getByTestId('site-capture-modal');
  await expect(modal).toBeVisible();
  await expect(page.getByText('Site Measurement & Photo Capture (MT-03, MT-05)')).toBeVisible();

  // 2. Check initial closure diagnostic (default 4000x3000 has 0mm error -> Acceptable)
  const closureBanner = page.getByTestId('closure-diagnostic-banner');
  await expect(closureBanner).toBeVisible();
  await expect(closureBanner).toContainText('Within ±10mm Tolerance');

  // 3. Switch to Left Wall tab
  await page.getByTestId('wall-tab-left').click();
  await expect(page.getByText('LEFT Wall Dimensions')).toBeVisible();

  // 4. Attach site photo to Left Wall
  await page.getByTestId('add-wall-photo-btn').click();
  await expect(page.getByText('1 Photo Tagged to LEFT Wall')).toBeVisible();
  await expect(page.getByText('270° Compass')).toBeVisible();

  // 5. Update wall dimension to trigger closure warning (>10mm error)
  const lengthInput = page.getByTestId('wall-length-input');
  await lengthInput.fill('3045'); // 45mm discrepancy on left wall
  await page.getByTestId('save-wall-dimension-btn').click();

  // 6. Verify closure warning updates dynamically
  await expect(closureBanner).toContainText('Tolerance Exceeded');
  await expect(closureBanner).toContainText('exceeds 10mm limit');

  // 7. Fix measurement back within tolerance
  await lengthInput.fill('3004'); // 4mm discrepancy
  await page.getByTestId('save-wall-dimension-btn').click();
  await expect(closureBanner).toContainText('Within ±10mm Tolerance');

  // 8. Close modal
  await page.getByTestId('close-site-capture-btn').click();
  await expect(modal).not.toBeVisible();
});

