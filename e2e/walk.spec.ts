import { expect, test, type Page } from '@playwright/test';

async function pose(page: Page) {
  const raw = (await page.getByTestId('walk-minimap').getAttribute('data-pose')) ?? '';
  const [x, z, yaw] = raw.split(',').map(Number);
  return { x: x!, z: z!, yaw: yaw! };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Walk');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Walk mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('walk-minimap')).not.toHaveAttribute('data-pose', '');
});

test('stand in front of the range, then step back with the keyboard', async ({ page }) => {
  // Straight layout: the range is on the back wall at 2700–3300 mm, 600 mm deep.
  await page.locator('[data-testid^=outline-]', { hasText: 'Range cooker 600' }).click();
  await page.keyboard.press('f');
  await expect.poll(async () => (await pose(page)).x, { timeout: 5000 }).toBeGreaterThan(2950);
  const at = await pose(page);
  expect(at.x).toBeLessThan(3050);
  expect(at.z).toBeGreaterThan(600);
  expect(at.z).toBeLessThan(1500);
  await page.locator('canvas').first().click({ position: { x: 5, y: 5 }, button: 'right' });
  await page.keyboard.down('s');
  await page.waitForTimeout(600);
  await page.keyboard.up('s');
  await expect.poll(async () => (await pose(page)).z).toBeGreaterThan(at.z + 300);
});

test('click the mini-map to walk there', async ({ page }) => {
  const map = (await page.getByTestId('walk-minimap').boundingBox())!;
  await page.mouse.click(map.x + map.width * 0.25, map.y + map.height * 0.6);
  await expect.poll(async () => (await pose(page)).x, { timeout: 5000 }).toBeLessThan(1400);
});

test('from where you stand: open a drawer by hand, and edit the unit', async ({ page }) => {
  await page.locator('[data-testid^=outline-]', { hasText: 'Drawer unit 600' }).click();
  await page.keyboard.press('f');
  await page.waitForTimeout(1500);
  await page.keyboard.press('h');
  const c = (await page.locator('canvas').first().boundingBox())!;
  // Standing at the unit and looking at its worktop: the drawer fronts are in the lower part of the view.
  await page.mouse.click(c.x + c.width / 2, c.y + c.height * 0.8);
  await expect(page.locator('[data-testid^=opening-drawer]').filter({ hasText: ': open' })).toHaveCount(1);
  // Editing still works while walking.
  await page.keyboard.press('h');
  const width = page.getByTestId('inspector-width');
  await width.fill('800');
  await width.press('Enter');
  await expect(width).toHaveValue('800');
});

test('save where you stand as a viewpoint and jump back to it', async ({ page }) => {
  await page.locator('[data-testid^=outline-]', { hasText: 'Sink unit 800' }).click();
  await page.keyboard.press('f');
  await page.waitForTimeout(1500);
  const atSink = await pose(page);
  await page.getByRole('button', { name: 'Viewpoints' }).click();
  await page.getByLabel('Viewpoint name').fill('At the sink');
  await page.getByRole('button', { name: 'Save here' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Home');
  await expect.poll(async () => (await pose(page)).z, { timeout: 5000 }).toBeGreaterThan(2000);
  await page.getByRole('button', { name: /^At the sink/ }).click();
  await expect.poll(async () => Math.abs((await pose(page)).x - atSink.x), { timeout: 5000 }).toBeLessThan(20);
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
});
