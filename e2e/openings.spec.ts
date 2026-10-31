import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Openings');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
});

test('add a window from the library: it lands on a free wall and shows on the plan', async ({ page }) => {
  await page.getByRole('button', { name: /^Add Window/ }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Window');
  // The back wall is full of units and wall cabinets, so the window goes onto the left wall.
  await expect(page.getByLabel('Wall', { exact: true })).toHaveValue('left');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Window on the left wall' })).toBeVisible();
});

test('a unit cannot be moved into a doorway', async ({ page }) => {
  const input = page.getByLabel('Command:');
  await input.fill('add door');
  await input.press('Enter');
  await expect(page.getByTestId('inspector-title')).toHaveText('Door');
  const offset = await page.getByTestId('opening-offset').inputValue();
  await page.locator('[data-testid^=outline-]', { hasText: 'Drawer unit 600' }).click();
  await input.fill(`m left ${offset}`);
  await input.press('Enter');
  await expect(page.getByTestId('command-log')).toContainText('Drawer unit 600 blocks the door on the left wall');
  await expect(page.getByLabel('Placement', { exact: true })).toHaveValue('back');
});

test('drag a door along its wall in the plan, open it, and undo the move', async ({ page }) => {
  const input = page.getByLabel('Command:');
  await input.fill('add door');
  await input.press('Enter');
  const before = Number(await page.getByTestId('opening-offset').inputValue());
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const door = page.getByRole('button', { name: 'Door on the left wall' });
  const b = (await door.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 15, { steps: 3 });
  await page.mouse.move(x, y + 40, { steps: 3 });
  await expect(page.getByTestId('plan-readout')).toContainText('along the left wall');
  await page.mouse.up();
  const after = Number(await page.getByTestId('opening-offset').inputValue());
  expect(after).toBeGreaterThan(before);
  await page.getByTestId('opening-leaf').click();
  await expect(page.getByTestId('opening-leaf')).toHaveText('Door: open');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('opening-offset')).toHaveValue(String(before));
});
