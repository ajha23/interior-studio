import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('deliverables: plan, elevations, schedule, and a cut list once a construction method is chosen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Drawings');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Deliverables' }).click();

  const nav = page.getByRole('navigation', { name: 'Sheets' });
  await expect(nav.getByRole('button')).toHaveText([/Readiness/, /Floor plan/, /Back wall elevation/, /Cabinet schedule/, /Bill of materials/, /Generated files/, /Client presentation/]);
  await nav.getByRole('button', { name: /Floor plan/ }).click();
  await expect(page.getByTestId('sheet-preview')).toContainText('4200');

  await nav.getByRole('button', { name: /Back wall elevation/ }).click();
  const sheet = page.getByTestId('sheet-preview');
  await expect(sheet.getByText('4200', { exact: true })).toHaveCount(1); // the wall (the run is 3900 + a 300 mm gap)
  await expect(sheet.getByText('300', { exact: true }).first()).toBeAttached();
  await expect(sheet.getByText('C1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('sheet-title')).toHaveText('Back wall elevation');

  await nav.getByRole('button', { name: /Cabinet schedule/ }).click();
  await expect(page.getByTestId('schedule-table').locator('tbody tr')).toHaveCount(11);
  await expect(page.getByTestId('schedule-table')).toContainText('700');

  await nav.getByRole('button', { name: /Readiness/ }).click();
  await page.getByLabel('Construction method').selectOption('frameless-18');
  await nav.getByRole('button', { name: /Bill of materials/ }).click();
  await expect(page.getByTestId('bom-table')).toContainText('Concealed hinge');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Cut list CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^drawings-r-\w+-cut-list\.csv$/);
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv.split('\n')[0]).toBe('Part,Material,Thickness (mm),Length (mm),Width (mm),Qty,Edge banding,Units');
  expect(csv).toContain('Side,White carcass,18,720,542');
});
