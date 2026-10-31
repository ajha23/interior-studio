import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/l-kitchen-12x10.kitchen.json', import.meta.url));
const ACCEPTANCE = 'Convert this L-shaped kitchen into a U-shaped kitchen. Preserve the sink on its existing wall, keep the refrigerator in place, maximize storage, and maintain all configured clearances.';

/** Phase 4 acceptance: a 12 × 10 ft L kitchen becomes a U through previewed, validated alternatives. */
test('Phase 4: L → U alternatives, previewed in plan and 3D, one applied, then undone and redone', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project file').setInputFiles(FIXTURE);
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  const plan = page.locator('[data-testid^="plan-element-"]');

  const box = page.getByLabel('Message the design assistant');
  await box.fill(ACCEPTANCE);
  await box.press('Enter');
  const options = page.getByTestId('layout-options').last();
  await expect(options.getByTestId('layouts-status')).toHaveText('Options ready · choose one', { timeout: 30_000 });
  await expect(options.getByTestId('layouts-comparison')).toBeVisible();
  await expect(options.getByTestId('layout-option-1')).toContainText('U-shaped');
  await expect(options.getByTestId('layout-option-2')).toBeVisible();
  await expect(options.getByTestId('layout-option-1').getByTestId('hard-ok')).toBeVisible();
  await options.getByTestId('layouts-interpretation').locator('summary').click();
  await expect(options.getByTestId('layouts-interpretation')).toContainText('Sink stays on the back wall');
  await expect(options.getByTestId('layouts-interpretation')).toContainText('Keep unchanged: Refrigerator 700');

  // Preview option 2: the plan and 3D show it, the design itself is unchanged.
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const before = await plan.count();
  await options.getByTestId('layout-option-2').getByTestId('preview-option').click();
  await expect(page.getByTestId('candidate-banner')).toContainText('Previewing: Option 2');
  await expect(page.getByTestId('viewport-3d')).toBeVisible();
  await expect(plan).not.toHaveCount(before);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Back to my design' }).click();
  await expect(page.getByTestId('candidate-banner')).toHaveCount(0);
  await expect(plan).toHaveCount(before);

  // Apply option 1 (atomically, one undo step).
  await options.getByTestId('layout-option-1').getByTestId('apply-option').click();
  await expect(options.getByTestId('layouts-status')).toHaveText('Applied');
  const after = await plan.count();
  expect(after).toBeGreaterThan(before);
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(plan).toHaveCount(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(plan).toHaveCount(after);
});

test('Phase 4: a U-shape that cannot fit is explained, with alternatives', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project file').setInputFiles(FIXTURE);
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  const box = page.getByLabel('Message the design assistant');
  // Requiring a 3 m walkway makes every U impossible in a 12 × 10 ft room.
  await box.fill('Convert this L-shaped kitchen into a U-shaped kitchen and keep at least 3000 mm walking clearance');
  await box.press('Enter');
  const options = page.getByTestId('layout-options').last();
  await expect(options.getByTestId('layouts-infeasible')).toContainText('does not fit this 3658 × 3048 mm room', { timeout: 30_000 });
  await expect(options.getByTestId('layouts-infeasible')).toContainText('You could');
});
