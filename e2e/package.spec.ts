import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = fileURLToPath(new URL('./fixtures/l-kitchen-12x10.kitchen.json', import.meta.url));

async function save(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: download.suggestedFilename(), text: await readFile((await download.path())!, 'latin1') };
}

const pageItem = (page: Page, name: RegExp) => page.getByTestId('page-list').getByRole('button', { name });

/** 019 acceptance: an editable client package whose drawings stay linked to the design. */
test('Client package: pages, notes, label edits, stale detection, regeneration, PDF and reopening', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project file').setInputFiles(FIXTURE);
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await page.getByRole('navigation', { name: 'Sheets' }).getByRole('button', { name: /Client package/ }).click();

  // 1–3. A starter package: layout, an elevation per wall in use, board, 3D view, schedule.
  await page.getByTestId('create-package').click();
  const list = page.getByTestId('page-list');
  await expect(list.getByRole('button')).toHaveText([/Kitchen layout/, /Elevation A — Back wall/, /Elevation B — Left wall/, /Elevation C — Front wall/, /Hardware/, /3D view/, /Cabinet schedule/]);
  const sheet = page.getByTestId('package-sheet');
  for (const t of ['3658', '3886', '3048']) await expect(sheet.getByText(t, { exact: true }).first()).toBeAttached();

  // 6. Rename and reorder; fill the title block.
  await page.getByTestId('page-name').fill('First floor main kitchen');
  await page.getByTestId('page-name').press('Enter');
  await page.getByTestId('info-client').fill('Test Client');
  await page.getByTestId('info-client').press('Enter');
  await expect(sheet).toContainText('Test Client');
  await pageItem(page, /Cabinet schedule/).click();
  await page.getByRole('button', { name: 'Move page up' }).click();
  await expect(list.getByRole('button').nth(5)).toHaveText(/Cabinet schedule/);

  // 7. A note and a moved dimension label on elevation A; the measurement stays 800.
  await pageItem(page, /Elevation A/).click();
  await page.getByTestId('add-note').click();
  await page.getByTestId('note-text').fill('NOTE: LED strip will be installed after the kitchen is completed');
  await page.getByTestId('note-text').blur();
  await expect(sheet).toContainText('LED strip will be installed');
  // An arrow from the note, its tip dragged on its own; snapping shows a guide while a note moves.
  await page.getByTestId('add-arrow').click();
  const tip = page.locator('[data-kind="leader"]');
  await expect(tip).toHaveCount(1);
  const tb = (await tip.boundingBox())!;
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + 60, tb.y + 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('package-message')).toContainText('Note updated');
  await expect(sheet.locator('polygon[fill="#c8102e"]')).toHaveCount(1);
  const dim = page.locator('[data-handle^="dim:segment:x:1000,"]').first();
  const box = (await dim.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('dimension-value')).toContainText('800');
  await expect(page.getByTestId('package-message')).toContainText('the measurement is unchanged');
  await expect(pageItem(page, /Elevation A/)).toHaveAttribute('data-status', 'customized');
  // Undo and redo the label move (package history only).
  await page.getByRole('button', { name: 'Undo package edit' }).click();
  await page.getByRole('button', { name: 'Redo package edit' }).click();

  // 8–9. Change a cabinet in the design: only the pages that show it become stale.
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByTestId('outline-base1').click();
  const height = page.getByTestId('inspector-height');
  await height.fill('750');
  await height.press('Enter');
  await expect(height).toHaveAttribute('data-mm', '750');
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(pageItem(page, /Elevation A/)).toHaveAttribute('data-status', 'stale');
  await expect(pageItem(page, /First floor main kitchen/)).toHaveAttribute('data-status', 'current');
  await expect(pageItem(page, /Elevation B/)).toHaveAttribute('data-status', 'current');
  await expect(pageItem(page, /Cabinet schedule/)).toHaveAttribute('data-status', 'stale');
  await pageItem(page, /Elevation A/).click();
  await expect(page.getByTestId('stale-banner')).toBeVisible();

  // 10–11. Regenerate only that page: the note and the label edit survive.
  await page.getByTestId('stale-banner').getByRole('button', { name: 'Regenerate' }).click();
  await expect(pageItem(page, /Elevation A/)).toHaveAttribute('data-status', 'customized');
  await expect(pageItem(page, /Cabinet schedule/)).toHaveAttribute('data-status', 'stale');
  await expect(sheet).toContainText('LED strip will be installed');
  await expect(page.locator('[data-handle^="dim:segment:x:1000,"]')).toHaveCount(1);

  // 12. One PDF for the whole package, stale pages labelled as such.
  const pdf = await save(page, () => page.getByTestId('export-package-pdf').click());
  expect(pdf.text.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf.text.match(/\/Type \/Page /g)).toHaveLength(7);
  expect(pdf.text).toContain('LED strip will be installed');
  expect(pdf.text).toContain('Test Client');
  expect(pdf.text).toContain('STALE pages: Cabinet schedule');

  // 13. Reopen: the package and its edits are still there.
  await page.reload();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await page.getByRole('navigation', { name: 'Sheets' }).getByRole('button', { name: /Client package/ }).click();
  await expect(list.getByRole('button')).toHaveCount(7);
  await pageItem(page, /Elevation A/).click();
  await expect(sheet).toContainText('LED strip will be installed');
  await expect(sheet).toContainText('Test Client');

  // Chat edits the open page (the design is not touched); a broad edit waits for Apply.
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  const chatBox = page.getByLabel('Message the design assistant');
  await chatBox.fill('Add a note that the gas pipe will be covered later');
  await chatBox.press('Enter');
  await expect(page.getByTestId('package-chat-message').last()).toContainText('Package updated');
  await expect(sheet).toContainText('NOTE: The gas pipe will be covered later');
  await chatBox.fill('Which pages are outdated?');
  await chatBox.press('Enter');
  // The reload reopened the last saved design (before the height edit): now elevation A, which was
  // regenerated from the edit, is the stale page.
  await expect(page.getByTestId('package-chat-message').last()).toContainText('Elevation A — Back wall: Technical content stale');
  await chatBox.fill('Change every page to A4');
  await chatBox.press('Enter');
  const approve = page.getByTestId('package-chat-message').last();
  await expect(approve).toContainText('Nothing is changed until you apply it');
  await approve.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('page-paper')).toHaveValue('A4');
});

