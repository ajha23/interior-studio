import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('technical deliverables: tile schedule and printable factory part labels with QR codes', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Technical Studio Project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // Navigate to Deliverables Studio
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(page.getByTestId('drawings-view')).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Sheets' });

  // 1. Inspect Tile Schedule
  await nav.getByRole('button', { name: /Tile schedule/ }).click();
  await expect(page.getByTestId('tile-schedule-panel')).toBeVisible();
  await expect(page.getByText('Net Backsplash Area')).toBeVisible();
  await expect(page.getByTestId('tile-count')).toBeVisible();
  await expect(page.getByTestId('tile-boxes')).toBeVisible();

  // 2. Export Factory Part Labels
  await nav.getByRole('button', { name: /Bill of materials/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Part Labels' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/.*-part-labels\.svg$/);
  const svgContent = await readFile((await download.path())!, 'utf8');

  // Verify label content: finished dims, cut dims, material, QR code
  expect(svgContent).toContain('<svg');
  expect(svgContent).toContain('Finished:');
  expect(svgContent).toContain('Cut Size:');
  expect(svgContent).toContain('EDGING (mm):');
  expect(svgContent).toContain('SCAN FOR 3D');
  expect(svgContent).toContain('width="100mm"');
});

