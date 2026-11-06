import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('full user interaction journey: 3D design -> deliverables -> quotation & GST -> OptiCut cut-list', async ({ page }, testInfo) => {
  // 1. Visit App & Create Project
  await page.goto('/');
  await page.getByLabel('Project name').fill('Dr. Rahul Sharma Residence');
  await page.getByRole('button', { name: 'Create project' }).click();

  // Wait for WebGL 3D Canvas
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  // Take screenshot of initial 3D kitchen layout
  await page.screenshot({ path: testInfo.outputPath('01_kitchen_3d_design.png') });

  // 2. Select a base cabinet in 3D
  await page.locator('[data-testid^=outline-]').first().click();
  await page.waitForTimeout(500);

  // 3. Navigate to Deliverables Studio
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(page.getByTestId('drawings-view')).toBeVisible({ timeout: 10_000 });

  const nav = page.getByRole('navigation', { name: 'Sheets' });

  // 4. Navigate to Quotation & GST
  await nav.getByRole('button', { name: /Quotation & GST/ }).click();
  await expect(page.getByTestId('quotation-panel')).toBeVisible({ timeout: 5_000 });

  // Verify statutory tax items exist
  await expect(page.getByText(/Commercial Quotation & GST Breakdown/i)).toBeVisible();
  expect(await page.getByText(/9403.40.00/i).count()).toBeGreaterThanOrEqual(1);
  expect(await page.getByText(/9954.79/i).count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByText(/Central GST \(CGST 9%\)/i)).toBeVisible();
  await expect(page.getByText(/State GST \(SGST 9%\)/i)).toBeVisible();

  // Capture screenshot of Intra-State Quotation
  await page.screenshot({ path: testInfo.outputPath('02_quotation_intra_state.png') });

  // 5. Test Interactive Mode Switch: Change to Inter-State (IGST 18%)
  const taxModeSelect = page.getByTestId('tax-mode-select');
  await taxModeSelect.selectOption('INTER_STATE');
  await expect(page.getByText(/Integrated GST \(IGST 18%\)/i)).toBeVisible();
  await expect(page.getByText(/Central GST \(CGST 9%\)/i)).not.toBeVisible();

  // Capture screenshot of Inter-State Quotation
  await page.screenshot({ path: testInfo.outputPath('03_quotation_inter_state.png') });

  // 6. Test User Download of Quotation CSV
  const [quoteDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Quotation CSV' }).click(),
  ]);
  const quotePath = (await quoteDownload.path())!;
  const quoteContent = await readFile(quotePath, 'utf8');
  expect(quoteContent).toContain('HSN_SAC');
  expect(quoteContent).toContain('9403.40.00');
  expect(quoteContent).toContain('9954.79');
  expect(quoteContent).toContain('TOTAL');

  // 7. Test User Download of OptiCut 16-Column Cut List CSV
  const [opticutDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'OptiCut 16-Col CSV' }).click(),
  ]);
  const opticutPath = (await opticutDownload.path())!;
  const opticutContent = await readFile(opticutPath, 'utf8');
  const opticutLines = opticutContent.split('\r\n');
  expect(opticutLines[0]).toBe('Module,Part,Material,CuttingLength,CuttingWidth,Thickness,Qty,Grain,EB_L1,EB_L2,EB_W1,EB_W2,Barcode,DrillPattern,Comments,Project');
  expect(opticutContent).toContain('Left Side (Gable)');
  expect(opticutContent).toContain('Dr. Rahul Sharma Residence');

  // 8. Navigate to Technical Drawings (Floor Plan)
  await nav.getByRole('button', { name: /Floor plan/ }).click();
  await expect(page.getByTestId('sheet-preview')).toBeVisible();
  await page.waitForTimeout(500);

  // Capture screenshot of Floor Plan Technical Sheet
  await page.screenshot({ path: testInfo.outputPath('04_floor_plan_sheet.png') });

  // 9. Navigate to Technical Drawings (Back Wall Elevation)
  await nav.getByRole('button', { name: /Back wall elevation/ }).click();
  await expect(page.getByTestId('sheet-preview')).toBeVisible();
  await page.waitForTimeout(500);

  // Capture screenshot of Wall Elevation Technical Sheet
  await page.screenshot({ path: testInfo.outputPath('05_wall_elevation_sheet.png') });
});
