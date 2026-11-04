import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('billing and entitlements: feature gating, upgrade modal, and tier unlocking', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Billing Studio Project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 1. Open Studio Table Editor -> Billing & Plans
  await page.getByTestId('studio-tables-btn').click();
  const dialog = page.getByTestId('studio-table-editor-dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByTestId('tab-billing-btn').click();
  await expect(dialog.getByTestId('billing-settings-view')).toBeVisible();
  await expect(dialog.getByText('ACTIVE SUBSCRIPTION')).toBeVisible();

  // 2. Switch to Starter plan (which locks DXF CAD and Accounting CSV)
  await dialog.getByTestId('select-plan-starter').click();
  await expect(dialog.getByText(/Successfully switched subscription to Starter Studio/i)).toBeVisible();

  // Close Studio Table Editor
  await dialog.getByRole('button', { name: 'Close table editor' }).click();
  await expect(dialog).not.toBeVisible();

  // 3. Navigate to Deliverables Studio
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(page.getByTestId('drawings-view')).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Sheets' });
  await nav.getByRole('button', { name: /Floor plan/ }).click();
  await expect(page.getByTestId('sheet-preview')).toBeVisible();

  // 4. Try to export DXF CAD while on Starter plan -> Triggers UpgradeModal
  await page.getByTestId('export-dxf-btn').click();
  const upgradeModal = page.getByTestId('upgrade-modal-dialog');
  await expect(upgradeModal).toBeVisible();
  await expect(upgradeModal.getByText('Pro Studio Required')).toBeVisible();
  await expect(upgradeModal.getByText('AutoCAD 2D DXF Export')).toBeVisible();

  // 5. Click "Upgrade to Pro Studio" in modal
  await upgradeModal.getByTestId('upgrade-now-btn').click();
  await expect(upgradeModal).not.toBeVisible();

  // 6. Now on Pro tier: DXF export should download successfully
  const [dxfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-dxf-btn').click(),
  ]);
  expect(dxfDownload.suggestedFilename()).toMatch(/.*-cad-plan\.dxf$/);
  const dxfContent = await readFile((await dxfDownload.path())!, 'utf8');
  expect(dxfContent).toContain('$ACADVER');
  expect(dxfContent).toContain('AC1009');

  // 7. Verify Tally / Zoho Accounting CSV export also works on Pro tier
  await nav.getByRole('button', { name: /Quotation/ }).click();
  await expect(page.getByTestId('quotation-panel')).toBeVisible();

  const [accountingDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-accounting-csv-btn').click(),
  ]);
  expect(accountingDownload.suggestedFilename()).toMatch(/.*-tally-accounting\.csv$/);
  const csvContent = await readFile((await accountingDownload.path())!, 'utf8');
  expect(csvContent).toContain('Sales Invoice');
  expect(csvContent).toContain('9403');
  expect(csvContent).toContain('9954');
});
