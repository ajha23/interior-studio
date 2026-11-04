import { expect, test } from '@playwright/test';

test('saas subscription lifecycle: quota tracking, plan upgrade, and entitlement gating', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('SaaS Enterprise Studio');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 1. Open Studio Table Editor
  await page.getByTestId('studio-tables-btn').click();
  const dialog = page.getByTestId('studio-table-editor-dialog');
  await expect(dialog).toBeVisible();

  // 2. Open Billing & Subscription Tab
  await dialog.getByTestId('tab-billing-btn').click();
  await expect(dialog.getByTestId('billing-settings-view')).toBeVisible();

  // 3. Verify Live Usage Quota Tracker is rendered
  const projectMeter = dialog.getByTestId('quota-meter-quota.projects.active.max');
  await expect(projectMeter).toBeVisible();
  await expect(projectMeter.getByText('Active Projects')).toBeVisible();

  const seatMeter = dialog.getByTestId('quota-meter-quota.seats.designers.max');
  await expect(seatMeter).toBeVisible();
  await expect(seatMeter.getByText('Designer Seats')).toBeVisible();

  // 4. Verify Plan Selection Switcher
  await expect(dialog.getByTestId('plan-card-starter')).toBeVisible();
  await expect(dialog.getByTestId('plan-card-pro')).toBeVisible();
  await expect(dialog.getByTestId('plan-card-enterprise')).toBeVisible();

  // 5. Select Starter Plan
  await dialog.getByTestId('select-plan-starter').click();
  await expect(dialog.getByText(/Successfully switched subscription to Starter Studio/i)).toBeVisible();

  // Verify Active Projects meter reflects Starter limit (15)
  await expect(projectMeter.getByText(/\/ 15/i)).toBeVisible();

  // 6. Select Pro Plan
  await dialog.getByTestId('select-plan-pro').click();
  await expect(dialog.getByText(/Successfully switched subscription to Pro Studio/i)).toBeVisible();

  // Verify Active Projects meter reflects Pro limit (Unlimited)
  await expect(projectMeter.getByText('/ Unlimited', { exact: false })).toBeVisible();

  // 7. Close Dialog cleanly
  await dialog.getByRole('button', { name: 'Close table editor' }).click();
  await expect(dialog).not.toBeVisible();
});
