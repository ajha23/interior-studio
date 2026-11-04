import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('deliverables: export 2D floor plan to AutoCAD DXF with CAD layers', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('AutoCAD DXF Test');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // Navigate to Deliverables Studio
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(page.getByTestId('drawings-view')).toBeVisible();

  // View Floor Plan
  const nav = page.getByRole('navigation', { name: 'Sheets' });
  await nav.getByRole('button', { name: /Floor plan/ }).click();
  await expect(page.getByTestId('sheet-preview')).toBeVisible();

  // Export DXF
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'DXF CAD' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/.*-cad-plan\.dxf$/);
  const dxfContent = await readFile((await download.path())!, 'utf8');

  // Verify AutoCAD DXF R12 / AC1009 standard structure and layers
  expect(dxfContent).toContain('$ACADVER');
  expect(dxfContent).toContain('AC1009');
  expect(dxfContent).toContain('WALLS');
  expect(dxfContent).toContain('CABINETS');
  expect(dxfContent).toContain('WORKTOPS');
  expect(dxfContent).toContain('DIMENSIONS');
  expect(dxfContent).toContain('AutoCAD DXF Test (Plan)');
  expect(dxfContent).toContain('EOF');
});

