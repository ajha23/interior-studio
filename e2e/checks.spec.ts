import { expect, test } from '@playwright/test';

test('an island too close to the run raises design warnings; Show selects; undo clears them', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Checks');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('status-checks')).toHaveText('Design checks OK');

  const input = page.getByLabel('Command:');
  for (const cmd of ['add base 1200', 'free', 'at 1700 1000']) {
    await input.fill(cmd);
    await input.press('Enter');
  }
  await expect(page.getByTestId('status-checks')).toContainText('design warning');
  await expect(page.getByTestId('checks-count')).toBeVisible();

  await page.getByTestId('status-checks').click();
  const panel = page.getByTestId('checks-panel');
  await expect(panel.getByTestId('check-walkway').first()).toContainText('allow at least 900 mm');
  await expect(panel.getByTestId('check-clearance').first()).toContainText('The dishwasher door of Dishwasher 600 hits Base cabinet 1200');
  // The edit itself was allowed: warnings never block.
  await expect(page.getByTestId('status-room')).toBeVisible();
  await expect(page.getByText('No issues')).toBeVisible();

  await page.keyboard.press('Escape');
  await panel.getByTestId('check-clearance').first().getByRole('button', { name: 'Show' }).click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Dishwasher');
  await expect(page.getByTestId('selected-checks')).toContainText('hits Base cabinet 1200');

  // Undo the three commands (add, free, at): back to the clean layout.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('status-checks')).toHaveText('Design checks OK');
});
