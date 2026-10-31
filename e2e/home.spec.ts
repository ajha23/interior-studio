import { expect, test } from '@playwright/test';

/** Whole homes: describe → planned and furnished → plan and 3D → refine a room → save and reopen. */
test('design a 3BHK apartment, refine a bedroom, save and reopen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Describe it (optional)').fill('3BHK apartment, 1400 sq ft, japandi');
  await expect(page.getByLabel('Bedrooms')).toHaveValue('3');
  await expect(page.getByLabel('Home style')).toHaveValue('japandi');
  await page.getByRole('button', { name: 'Design home' }).click();

  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(page.getByTestId('home-summary')).toContainText('3BHK apartment');
  await expect(page.locator('[data-room-type="master-bedroom"]')).toHaveCount(1);
  await expect(page.locator('[data-room-type="bedroom"]')).toHaveCount(2);
  await expect(page.locator('[data-room-type="kitchen"]')).toHaveCount(1);
  await expect(page.getByLabel('Style for every room')).toHaveValue('japandi');

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByTestId('home-3d')).toBeVisible();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();

  // Select a bedroom, make it wider, then design it in the room editor.
  await page.getByTestId('room-list-item').filter({ hasText: 'Bedroom 2' }).click();
  await expect(page.getByTestId('room-inspector')).toBeVisible();
  await page.getByLabel('Room name').fill('Guest room');
  await page.getByLabel('Room name').blur();
  await page.getByTestId('open-room').click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Project name')).toHaveValue(/Guest room$/);

  // Edit in the room through the assistant (built-in rules on the test server).
  await page.getByTestId('assistant-launcher').click();
  await page.getByLabel('Message the design assistant').fill('delete the desk');
  await page.getByLabel('Message the design assistant').press('Enter');
  const preview = page.getByTestId('change-preview').last();
  await expect(preview.getByTestId('proposal-status')).toHaveText('Validated · awaiting approval');
  await preview.getByTestId('approve').click();
  await expect(preview.getByTestId('proposal-status')).toHaveText('Applied');
  await page.getByTestId('assistant-launcher').click();

  // Back to the plan: the edit came with it (unsaved), then save.
  await page.getByRole('button', { name: /^Back to / }).click();
  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(page.getByTestId('room-list-item').filter({ hasText: 'Guest room' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByRole('list', { name: 'Your homes' })).toContainText('3BHK apartment');
});

test('the assistant designs a villa from one sentence', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Start');
  await page.getByText('Empty room', { exact: true }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('assistant-launcher').click();
  await page.getByLabel('Message the design assistant').fill('design a 4 bedroom villa');
  await page.getByLabel('Message the design assistant').press('Enter');
  await expect(page.getByTestId('home-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('home-summary')).toContainText('4BHK villa');
  await expect(page.getByRole('button', { name: 'Level 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Level 1' }).click();
  await expect(page.locator('[data-room-type="master-bedroom"]')).toHaveCount(1);
});

test('on a narrow window the rooms, room details and assistant are still there', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Design home' }).click();
  await expect(page.getByTestId('home-view')).toBeVisible();
  // Selecting a room opens its details as a drawer.
  await page.locator('[data-room-type="kitchen"]').click();
  await expect(page.getByTestId('room-inspector')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('room-inspector')).toBeHidden();
  await page.getByRole('button', { name: 'Rooms' }).click();
  await expect(page.getByTestId('room-list-item').first()).toBeVisible();
  // The assistant works on the plan: open a room by name.
  await page.getByTestId('assistant-launcher').click();
  await page.getByLabel('Message the design assistant').fill('design the master bedroom');
  await page.getByLabel('Message the design assistant').press('Enter');
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Project name')).toHaveValue(/Master bedroom$/);
  // In the room editor the properties drawer opens from the Properties button.
  await page.getByRole('toolbar', { name: 'Panels' }).getByRole('button', { name: /Properties/ }).click();
  await expect(page.getByRole('complementary', { name: 'Properties panel' })).toBeVisible();
});
