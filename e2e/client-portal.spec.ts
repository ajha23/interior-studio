import { expect, test } from '@playwright/test';

test('client presentation portal: locked client mode, option delta, and digital quote sign-off', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Luxury Villa Kitchen');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // Navigate to Deliverables Studio
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(page.getByTestId('drawings-view')).toBeVisible();

  // Navigate to Client Presentation
  const nav = page.getByRole('navigation', { name: 'Sheets' });
  await nav.getByRole('button', { name: 'Client presentation' }).click();

  // Assert Presentation Portal is rendered in locked client mode
  await expect(page.getByTestId('presentation-portal')).toBeVisible();
  await expect(page.getByText('Locked Client Mode')).toBeVisible();
  await expect(page.getByText('Authoritative Commercial Quotation')).toBeVisible();

  // Test Finish Option Board (PR-02)
  const acrylicOption = page.getByTestId('finish-option-acrylic');
  await expect(acrylicOption).toBeVisible();
  await acrylicOption.click();

  // Fill in Digital Sign-Off Form (PR-05)
  await page.getByTestId('client-name-input').fill('Aarav Sharma');
  await page.getByTestId('client-mobile-input').fill('9876543210');
  await page.getByTestId('consent-checkbox').check();

  // Capture screenshot before sign-off
  await page.screenshot({
    path: '/Users/akhil/.gemini/antigravity/brain/bcfaf49e-bdd9-4243-a6d9-ec40897e547e/06_client_presentation_signoff.png',
  });

  // Submit Sign-Off
  await page.getByTestId('accept-quote-button').click();

  // Verify verified sign-off badge
  const badge = page.getByTestId('sign-off-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('Quotation Digitally Accepted');
  await expect(badge).toContainText('Aarav Sharma');
  await expect(badge).toContainText('9876543210');
  await expect(badge).toContainText('DPDP-2023-V1');
});

