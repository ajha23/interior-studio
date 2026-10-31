import { expect, test } from '@playwright/test';

/** The Phase 1 acceptance criteria, in order, as one designer session. */
test('Phase 1 acceptance: 12 × 10 ft room, units, both views, openings, cabinet edit, undo/redo, save and reload', async ({ page }) => {
  // 1. Create a room measuring 12 ft × 10 ft.
  await page.goto('/');
  await page.getByLabel('Project name').fill('Phase 1');
  await page.getByLabel('Units').selectOption('ft-in');
  await page.getByTestId('new-room-width').fill(`12'`);
  await page.getByTestId('new-room-width').press('Tab');
  await page.getByTestId('new-room-length').fill(`10'`);
  await page.getByTestId('new-room-length').press('Tab');
  await page.getByText('Empty room', { exact: true }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  const room = page.getByTestId('status-room');
  await expect(room).toHaveAttribute('data-mm', '3658x3048x2700');
  await expect(room).toContainText(`12' 0" × 10' 0"`);

  // 2. Switch display units without changing the geometry.
  const units = page.getByLabel('Units', { exact: true });
  await units.selectOption('cm');
  await expect(room).toContainText('365.8 cm × 304.8 cm');
  await units.selectOption('mm');
  await expect(room).toContainText('3,658 mm × 3,048 mm');
  await units.selectOption('ft-in');
  await expect(room).toContainText(`12' 0" × 10' 0"`);
  await expect(room).toHaveAttribute('data-mm', '3658x3048x2700');

  // 3. See the room in 2D and 3D at once.
  await page.getByRole('button', { name: 'Split' }).click();
  await expect(page.getByTestId('plan-view')).toBeVisible();
  await expect(page.getByTestId('viewport-3d')).toBeVisible();
  await expect(page.getByTestId('plan-grid')).toBeVisible();
  await expect(page.getByTestId('plan-view').getByText('Back wall')).toBeVisible();

  // 4. Add a door, a window and a cabinet.
  await page.getByRole('button', { name: /^Add Door/ }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Door');
  await page.getByRole('button', { name: /^Add Window/ }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Window');
  await page.getByRole('button', { name: /^Add Base cabinet 1' 11 5\/8"/ }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Base cabinet');
  const plan = page.getByTestId('plan-view');
  await expect(plan.getByRole('button', { name: 'Door on the back wall' }).or(plan.getByRole('button', { name: /^Door on the/ }))).toBeVisible();
  await expect(plan.getByRole('button', { name: /^Window on the/ })).toBeVisible();

  // 5. Select the cabinet and edit its dimensions (typed in feet and inches).
  const width = page.getByTestId('inspector-width');
  await width.fill(`2' 6"`);
  await width.press('Enter');
  await expect(width).toHaveAttribute('data-mm', '762');
  await expect(width).toHaveValue(`2' 6"`);

  // 6. The updated geometry appears in both views.
  await expect(plan.getByRole('button', { name: 'Base cabinet 762', exact: true })).toBeVisible();
  await expect(page.getByTestId('dim-width')).toHaveText(`W 2' 6"`);

  // 7. Undo and redo the edit.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(width).toHaveAttribute('data-mm', '600');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(width).toHaveAttribute('data-mm', '762');

  // 8. Save, reload, and keep the dimensions (and the display unit).
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('status-room')).toHaveAttribute('data-mm', '3658x3048x2700');
  await expect(page.getByTestId('status-room')).toContainText(`12' 0"`);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 762', exact: true })).toBeVisible();
});

test('walls are selectable in the plan with their own inspector', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Walls');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByTestId('plan-wall-left').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Left wall');
  await expect(page.getByTestId('wall-length')).toHaveAttribute('data-mm', '3200');
  await page.getByRole('button', { name: 'Add window', exact: true }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Window');
  await expect(page.getByLabel('Wall', { exact: true })).toHaveValue('left');
});
