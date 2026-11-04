import { expect, test } from '@playwright/test';

test('custom roles & authorization: manage custom studio roles, permission matrix, and scoping', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Project name').fill('RBAC Studio Project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 1. Open Studio Table Editor
  await page.getByTestId('studio-tables-btn').click();
  const dialog = page.getByTestId('studio-table-editor-dialog');
  await expect(dialog).toBeVisible();

  // 2. Switch to Roles & Scopes tab
  await dialog.getByTestId('tab-roles-btn').click();
  const rolesPanel = dialog.getByTestId('role-management-panel');
  await expect(rolesPanel).toBeVisible();

  // 3. Verify built-in system role templates are listed and immutable
  await expect(rolesPanel.getByTestId('role-item-owner')).toBeVisible();
  await expect(rolesPanel.getByTestId('role-item-admin')).toBeVisible();
  await expect(rolesPanel.getByTestId('role-item-designer')).toBeVisible();

  // Verify permission matrix grid is rendered for selected role
  await expect(dialog.getByTestId('permission-matrix-grid')).toBeVisible();

  // 4. Create a new custom role
  await dialog.getByTestId('create-role-btn').click();
  const nameInput = dialog.getByTestId('new-role-name');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('Junior Draftsman');

  // Save the custom role
  await dialog.getByTestId('save-new-role-btn').click();

  // Verify the new role heading appears
  await expect(rolesPanel.getByRole('heading', { name: 'Junior Draftsman' })).toBeVisible();

  // 5. Clone an existing system template
  // Select Designer template
  await rolesPanel.getByTestId('role-item-designer').click();
  await dialog.getByTestId('clone-role-btn').click();

  // Verify cloned role exists and is selected
  await expect(rolesPanel.getByRole('heading', { name: 'Designer (Custom)' })).toBeVisible();

  // 6. Delete the cloned custom role
  await dialog.getByTestId('delete-role-btn').click();
  await expect(rolesPanel.getByRole('heading', { name: 'Designer (Custom)' })).not.toBeVisible();

  // 7. Close dialog cleanly
  await dialog.getByRole('button', { name: 'Close table editor' }).click();
  await expect(dialog).not.toBeVisible();
});
