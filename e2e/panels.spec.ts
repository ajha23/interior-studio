import { expect, test } from '@playwright/test';

async function newProject(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Panels');
  await page.getByText('Empty room', { exact: true }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
}

test('side panels can be hidden and shown again, and stay as left', async ({ page }) => {
  await newProject(page);
  const library = page.getByRole('complementary', { name: 'Library' });
  const properties = page.getByRole('complementary', { name: 'Properties panel' });
  await expect(library).toBeVisible();
  await expect(properties).toBeVisible();

  await page.getByRole('button', { name: 'Hide library' }).click();
  await page.getByRole('button', { name: 'Hide properties' }).click();
  await expect(library).toBeHidden();
  await expect(properties).toBeHidden();
  // The viewport takes the room.
  const wide = await page.locator('main').boundingBox();
  expect(wide!.width).toBeGreaterThan(1100);

  await page.reload();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await expect(library).toBeHidden();
  await page.getByRole('button', { name: 'Show library' }).click();
  await page.getByRole('button', { name: 'Show properties' }).click();
  await expect(library).toBeVisible();
  await expect(properties).toBeVisible();
});

test('the assistant opens from the round button as a chat window, keeps the conversation when closed, and flags a new reply', async ({ page }) => {
  await newProject(page);
  const launcher = page.getByTestId('assistant-launcher');
  const window_ = page.getByTestId('assistant-window');
  await expect(launcher).toBeVisible();
  await expect(window_).toBeHidden();
  const box = await launcher.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x + box!.width).toBeGreaterThan(viewport.width - 40);
  expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 130);

  await launcher.click();
  await expect(window_).toBeVisible();
  await expect(launcher).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Message the design assistant')).toBeFocused();
  await page.getByLabel('Message the design assistant').fill('Create a 900 mm base cabinet');
  // Close while it answers (the reply is held until then): the conversation carries on and the button shows a new reply.
  let release!: () => void;
  const closed = new Promise<void>((r) => (release = r));
  await page.route('**/api/assistant', async (route) => (route.request().method() === 'POST' ? (await closed, route.continue()) : route.continue()));
  await page.getByLabel('Message the design assistant').press('Enter');
  await page.getByRole('button', { name: 'Close assistant' }).click();
  release();
  await expect(window_).toBeHidden();
  await expect(launcher.getByLabel('New reply')).toBeVisible();
  await launcher.click();
  await expect(page.getByTestId('change-preview').last()).toContainText('New: Base cabinet 900');
  await expect(launcher.getByLabel('New reply')).toHaveCount(0);
});
