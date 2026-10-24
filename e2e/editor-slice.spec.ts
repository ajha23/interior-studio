import { expect, test, type Page } from '@playwright/test';
import { mm, newBaseCabinet, type BaseCabinetItem, type Project } from '../packages/core/src/index';
import { MockBackend, PROJECT_ID, seedProject } from './backend';

const CAB_ID = 'bc-e2e-1';

function kitchenSeed(): Project {
  return seedProject((p) => {
    // A free-standing 600 mm door unit in the bedroom-sized sample room.
    const cab = newBaseCabinet(mm(1800), mm(1600));
    cab.id = CAB_ID;
    cab.name = 'Base cabinet B1';
    p.furniture.push(cab);
  });
}

const cabIn = (p: Project) => p.furniture.find((f) => f.id === CAB_ID) as BaseCabinetItem;

async function open(page: Page, be: MockBackend) {
  await be.install(page);
  await page.goto(`/p/${PROJECT_ID}`);
  await expect(page.locator('.editor-root')).toBeVisible();
  await expect(page.getByText('Saved · v1')).toBeVisible();
}

async function selectCabinet(page: Page) {
  await page.getByRole('tab', { name: 'Scene' }).click();
  await page.getByRole('list', { name: 'Objects' }).getByText('Base cabinet B1').click();
  await expect(page.locator('.right .prop-head strong')).toHaveText('Base cabinet B1');
}

/** Width of the cabinet's regenerated 3D geometry, from the live three.js scene (metres → mm). */
async function width3d(page: Page): Promise<number> {
  return page.evaluate((id) => {
    const w = window as unknown as { __studio: { liveView: { current: { scene: { getObjectByName(n: string): { children: { position: { x: number }; geometry?: { parameters?: { width?: number } } }[] } | undefined } } | null } } };
    const g = w.__studio.liveView.current?.scene.getObjectByName(id);
    if (!g) return -1;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of g.children) {
      const bw = c.geometry?.parameters?.width;
      if (bw === undefined) continue;
      lo = Math.min(lo, c.position.x - bw / 2);
      hi = Math.max(hi, c.position.x + bw / 2);
    }
    return Math.round((hi - lo) * 1000);
  }, CAB_ID);
}

async function command(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Describe a change' });
  await input.fill(text);
  await input.press('Enter');
}

