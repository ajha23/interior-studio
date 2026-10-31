import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = fileURLToPath(new URL('./fixtures/l-kitchen-12x10.kitchen.json', import.meta.url));

async function save(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: download.suggestedFilename(), text: await readFile((await download.path())!, 'latin1') };
}

/** Phase 5 acceptance on the 12 × 10 ft L kitchen (walls, a window, a door, known cabinet sizes). */
test('Phase 5: drawings, schedule, BOM, readiness, PDF/CSV exports, stale detection and regeneration', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project file').setInputFiles(FIXTURE);
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Deliverables' }).click();
  const nav = page.getByRole('navigation', { name: 'Sheets' });

  // 5. Readiness first: presentable and drawable, not manufacturable.
  await expect(page.getByTestId('readiness-drawings')).toContainText('Drawings ready');
  await expect(page.getByTestId('readiness-manufacturing')).toContainText('Not ready for manufacturing');
  await expect(page.getByTestId('readiness-issues')).toContainText('No construction method is chosen');

  // 1. Dimensioned floor plan from the model: internal 3658 × 3048, external 3886 × 3276, door 900.
  await nav.getByRole('button', { name: /Floor plan/ }).click();
  const sheet = page.getByTestId('sheet-preview');
  for (const t of ['3658', '3886', '3048', '3276', '900', '114']) await expect(sheet.getByText(t, { exact: true }).first()).toBeAttached();
  await expect(page.getByTestId('drawing-sheet')).toContainText('1:25 on A3');

  // 2. Elevation of a selected kitchen wall.
  await nav.getByRole('button', { name: /Back wall elevation/ }).click();
  await expect(sheet.getByText('2438', { exact: true })).toBeAttached();
  await expect(sheet.getByText('C2', { exact: true })).toBeAttached();

  // 3. Schedule with ids, sizes and finishes; incomplete fields are marked.
  await nav.getByRole('button', { name: /Cabinet schedule/ }).click();
  const schedule = page.getByTestId('schedule-table');
  await expect(schedule.locator('tbody tr')).toHaveCount(13);
  await expect(schedule).toContainText('White matte');
  await expect(schedule.locator('tr[data-status="incomplete"]').first()).toBeVisible();
  const scheduleCsv = await save(page, () => page.getByRole('button', { name: 'CSV', exact: true }).click());
  expect(scheduleCsv.text).toContain('Ref,Object ID,Type,Wall / run,W (mm),H (mm),D (mm)');
  expect(scheduleCsv.text).toContain('C4,base1,Base cabinet,Back wall run 1,600,720,560');

  // 4. BOM for the supported rules; the blind corner is honestly left out.
  await nav.getByRole('button', { name: /Readiness/ }).click();
  await page.getByLabel('Construction method').selectOption('frameless-18');
  await expect(page.getByTestId('readiness-issues')).toContainText('C1 (Blind corner unit)');
  await nav.getByRole('button', { name: /Bill of materials/ }).click();
  await expect(page.getByTestId('bom-partial')).toContainText('C1');
  await expect(page.getByTestId('bom-table')).toContainText('Side');
  const bomCsv = await save(page, () => page.getByRole('button', { name: 'BOM CSV' }).click());
  expect(bomCsv.text).toContain('no (partial)');
  expect(bomCsv.text).toContain('estimated');

  // 6. PDF of the whole set.
  const pdf = await save(page, () => page.getByTestId('export-pdf-set').click());
  expect(pdf.name).toMatch(/drawings\.pdf$/);
  expect(pdf.text.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.text).toContain('(3658)');
  const revision = /-(r-\w{6})/.exec(pdf.name)![1]!;

  // 8. Change a cabinet: the generated files become stale.
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByTestId('outline-base1').click();
  const height = page.getByTestId('inspector-height');
  await height.fill('750');
  await height.press('Enter');
  await expect(height).toHaveAttribute('data-mm', '750');
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await nav.getByRole('button', { name: /Generated files/ }).click();
  await expect(page.getByTestId('stale-badge')).toHaveCount(3);

  // 9. Regenerate for the new revision.
  const regenerated = await save(page, () => page.getByRole('button', { name: 'Regenerate for the latest revision' }).first().click());
  expect(regenerated.name).not.toContain(revision);
  await expect(page.getByTestId('deliverable-history').locator('li').first()).toContainText('Current');

  // 10. Drawings and schedule match the changed model: the elevation is drawn from the new revision.
  const newRevision = /-(r-\w{6})/.exec(regenerated.name)![1]!;
  await nav.getByRole('button', { name: /Back wall elevation/ }).click();
  await expect(sheet).toContainText(newRevision);
  await expect(sheet.getByText('2438', { exact: true })).toBeAttached();
  await nav.getByRole('button', { name: /Cabinet schedule/ }).click();
  await expect(schedule.locator('tr', { hasText: 'C4' })).toContainText('750');
});

test('Phase 5: chat asks what is missing; presentation mode hides editing and exits cleanly', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project file').setInputFiles(FIXTURE);
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  const box = page.getByLabel('Message the design assistant');
  await box.fill('Tell me what information is missing before I can send this to the carpenter');
  await box.press('Enter');
  const reply = page.getByTestId('deliverable-message').last();
  await expect(reply).toContainText('Not ready for manufacturing');
  await expect(reply).toContainText('Blocking: No construction method is chosen');
  await box.fill('Show me a schedule of all base cabinets');
  await box.press('Enter');
  await expect(page.getByTestId('deliverable-table').last().locator('tbody tr')).toHaveCount(2);

  await box.fill('Start presentation mode');
  await box.press('Enter');
  await page.getByTestId('deliverable-message').last().getByRole('button', { name: 'Start presentation' }).click();
  await expect(page.getByTestId('presentation-overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Presentation views' }).getByRole('button', { name: 'Back wall run' }).click();
  await page.getByTestId('exit-presentation').click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
});
