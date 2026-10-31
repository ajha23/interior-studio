import { expect, test, type Page } from '@playwright/test';

/** Phase 2 acceptance: chat-driven edits through the real UI, the /api/assistant endpoint and the editor. */
async function ask(page: Page, text: string) {
  const box = page.getByLabel('Message the design assistant');
  await box.fill(text);
  await box.press('Enter');
  await expect(page.getByTestId('user-message').last()).toHaveText(text);
  await expect(page.getByRole('status').filter({ hasText: 'planning' })).toHaveCount(0);
}
const lastPreview = (page: Page) => page.getByTestId('change-preview').last();

test('Phase 2 acceptance: create, follow-up resize, move, units, collision, undo — all through chat', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Chat kitchen');
  await page.getByText('Empty room', { exact: true }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Split' }).click();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Design assistant' })).toBeVisible();
  await expect(page.getByLabel('Example requests')).toBeVisible();

  // A. Create a 900 mm base cabinet: previewed, then applied to the canonical project (2D + 3D + inspector).
  await ask(page, 'Create a 900 mm base cabinet');
  await expect(lastPreview(page).getByTestId('proposal-status')).toHaveText('Validated · awaiting approval');
  await expect(lastPreview(page)).toContainText('New: Base cabinet 900');
  await expect(page.locator('[data-testid^="plan-element-"]')).toHaveCount(0);
  await lastPreview(page).getByTestId('approve').click();
  await expect(lastPreview(page).getByTestId('proposal-status')).toHaveText('Applied');
  await expect(page.locator('[data-testid^="plan-element-"]')).toHaveCount(1);
  await expect(page.getByTestId('inspector-title')).toHaveText('Base cabinet');
  await expect(page.getByTestId('inspector-width')).toHaveAttribute('data-mm', '900');
  await expect(page.locator('canvas[data-rendered]')).toBeVisible();

  // B. "Make it 750 mm high" resizes that cabinet.
  await ask(page, 'Make it 750 mm high');
  await expect(lastPreview(page)).toContainText('Size: 900 mm × 720 mm × 560 mm → 900 mm × 750 mm × 560 mm');
  await lastPreview(page).getByTestId('approve').click();
  await expect(page.getByTestId('inspector-height')).toHaveAttribute('data-mm', '750');

  // C. Move the refrigerator 600 mm to the right.
  await page.getByRole('button', { name: /^Add Refrigerator/ }).first().click();
  const offset = Number(await page.getByTestId('inspector-offset').getAttribute('data-mm'));
  await ask(page, 'Move the refrigerator 600 mm to the right');
  await lastPreview(page).getByTestId('approve').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Refrigerator');
  await expect(page.getByTestId('inspector-offset')).toHaveAttribute('data-mm', String(offset + 600));

  // D. Feet and inches: display changes, geometry does not.
  const room = page.getByTestId('status-room');
  const mm = await room.getAttribute('data-mm');
  await ask(page, 'Change all measurements to feet and inches');
  await expect(lastPreview(page)).toContainText('Geometry unchanged');
  await lastPreview(page).getByTestId('approve').click();
  await expect(page.getByLabel('Units', { exact: true })).toHaveValue('ft-in');
  await expect(room).toHaveAttribute('data-mm', mm!);
  await expect(page.getByTestId('inspector-offset')).toHaveAttribute('data-mm', String(offset + 600));

  // E. A cabinet over a door is rejected, with the collision explained and alternatives offered.
  await page.getByRole('button', { name: /^Add Door/ }).click();
  await ask(page, 'Add a cabinet that overlaps the door');
  await expect(lastPreview(page).getByTestId('proposal-status')).toHaveText('Failed validation');
  await expect(lastPreview(page).getByTestId('proposal-errors')).toContainText(/the door on the back wall/);
  await expect(lastPreview(page).getByLabel('Alternatives')).toBeVisible();
  await expect(page.locator('[data-testid^="plan-element-"]')).toHaveCount(2);

  // F. Undo reverts the preceding transaction (the unit change), then the door.
  await ask(page, 'Undo the last operation');
  await expect(page.getByTestId('assistant-history').last()).toContainText('Undid:');
  await ask(page, 'Undo the last operation');
  await expect(page.getByLabel('Units', { exact: true })).toHaveValue('mm');

  // Inspection answers come from the project.
  await ask(page, 'Show me all cabinet dimensions');
  await expect(page.getByTestId('answer-table').last()).toContainText('900 × 750 × 560');
});
