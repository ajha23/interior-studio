import { expect, test } from '@playwright/test';

test('role management & permission matrix: dashboard, clone, matrix, scopes, simulation, and audit trail', async ({
  page,
}) => {
  // 1. Launch studio and create project
  await page.goto('/');
  await page.getByLabel('Project name').fill('RBAC Matrix Studio');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

  // 2. Open Roles & Access from TopBar
  await page.getByTestId('access-settings-btn').click();
  const settingsModal = page.getByTestId('settings-modal-wrapper');
  await expect(settingsModal).toBeVisible();

  // 3. Verify Roles & Permissions dashboard is the default landing view
  await expect(page.getByTestId('roles-dashboard')).toBeVisible();
  await expect(page.getByTestId('role-metrics-summary')).toBeVisible();
  await expect(page.getByTestId('metric-total-roles')).toBeVisible();
  await expect(page.getByTestId('roles-table')).toBeVisible();

  // Verify default system roles exist
  await expect(page.getByRole('cell', { name: 'Owner' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Designer' })).toBeVisible();

  // 4. Clone Designer into a custom role
  await page.getByTestId('clone-role-designer').click();
  const cloneModal = page.getByTestId('clone-role-modal');
  await expect(cloneModal).toBeVisible();

  const nameInput = page.getByTestId('clone-role-name-input');
  await nameInput.fill('Modular Kitchen Designer');
  await page.getByTestId('clone-role-submit-btn').click();

  // 5. Verify Editor View opened for the cloned role
  const editorView = page.getByTestId('role-editor-view');
  await expect(editorView).toBeVisible();
  await expect(page.getByTestId('editor-role-name')).toContainText('Modular Kitchen Designer');

  // 6. Test Hierarchical Permission Matrix in Editor
  await expect(page.getByTestId('permission-matrix')).toBeVisible();

  // Toggle a permission (e.g. quotes:send)
  const quotesPermCheckbox = page.getByTestId('perm-checkbox-quotes:send');
  if (await quotesPermCheckbox.isVisible()) {
    await quotesPermCheckbox.click();
  }

  // 7. Configure Resource Scoping tab
  await page.getByTestId('tab-scope').click();
  await expect(page.getByTestId('resource-access-panel')).toBeVisible();

  // Select 'Assigned projects only'
  await page.getByTestId('scope-option-assigned_projects').click();
  await expect(page.getByTestId('summary-resource-scope')).toContainText('Assigned Projects Only');

  // 8. Save Changes
  await page.getByTestId('save-role-btn').click();

  // 9. Navigate to Access Simulator via Sidebar
  await page.getByTestId('nav-simulator').click();
  await expect(page.getByTestId('access-preview-simulator')).toBeVisible();

  // Run simulation on Pro plan
  await page.getByTestId('sim-run-btn').click();
  await expect(page.getByTestId('simulator-result-card')).toBeVisible();
  await expect(page.getByTestId('sim-verdict-badge')).toBeVisible();
  await expect(page.getByTestId('simulator-pipeline-view')).toBeVisible();

  // 10. Navigate to Access Audit Log via Sidebar
  await page.getByTestId('nav-audit').click();
  await expect(page.getByTestId('access-audit-log')).toBeVisible();

  // Verify cloned audit event is recorded
  await expect(page.getByTestId('access-audit-log')).toContainText('Modular Kitchen Designer');

  // 11. Close settings cleanly
  await page.getByTestId('settings-back-btn').click();
  await expect(settingsModal).not.toBeVisible();
});
