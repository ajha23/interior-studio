import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Interact');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
});

test('in interact mode a click opens a drawer like a real one, and a second click closes it', async ({ page }) => {
  await page.locator('[data-testid^=outline-]', { hasText: 'Drawer unit 600' }).click();
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Interact mode' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('f');
  await page.waitForTimeout(900);
  const c = (await page.locator('canvas').first().boundingBox())!;
  const states = page.locator('[data-testid^=opening-drawer]');
  await page.mouse.click(c.x + c.width / 2, c.y + c.height * 0.45);
  await expect(states.filter({ hasText: ': open' })).toHaveCount(1);
  const opened = await states.filter({ hasText: ': open' }).innerText();
  // Clicking the same place again finds the opened drawer and pushes it back in.
  await page.waitForTimeout(600);
  await page.mouse.click(c.x + c.width / 2, c.y + c.height * 0.45);
  await expect(states.filter({ hasText: ': open' })).toHaveCount(0);
  expect(opened).toMatch(/drawer/);
  // Opening and closing is not a design change.
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('an inner drawer opens the door in front of it first; closing the door pushes it back in', async ({ page }) => {
  await page.locator('[data-testid^=outline-]', { hasText: 'Base cabinet 600' }).first().click();
  await page.getByRole('button', { name: 'Internal drawers' }).click();
  await page.getByTestId('opening-s0f0').click();
  await expect(page.getByTestId('opening-s0f0')).toHaveText('Internal drawer 1: open');
  await expect(page.getByTestId('opening-door0')).toHaveText('Door: open');
  await page.getByTestId('opening-door0').click();
  await expect(page.getByTestId('opening-s0f0')).toHaveText('Internal drawer 1: closed');
});

test('open all and close all, from the toolbar and the command line', async ({ page }) => {
  await page.keyboard.press('h');
  await page.getByRole('button', { name: 'Open all' }).first().click();
  await page.locator('[data-testid^=outline-]', { hasText: 'Refrigerator 700' }).click();
  await expect(page.getByTestId('opening-fridge')).toHaveText('Fridge door: open');
  const input = page.getByLabel('Command:');
  await input.fill('close all');
  await input.press('Enter');
  await expect(page.getByTestId('opening-fridge')).toHaveText('Fridge door: closed');
  await expect(page.getByTestId('opening-freezer')).toHaveText('Freezer door: closed');
});