/** Named 3D views: added in one step, framed automatically, captured again when the design changes. */
test('Client package: standard 3D views are captured, go stale and are captured again', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Project file').setInputFiles(FIXTURE);
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await page.getByRole('navigation', { name: 'Sheets' }).getByRole('button', { name: /Client package/ }).click();
  await page.getByTestId('create-package').click();

  await page.getByTestId('add-standard-views').click();
  await expect(page.getByTestId('package-message')).toContainText('Captured 3 3D views', { timeout: 20_000 });
  for (const name of [/Overall view/, /Back wall run/, /Left wall run/]) {
    await pageItem(page, name).click();
    await expect(pageItem(page, name)).toHaveAttribute('data-status', 'current');
    await expect(page.getByTestId('package-sheet').locator('image')).toHaveCount(1);
  }
  // Each view is a different picture.
  const images = new Set<string>();
  for (const name of [/Overall view/, /Back wall run/, /Left wall run/]) {
    await pageItem(page, name).click();
    images.add((await page.getByTestId('package-sheet').locator('image').getAttribute('href'))!);
  }
  expect(images.size).toBe(3);

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByTestId('outline-base1').click();
  const height = page.getByTestId('inspector-height');
  await height.fill('750');
  await height.press('Enter');
  await expect(height).toHaveAttribute('data-mm', '750');
  await page.getByRole('button', { name: 'Deliverables' }).click();
  await expect(pageItem(page, /Back wall run/)).toHaveAttribute('data-status', 'stale');
  await page.getByTestId('recapture-stale').click();
  await expect(page.getByTestId('package-message')).toContainText('Captured 3 3D views', { timeout: 20_000 });
  for (const name of [/Overall view/, /Back wall run/, /Left wall run/]) await expect(pageItem(page, name)).toHaveAttribute('data-status', 'current');
});
