import { expect, test, type Page } from '@playwright/test';

async function createProject(page: Page, name: string, layout: 'Straight' | 'L-shaped' = 'Straight') {
  await page.goto('/');
  await page.getByLabel('Project name').fill(name);
  await page.getByTestId('new-room-width').fill('4500');
  await page.getByTestId('new-room-width').press('Tab');
  await page.getByText(layout, { exact: true }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('viewport-3d').locator('canvas')).toBeVisible();
}

/** Selects the first base cabinet through the dimensioned plan (real clicks on drawn geometry). */
async function selectBaseCabinetInPlan(page: Page) {
  await page.getByRole('button', { name: 'Plan' }).click();
  await page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 600', exact: true }).first().click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Base cabinet');
}

test('create a room, edit a cabinet, undo, save and reopen', async ({ page }) => {
  await createProject(page, 'E2E kitchen');
  await expect(page.getByTestId('status-room')).toHaveText('Room 4500 × 3200 × 2700 mm');
  await expect(page.getByTestId('room-width-label')).toHaveText('4500 mm');

  await selectBaseCabinetInPlan(page);
  const width = page.getByTestId('inspector-width');
  await width.fill('900');
  await width.press('Enter');
  await expect(width).toHaveValue('900');
  await expect(page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 900', exact: true })).toBeVisible();

  // Finish change, then undo it: dimensions stay, finish reverts.
  await page.getByRole('radio', { name: 'Walnut' }).click();
  await expect(page.getByRole('radio', { name: 'Walnut' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('radio', { name: 'White matte' })).toHaveAttribute('aria-checked', 'true');
  await expect(width).toHaveValue('900');

  await page.getByRole('button', { name: 'BOM' }).click();
  await expect(page.getByTestId('bom-cabinet-base-900')).toContainText('900 × 720 × 560');

  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');

  // Reload: the hash route reopens the project from IndexedDB.
  await page.reload();
  await expect(page.getByTestId('viewport-3d').locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 900', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'All projects' }).click();
  await expect(page.getByRole('heading', { name: 'E2E kitchen' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open E2E kitchen' }).first().click();
  await expect(page.getByLabel('Project name')).toHaveValue('E2E kitchen');
});

test('invalid edits are rejected and leave the design unchanged', async ({ page }) => {
  await createProject(page, 'Validation');
  await selectBaseCabinetInPlan(page);
  const width = page.getByTestId('inspector-width');
  await width.fill('1500');
  await width.press('Enter');
  await expect(page.getByTestId('command-error')).toContainText('Width 1500 mm is outside the base cabinet range 150–1200 mm');
  await expect(width).toHaveValue('600');

  // Escape inside a field only reverts the field; a second Escape clears the selection.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByTestId('room-width').fill('3000');
  await page.getByTestId('room-width').press('Enter');
  await expect(page.getByTestId('command-error')).toBeVisible();
  await expect(page.getByTestId('room-width')).toHaveValue('4500');
});

test('clicking rendered 3D geometry selects a unit', async ({ page }) => {
  await createProject(page, 'Picking', 'L-shaped');
  const canvas = page.getByTestId('viewport-3d').locator('canvas[data-rendered]');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = (await canvas.boundingBox())!;
  // Sweep across the middle band of the default view, where the back-wall run sits.
  sweep: for (const fy of [0.55, 0.6, 0.5, 0.65]) {
    for (let fx = 0.3; fx <= 0.75; fx += 0.05) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      const hit = await expect(page.getByTestId('inspector-title')).toBeVisible({ timeout: 400 }).then(() => true, () => false);
      if (hit) break sweep;
    }
  }
  await expect(page.getByTestId('inspector-title')).toBeVisible();
  await expect(page.getByTestId('dim-width')).toBeVisible();
});
