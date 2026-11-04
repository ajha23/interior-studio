import { expect, test } from '@playwright/test';

test('Unified Design Studio: Command Palette, Hierarchical Outliner, and Contextual Toolbar', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Unified Studio Suite');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 1. Open Floating Command Palette via TopBar button
  await page.getByTestId('command-palette-btn').click();
  const palette = page.getByTestId('command-palette-backdrop');
  await expect(palette).toBeVisible();

  const searchInput = page.getByTestId('command-palette-input');
  await expect(searchInput).toBeFocused();

  // 2. Filter commands and execute view switch
  await searchInput.fill('Floor Plan');
  const planCmd = page.getByTestId('command-item-view-plan');
  await expect(planCmd).toBeVisible();
  await planCmd.click();

  // Palette should close and Plan view button should be selected
  await expect(palette).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // 3. Open Command Palette via keyboard shortcut (Cmd+K / Ctrl+K)
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
  await expect(palette).toBeVisible();

  // Close palette via Escape
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();

  // 4. Switch Left Sidebar to Hierarchical Outliner tab
  const outlinerTab = page.getByTestId('tab-outliner');
  await expect(outlinerTab).toBeVisible();
  await outlinerTab.click();

  const outliner = page.getByTestId('hierarchical-outliner');
  await expect(outliner).toBeVisible();
  await expect(page.getByTestId('outliner-section-architecture')).toBeVisible();
  await expect(page.getByTestId('outliner-section-cabinetry')).toBeVisible();

  // 5. Select a wall from Architecture branch
  const backWallNode = page.getByTestId('outliner-node-wall-back');
  await expect(backWallNode).toBeVisible();
  await backWallNode.click();
  await expect(backWallNode).toHaveAttribute('aria-pressed', 'true');

  // 6. Switch back to 3D and select a cabinet from outliner to test Contextual Floating Toolbar
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const firstCabinetNode = outliner.locator('[data-testid^="outliner-node-cab-"]').first();
  if (await firstCabinetNode.isVisible()) {
    await firstCabinetNode.click();

    // Contextual Floating Toolbar should appear on active selection
    const contextualToolbar = page.getByTestId('contextual-toolbar');
    await expect(contextualToolbar).toBeVisible();
    await expect(page.getByTestId('context-focus-btn')).toBeVisible();
    await expect(page.getByTestId('context-delete-btn')).toBeVisible();

    // Click focus in 3D
    await page.getByTestId('context-focus-btn').click();

    // Deselect via close button on contextual toolbar
    await page.getByTestId('context-close-btn').click();
    await expect(contextualToolbar).not.toBeVisible();
  }
});