test.describe('editor vertical slice', () => {
  test('natural-language command resizes the selected base cabinet, regenerates geometry, persists, rejects invalid values and undoes', async ({ page }) => {
    const be = new MockBackend(kitchenSeed());
    await open(page, be);
    await selectCabinet(page);
    await expect(page.getByTestId('furn-width')).toHaveValue('600');
    await expect.poll(() => width3d(page)).toBe(600);

    await command(page, 'Change the selected base cabinet width to 900 mm.');
    const done = page.getByTestId('cmd-entry').last();
    await expect(done).toHaveClass(/done/);
    await expect(done).toContainText('width 900 mm');
    await expect(done).toContainText('2 doors');
    // Inspector, plan label and 3D geometry all reflect the regenerated cabinet.
    await expect(page.getByTestId('furn-width')).toHaveValue('900');
    await expect(page.locator('.plan-svg')).toContainText('900 × 580');
    await expect.poll(() => width3d(page)).toBe(900);
    await page.screenshot({ path: 'test-results/command-applied.png' });

    // Autosave persists the parametric change as a new cloud version.
    await expect.poll(() => be.versions.length, { timeout: 10_000 }).toBe(2);
    expect(be.latest.kind).toBe('autosave');
    expect(cabIn(be.latest.scene).params.widthUm).toBe(mm(900));
    expect(cabIn(be.latest.scene).params.doorCount).toBe(2);
    await expect(page.getByText('Saved · v2')).toBeVisible();

    // An out-of-range value is rejected and the previous valid state is kept.
    await command(page, 'set the width to 1500 mm');
    const rejected = page.getByTestId('cmd-entry').last();
    await expect(rejected).toHaveClass(/rejected/);
    await expect(rejected).toContainText('Width must be between 150 and 1,200 mm');
    await expect(page.getByTestId('furn-width')).toHaveValue('900');
    expect(await width3d(page)).toBe(900);
    await page.screenshot({ path: 'test-results/command-rejected.png' });
    await page.waitForTimeout(3500);
    expect(be.versions.length).toBe(2);

    // Asking a base-cabinet command of the wrong kind is rejected too.
    await page.getByRole('list', { name: 'Objects' }).getByText('Wardrobe').click();
    await command(page, 'Change the selected base cabinet width to 700 mm');
    await expect(page.getByTestId('cmd-entry').last()).toContainText('not a base cabinet');

    // Undo restores the previous width everywhere and saves it.
    await selectCabinet(page);
    await page.locator('.topbar').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('furn-width')).toHaveValue('600');
    await expect.poll(() => width3d(page)).toBe(600);
    await expect.poll(() => be.versions.length, { timeout: 10_000 }).toBe(3);
    expect(cabIn(be.latest.scene).params.widthUm).toBe(mm(600));

    // Redo, then reload: the editor opens the persisted state.
    await page.locator('.topbar').getByRole('button', { name: 'Redo' }).click();
    await expect.poll(() => be.versions.length, { timeout: 10_000 }).toBe(4);
    await page.reload();
    await expect(page.getByText('Saved · v4')).toBeVisible();
    await selectCabinet(page);
    await expect(page.getByTestId('furn-width')).toHaveValue('900');
  });

  test('inspector edits go through the same validation; materials and construction regenerate the cabinet', async ({ page }) => {
    const be = new MockBackend(kitchenSeed());
    await open(page, be);
    await selectCabinet(page);

    const width = page.getByTestId('furn-width');
    await width.fill('1300');
    await width.press('Enter');
    await expect(page.locator('.right .field-error').first()).toContainText('between 150 and 1200');
    await expect(width).toHaveValue('600');

    await width.fill('750');
    await width.press('Enter');
    await expect(width).toHaveValue('750');
    await expect.poll(() => width3d(page)).toBe(750);

    await page.getByRole('combobox', { name: 'Front' }).or(page.locator('.right select').first()).selectOption('drawers');
    await expect(page.locator('.right')).toContainText('Drawers');
    await page.getByRole('button', { name: 'Worktop White quartz' }).click();
    await page.getByRole('button', { name: 'Fronts Walnut laminate' }).click();

    await expect.poll(() => (be.versions.length > 1 ? cabIn(be.latest.scene) : null)?.materials.worktop, { timeout: 10_000 }).toBe('quartz-white');
    const saved = cabIn(be.latest.scene);
    expect(saved.params.widthUm).toBe(mm(750));
    expect(saved.params.front).toBe('drawers');
    expect(saved.materials.shutter).toBe('walnut');

    // Natural-language material and count changes in one request = one undo step.
    await command(page, 'use 4 drawers and make the worktop black galaxy granite');
    await expect(page.getByTestId('cmd-entry').last()).toHaveClass(/done/);
    await expect.poll(() => cabIn(be.latest.scene).params.drawerCount, { timeout: 10_000 }).toBe(4);
    expect(cabIn(be.latest.scene).materials.worktop).toBe('granite-black');
    await page.locator('.topbar').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => cabIn(be.latest.scene).params.drawerCount, { timeout: 10_000 }).toBe(3);
    expect(cabIn(be.latest.scene).materials.worktop).toBe('quartz-white');
  });

  test('requests the parser cannot handle go to the AI planner, and its tool calls are validated before applying', async ({ page }) => {
    const be = new MockBackend(kitchenSeed());
    let reply: unknown = { calls: [{ tool: 'set_dimension', args: { target: 'selected', dimension: 'width', valueMm: 450 } }], reply: null };
    be.aiCommandReply = () => reply;
    await open(page, be);
    await selectCabinet(page);

    await command(page, 'make it fit the dishwasher gap next to the sink');
    await expect(page.getByTestId('cmd-entry').last()).toHaveClass(/done/);
    await expect(page.getByTestId('furn-width')).toHaveValue('450');
    const call = be.aiCommandCalls[0] as { text: string; context: { selectedId: string }; tools: { name: string }[] };
    expect(call.text).toContain('dishwasher');
    expect(call.context.selectedId).toBe(CAB_ID);
    expect(call.tools.map((t) => t.name)).toContain('set_dimension');

    // A model proposing an invalid value or an unknown tool changes nothing.
    reply = { calls: [{ tool: 'set_dimension', args: { dimension: 'width', valueMm: 5000 } }], reply: null };
    await command(page, 'make it as wide as the wall please');
    await expect(page.getByTestId('cmd-entry').last()).toHaveClass(/rejected/);
    reply = { calls: [{ tool: 'drop_table', args: {} }], reply: null };
    await command(page, 'do something clever with it');
    await expect(page.getByTestId('cmd-entry').last()).toContainText('Unknown action');
    await expect(page.getByTestId('furn-width')).toHaveValue('450');
  });

  test('workspace keeps existing features: tool rail, add panel, drawings and views', async ({ page }) => {
    const be = new MockBackend(kitchenSeed());
    await open(page, be);

    // Add a drawer unit from the Add panel; it lands against a wall and is selected.
    await page.getByRole('button', { name: /Drawer unit/ }).click();
    await expect(page.locator('.right .prop-head strong')).toHaveText('Drawer base unit');
    await expect.poll(() => be.latest.scene.furniture.some((f) => f.name === 'Drawer base unit'), { timeout: 10_000 }).toBe(true);

    // Tool rail: drawing tools activate and bring the plan into view from 3D.
    await page.getByRole('tab', { name: '3D' }).click();
    await page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Wall' }).click();
    await expect(page.getByRole('tab', { name: 'Split' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Wall' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');

    // Drawings include the base cabinets' elevations and cut lists.
    await page.getByRole('tab', { name: 'Drawings' }).click();
    await expect(page.locator('.main')).toContainText('Base cabinet B1');
    await expect(page.locator('.main')).toContainText('Worktop');

    // Overflow menu still exposes history, export and import.
    await page.getByRole('tab', { name: 'Split' }).click();
    await page.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Version history' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Export project file/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/workspace.png' });
    await page.keyboard.press('Escape');

    // Side panels still open from the top bar.
    await page.locator('.topbar').getByRole('button', { name: 'AI studio' }).click();
    await expect(page.getByRole('complementary', { name: 'AI studio' })).toBeVisible();
    await page.locator('.topbar').getByRole('button', { name: 'Render' }).click();
    await expect(page.getByRole('complementary', { name: 'Renders' })).toBeVisible();
  });
});
