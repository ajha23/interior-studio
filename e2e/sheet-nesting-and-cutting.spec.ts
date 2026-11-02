import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('Feature 032: 2D Sheet Nesting, Cutting Optimization & Visual Workshop Layouts', () => {
  test('full user workflow: 3D kitchen -> deliverables -> cutting layouts -> sheet inspection -> DXF export', async ({
    page,
  }) => {
    // 1. Visit App & Create Project
    await page.goto('/');
    await page.getByLabel('Project name').fill('Adani Penthouse Kitchen');
    await page.getByRole('button', { name: 'Create project' }).click();

    // 2. Wait for WebGL 3D Canvas
    await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

    // 3. Navigate to Deliverables Studio
    await page.getByRole('button', { name: 'Deliverables' }).click();
    await expect(page.getByTestId('drawings-view')).toBeVisible({ timeout: 10_000 });

    const nav = page.getByRole('navigation', { name: 'Sheets' });

    // 4. Click "Cutting layouts"
    await nav.getByRole('button', { name: /Cutting layouts/i }).click();

    // 5. Verify Telemetry & Layouts Panel
    await expect(page.getByText(/Sheet Nesting & Cutting Optimization/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Sheets Total/i)).toBeVisible();
    await expect(page.getByText(/Net Yield/i)).toBeVisible();

    // 6. Verify SVG Board Canvas
    const canvasSvg = page.getByTestId('sheet-canvas-svg');
    await expect(canvasSvg).toBeVisible();

    // Verify presence of placed cabinet panels
    await expect(page.locator('[data-testid^="panel-rect-"]').first()).toBeVisible();

    // 7. Verify Zoom Controls
    const zoomInBtn = page.getByRole('button', { name: /zoom in/i });
    await expect(zoomInBtn).toBeVisible();
    await zoomInBtn.click();

    // 8. Test DXF Export Download
    const exportBtn = page.getByRole('button', { name: /Export Layouts/i });
    await exportBtn.click();

    const [dxfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /AutoCAD DXF/i }).click(),
    ]);

    const dxfPath = (await dxfDownload.path())!;
    const dxfContent = await readFile(dxfPath, 'utf8');

    expect(dxfContent).toContain('SECTION');
    expect(dxfContent).toContain('BOARD_OUTLINE');
    expect(dxfContent).toContain('PANEL_CUTS');
    expect(dxfContent).toContain('EOF');
  });
});
