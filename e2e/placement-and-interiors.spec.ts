import { expect, test, type Page } from '@playwright/test';

async function newStraightKitchen(page: Page) {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Placement');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
}

async function dragPlanUnit(page: Page, name: string, to: { fx: number; fy: number }) {
  const unit = page.getByTestId('plan-view').getByRole('button', { name, exact: true });
  const b = (await unit.boundingBox())!;
  const svg = (await page.getByTestId('plan-view').boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height * 0.75;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y + 20, { steps: 3 });
  await page.mouse.move(svg.x + svg.width * to.fx, svg.y + svg.height * to.fy, { steps: 8 });
  const readout = await page.getByTestId('plan-readout').textContent();
  await page.mouse.up();
  return readout ?? '';
}

test('drag a unit into the room (free-standing), rotate it, then onto another wall; undo each step', async ({ page }) => {
  await newStraightKitchen(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const placement = page.getByLabel('Placement', { exact: true });

  const toMiddle = await dragPlanUnit(page, 'Drawer unit 600', { fx: 0.5, fy: 0.55 });
  expect(toMiddle).toMatch(/free/);
  await expect(placement).toHaveValue('free');
  await expect(page.getByTestId('inspector-from-left')).toBeVisible();

  await page.keyboard.press('r');
  await expect(page.getByLabel('Facing')).toHaveValue('90');

  // Near the right wall: it snaps onto it, facing the room.
  const toWall = await dragPlanUnit(page, 'Drawer unit 600', { fx: 0.86, fy: 0.55 });
  expect(toWall).toMatch(/right wall/);
  await expect(placement).toHaveValue('right');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(placement).toHaveValue('free');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(placement).toHaveValue('back');
});

test('the height grip resizes in 3D in 10 mm steps within range', async ({ page }) => {
  await newStraightKitchen(page);
  await page.locator('[data-testid^=outline-]', { hasText: 'Drawer unit 600' }).click();
  await page.keyboard.press('f');
  await page.waitForTimeout(900);
  const label = (await page.getByTestId('dim-width').boundingBox())!;
  const gx = label.x + label.width / 2;
  const gy = label.y + label.height + 12;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx, gy - 30, { steps: 4 });
  await page.mouse.move(gx, gy - 60, { steps: 4 });
  await expect(page.getByTestId('drag-readout')).toContainText('H ');
  await page.mouse.up();
  const height = Number(await page.getByTestId('inspector-height').inputValue());
  expect(height).toBeGreaterThan(720);
  expect(height).toBeLessThanOrEqual(900);
  expect(height % 10).toBe(0);
  await expect(page.getByTestId('inspector-width')).toHaveValue('600');
});

test('design a crockery unit and drag a shelf inside it', async ({ page }) => {
  await newStraightKitchen(page);
  await page.locator('[data-testid^=outline-]', { hasText: 'Wall cabinet 800' }).click();
  await page.getByRole('button', { name: 'Crockery unit' }).click();
  await expect(page.getByRole('radio', { name: 'Glass doors' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('fitting-0-0')).toBeVisible();

  // Select the glass shelf, note its height, then drag it down.
  await page.getByTestId('fitting-0-1').click();
  const before = Number(await page.getByTestId('fitting-y').inputValue());
  const shelf = (await page.getByTestId('fitting-0-1').boundingBox())!;
  const x = shelf.x + shelf.width / 2;
  const y = shelf.y + shelf.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 10, { steps: 3 });
  await page.mouse.move(x, y + 25, { steps: 3 });
  await page.mouse.up();
  await page.getByTestId('fitting-0-1').click();
  const after = Number(await page.getByTestId('fitting-y').inputValue());
  expect(after).toBeLessThan(before);

  await page.getByRole('button', { name: 'Inside in 3D' }).click();
  await expect(page.getByRole('button', { name: 'Show interiors' })).toHaveAttribute('aria-pressed', 'true');
});
