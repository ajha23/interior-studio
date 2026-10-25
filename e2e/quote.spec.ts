import { expect, test } from '@playwright/test';
import { blankProject, buildQuote, DEFAULT_PRICE_LIST, formatInr, mm, planRun, singleRoomPlan, wallFace, type Opening, type Project } from '../packages/core/src/index';
import { MockBackend, PROJECT_ID } from './backend';

/** A furnished kitchen: base run along wall 1 and wall units either side of the window. */
function furnishedKitchen(): Project {
  const p = blankProject('E2E Quote kitchen', 'Iyer family');
  const { plan, walls } = singleRoomPlan('Kitchen', mm(3000), mm(2400));
  const h = mm(115);
  const win: Opening = { id: 'win-1', kind: 'window', wallId: walls[0].id, offsetUm: h + mm(900), widthUm: mm(1200), heightUm: mm(1200), sillUm: mm(1000), hinge: 'start', side: 1 };
  let project: Project = { ...p, plan, openings: [win], furniture: [] };
  const face = wallFace(plan, walls[0].id)!;
  project = { ...project, furniture: planRun(project, face, 'base').items };
  project = { ...project, furniture: [...project.furniture, ...planRun(project, face, 'wall').items] };
  return project;
}

test('quote: priced from the scene, rates editable, saved as a numbered snapshot, answerable by the command bar', async ({ page }) => {
  const seed = furnishedKitchen();
  const be = new MockBackend(seed);
  await be.install(page);
  await page.goto(`/p/${PROJECT_ID}`);
  await expect(page.getByText('Saved · v1')).toBeVisible();

  // Client quote: one line per unit, totals equal the core engine's quote for the same scene.
  await page.getByRole('tab', { name: 'Quote' }).click();
  const expected = buildQuote(seed, DEFAULT_PRICE_LIST);
  await expect(page.getByTestId('quote-line')).toHaveCount(6);
  await expect(page.getByTestId('quote-subtotal')).toHaveText(formatInr(expected.subtotal));
  await expect(page.getByTestId('quote-gst')).toHaveText(formatInr(expected.gst));
  await expect(page.getByTestId('quote-total')).toHaveText(formatInr(expected.total));
  await expect(page.locator('.quote-sheet')).toContainText('Iyer family');
  await expect(page.locator('.quote-sheet')).toContainText('Black galaxy granite top');
  await expect(page.getByText('Sample rates')).toBeVisible();
  await page.screenshot({ path: 'test-results/quote.png', fullPage: true });

  // Print layout: only the quotation sheet (no editor chrome, internal summary or notes editor).
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.quote-side')).toBeHidden();
  await expect(page.locator('.quote-notes-print')).toBeVisible();
  await page.screenshot({ path: 'test-results/quote-print.png', fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // Workshop BOM: whole sheets, banding, worktop area and hardware.
  await page.getByRole('tab', { name: 'Workshop BOM' }).click();
  const bom = page.locator('.sheet');
  await expect(bom).toContainText('sheet');
  await expect(bom).toContainText('Matching PVC edge band');
  await expect(bom).toContainText('Worktop · Black galaxy granite');
  await expect(bom).toContainText('Concealed hinge');
  // Cut-list: the four base units form one 3000 mm slab with three joints.
  await expect(page.getByTestId('worktop-cut')).toHaveCount(1);
  await expect(page.getByTestId('worktop-cut')).toContainText('3,000 × 580');
  await expect(page.getByTestId('worktop-cut').locator('td').last()).toHaveText('3');
  await page.getByRole('tab', { name: 'Client quote' }).click();

  // An admin changes the granite rate: saved to the studio price list, the quote reprices.
  await page.getByRole('button', { name: 'Edit rates' }).click();
  const granite = page.getByRole('dialog', { name: 'Studio rates' }).getByLabel('Black galaxy granite');
  await granite.fill('600');
  await granite.blur();
  await page.getByRole('button', { name: 'Save rates' }).click();
  await expect(page.getByRole('dialog', { name: 'Studio rates' })).toBeHidden();
  expect((be.priceList as { worktopPerSqft: Record<string, number> }).worktopPerSqft['granite-black']).toBe(600);
  const repriced = buildQuote(seed, { ...DEFAULT_PRICE_LIST, worktopPerSqft: { ...DEFAULT_PRICE_LIST.worktopPerSqft, 'granite-black': 600 } });
  await expect(page.getByTestId('quote-total')).toHaveText(formatInr(repriced.total));
  await expect(page.getByText('Sample rates')).toBeHidden();

  // Save the quote: a numbered snapshot with client lines (no internal costs) and the rates used.
  await page.getByRole('button', { name: 'Save quote' }).click();
  await expect(page.getByText(/Saved as Q-\d{8}-[A-Z0-9]{4}\./)).toBeVisible();
  expect(be.quotes).toHaveLength(1);
  const saved = be.quotes[0] as { lines: Record<string, unknown>[]; totals: { total: number }; client_name: string; rates: { worktopPerSqft: Record<string, number> } };
  expect(saved.totals.total).toBe(repriced.total);
  expect(saved.client_name).toBe('Iyer family');
  expect(saved.lines).toHaveLength(6);
  expect(saved.lines.every((l) => !('cost' in l))).toBe(true);
  expect(saved.rates.worktopPerSqft['granite-black']).toBe(600);
  await expect(page.locator('.quote-side')).toContainText(formatInr(repriced.total));

  // The command bar answers cost questions from the same quote, without changing the design.
  await page.getByRole('tab', { name: 'Split' }).click();
  const input = page.getByRole('textbox', { name: 'Describe a change' });
  await input.fill('how much does this kitchen cost?');
  await input.press('Enter');
  await expect(page.getByTestId('cmd-entry').last()).toContainText(`Whole design: ${formatInr(repriced.total)} including 18% GST`);
  await page.waitForTimeout(3000);
  expect(be.versions).toHaveLength(1);

  // A sink cut-out on a 900 mm base unit: validated, priced, and listed on the slab's cut-list.
  await page.getByRole('tab', { name: 'Scene' }).click();
  await page.getByRole('list', { name: 'Objects' }).getByText('Base unit B1').click();
  await page.locator('.right').getByLabel('Worktop cut-out').selectOption('sink');
  await page.getByRole('tab', { name: 'Quote' }).click();
  await page.getByRole('tab', { name: 'Workshop BOM' }).click();
  await expect(page.getByTestId('worktop-cut')).toContainText('sink');
  await expect(page.locator('.sheet')).toContainText('Worktop cut-outs');
});
