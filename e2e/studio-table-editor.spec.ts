import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('studio table editor: DPDP compliance, PII erasure, audit trail and accounting CSV export', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Governance Studio Project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 1. Open Studio Table Editor
  await page.getByTestId('studio-tables-btn').click();
  const dialog = page.getByTestId('studio-table-editor-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Studio Table Editor')).toBeVisible();
  await expect(dialog.getByText('OWNER ACCESS')).toBeVisible();
  await expect(dialog.getByText('DPDP-2023 Compliant')).toBeVisible();

  // 2. Search and inspect Client in table
  const searchInput = dialog.getByRole('textbox', { name: /search records/i });
  await searchInput.fill('Vikram');
  await expect(dialog.getByText('Vikram Malhotra')).toBeVisible();
  await expect(dialog.getByText('9876543210')).toBeVisible();

  // 3. Export DPDP Portability Bundle (JSON)
  const [dpdpDownload] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByTestId('export-dpdp-cli_01').click(),
  ]);
  expect(dpdpDownload.suggestedFilename()).toMatch(/^DPDP-Export-cli_01-.*\.json$/);
  const dpdpContent = await readFile((await dpdpDownload.path())!, 'utf8');
  const dpdpJson = JSON.parse(dpdpContent);
  expect(dpdpJson.exportVersion).toBe('DPDP-2023-EXPORT-V1');
  expect(dpdpJson.client.name).toBe('Vikram Malhotra');
  expect(dpdpJson.client.mobile).toBe('9876543210');

  // 4. Erase Client PII under DPDP Section 12
  page.on('dialog', async (d) => {
    expect(d.message()).toContain('DPDP Right to Erasure');
    await d.accept();
  });
  await dialog.getByTestId('erase-dpdp-cli_01').click();

  // Clear search query so anonymized client is visible
  await searchInput.clear();

  // Verify client PII is redacted
  await expect(dialog.getByText('Anonymized Client')).toBeVisible();
  await expect(dialog.getByText('0000000000')).toBeVisible();
  await expect(dialog.getByText('Redacted per DPDP Section 12')).toBeVisible();

  // 5. Inspect Immutable Audit Log tab
  await dialog.getByRole('tab', { name: /audit log/i }).click();
  await expect(dialog.getByTestId('audit-table')).toBeVisible();
  await expect(dialog.getByText('client.erased')).toBeVisible();

  // Close Studio Table Editor
  await dialog.getByRole('button', { name: 'Close table editor' }).click();
  await expect(dialog).not.toBeVisible();

  // 6. Navigate to Deliverables -> Quotation and export Accounting CSV
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(page.getByTestId('drawings-view')).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Sheets' });
  await nav.getByRole('button', { name: /Quotation/ }).click();
  await expect(page.getByTestId('quotation-panel')).toBeVisible();

  const [accountingDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Tally \/ Zoho CSV/i }).click(),
  ]);
  expect(accountingDownload.suggestedFilename()).toMatch(/.*-tally-accounting\.csv$/);
  const csvContent = await readFile((await accountingDownload.path())!, 'utf8');

  // Verify accounting voucher format with HSN/SAC splits
  expect(csvContent).toContain('Voucher Date,Voucher Type,Voucher Number,Customer Name,Customer GSTIN,Place of Supply,Supply Type,Item Description,HSN/SAC Code');
  expect(csvContent).toContain('"Sales Invoice"');
  expect(csvContent).toContain('"9403"');
  expect(csvContent).toContain('"9954"');
  expect(csvContent).toContain('"29-Karnataka"');
  expect(csvContent).toContain('"Goods"');
  expect(csvContent).toContain('"Services"');
});
