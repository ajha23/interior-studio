import { expect, test, type Page } from '@playwright/test';

async function newStraightKitchen(page: Page) {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Navigation');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
}

/** Selects the drawer unit (the last floor unit on the back wall, 300 mm from the wall end) and focuses it. */
async function focusDrawer(page: Page) {
  await page.locator('[data-testid^=outline-]', { hasText: 'Drawer unit 600' }).click();
  await page.keyboard.press('f');
  await page.waitForTimeout(900);
  const box = (await page.locator('canvas').first().boundingBox())!;
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

test('focus flies to the unit: clicking the viewport centre selects it again', async ({ page }) => {
  await newStraightKitchen(page);
  const { cx, cy } = await focusDrawer(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspector-title')).toBeHidden();
  await page.mouse.click(cx, cy);
  await expect(page.getByTestId('inspector-title')).toHaveText('Drawer unit');
});

test('drag a unit along its wall in 3D with a live readout; undo restores it', async ({ page }) => {
  await newStraightKitchen(page);
  const { cx, cy } = await focusDrawer(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 4 });
  await page.mouse.move(cx + 80, cy, { steps: 4 });
  await expect(page.getByTestId('drag-readout')).toContainText('mm');
  await page.mouse.up();
  const moved = Number(await page.getByTestId('inspector-offset').inputValue());
  expect(moved).toBeGreaterThan(3300);
  expect(moved).toBeLessThanOrEqual(3600);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('inspector-offset')).toHaveValue('3300');
});

test('the width grip resizes in 10 mm steps within the range, snapping to standard sizes nearby', async ({ page }) => {
  await newStraightKitchen(page);
  await focusDrawer(page);
  const label = (await page.getByTestId('dim-height').boundingBox())!;
  const gx = label.x - 6;
  const gy = label.y + label.height / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 30, gy, { steps: 4 });
  await page.mouse.move(gx + 60, gy, { steps: 4 });
  await expect(page.getByTestId('drag-readout')).toContainText('W ');
  await page.mouse.up();
  const width = Number(await page.getByTestId('inspector-width').inputValue());
  expect(width).toBeGreaterThan(600);
  expect(width).toBeLessThanOrEqual(1200);
  expect(width % 10).toBe(0);
});

test('drag in the plan snaps to the wall end; undo restores', async ({ page }) => {
  await newStraightKitchen(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const drawer = page.getByTestId('plan-view').getByRole('button', { name: 'Drawer unit 600', exact: true });
  const b = (await drawer.boundingBox())!;
  const svg = (await page.getByTestId('plan-view').boundingBox())!;
  // ~6 mm per pixel at the default zoom: 290 mm ≈ 47 px, inside the 12 px snap tolerance of the wall end.
  const pxPerMm = Math.min(svg.width / (4200 + 1400), svg.height / (3200 + 1400));
  const dx = Math.round(290 * pxPerMm);
  const x = b.x + b.width / 2;
  const y = b.y + b.height * 0.8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 3 });
  await page.mouse.move(x + dx, y, { steps: 3 });
  await expect(page.getByTestId('plan-readout')).toContainText('3,600 mm · wall end');
  await page.mouse.up();
  await expect(page.getByTestId('inspector-offset')).toHaveValue('3600');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('inspector-offset')).toHaveValue('3300');
});

test('the command line edits the selection, repeats, and reports errors', async ({ page }) => {
  await newStraightKitchen(page);
  await page.locator('[data-testid^=outline-]', { hasText: 'Drawer unit 600' }).click();
  const input = page.getByLabel('Command:');
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await input.fill('w 900');
  await input.press('Enter');
  await expect(page.getByTestId('inspector-width')).toHaveValue('900');
  await input.fill('w 1500');
  await input.press('Enter');
  await expect(page.getByTestId('command-log')).toContainText('Width 1500 mm is outside the drawer unit range 300–1200 mm');
  await input.fill('u');
  await input.press('Enter');
  await expect(page.getByTestId('inspector-width')).toHaveValue('600');
  await input.press('Enter'); // repeat "u": nothing left to undo
  await expect(page.getByTestId('command-log')).toContainText('Nothing to undo');
  await input.fill('help');
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
});
