import { expect, test, type Page } from '@playwright/test';
import { blankProject, mm, singleRoomPlan, type KitchenItem, type Opening, type Project } from '../packages/core/src/index';
import { MockBackend, PROJECT_ID } from './backend';

/** An empty 3000 × 2400 kitchen: a window over the counter on wall 1 (north), a door on wall 2 (east). */
function emptyKitchen(): Project {
  const p = blankProject('E2E Kitchen run', 'Sharma family');
  const { plan, walls } = singleRoomPlan('Kitchen', mm(3000), mm(2400));
  const [north, east] = walls;
  const h = mm(115);
  const win: Opening = { id: 'win-1', kind: 'window', wallId: north.id, offsetUm: h + mm(900), widthUm: mm(1200), heightUm: mm(1200), sillUm: mm(1000), hinge: 'start', side: 1 };
  const door: Opening = { id: 'door-1', kind: 'door', wallId: east.id, offsetUm: h + mm(1300), widthUm: mm(900), heightUm: mm(2100), sillUm: 0, hinge: 'start', side: 1 };
  return { ...p, plan, openings: [win, door], furniture: [] };
}

const kitchenItems = (p: Project, kind: KitchenItem['kind']) => p.furniture.filter((f) => f.kind === kind) as KitchenItem[];

async function clickWall(page: Page, index: number, be: MockBackend) {
  const id = be.latest.scene.plan.walls[index].id;
  const wall = page.locator(`.plan-svg [data-wid="${id}"]`);
  const box = (await wall.boundingBox())!;
  // Near the start of the wall, clear of the window in the middle.
  const horizontal = box.width > box.height;
  await wall.click({ position: horizontal ? { x: 30, y: box.height / 2 } : { x: box.width / 2, y: 30 } });
  await expect(page.locator('.right')).toContainText('Kitchen run');
}

async function command(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Describe a change' });
  await input.fill(text);
  await input.press('Enter');
}

test('kitchen run: fill a wall with base and wall units, edit and validate them, persist everything', async ({ page }) => {
  const be = new MockBackend(emptyKitchen());
  await be.install(page);
  await page.goto(`/p/${PROJECT_ID}`);
  await expect(page.getByText('Saved · v1')).toBeVisible();

  // Base units along wall 1: the window sill is above the counter, so the run passes under it.
  await clickWall(page, 0, be);
  await page.locator('.right').getByRole('button', { name: 'Base units' }).click();
  await expect(page.locator('.right .run-msg')).toContainText('Added 4 base units on wall 1: 600 + 600 + 900 + 900 mm, with 1 blind-corner unit');
  await expect.poll(() => kitchenItems(be.latest.scene, 'basecabinet').length, { timeout: 10_000 }).toBe(4);
  expect(kitchenItems(be.latest.scene, 'basecabinet').reduce((s, b) => s + b.params.widthUm, 0)).toBe(mm(3000));
  // The east end meets the clear east wall, so the last unit is a blind-corner unit (panel toward the corner).
  const corner = kitchenItems(be.latest.scene, 'basecabinet').find((b) => b.name === 'Corner unit B4')!;
  expect(corner.params).toMatchObject({ blindUm: mm(600), blindSide: 'right', doorCount: 1 });

  // Wall units stop at the window: two 900 mm units either side of it.
  await clickWall(page, 0, be);
  await page.locator('.right').getByRole('button', { name: 'Wall units' }).click();
  await expect(page.locator('.right .run-msg')).toContainText('Added 2 wall units on wall 1: 900 + 900 mm');
  await expect.poll(() => kitchenItems(be.latest.scene, 'wallcabinet').length, { timeout: 10_000 }).toBe(2);
  await expect(page.locator('.status-issues')).toContainText('0 errors');

  // Every unit exists as real geometry in the 3D scene.
  const ids = be.latest.scene.furniture.map((f) => f.id);
  await expect
    .poll(() => page.evaluate((list) => {
      const w = window as unknown as { __studio: { liveView: { current: { scene: { getObjectByName(n: string): unknown } } | null } } };
      return list.filter((id) => w.__studio.liveView.current?.scene.getObjectByName(id)).length;
    }, ids))
    .toBe(6);

  // A wall unit above base B1 would collide with wall unit W1: refused, nothing added.
  await page.getByRole('tab', { name: 'Scene' }).click();
  const objects = page.getByRole('list', { name: 'Objects' });
  await objects.getByText('Base unit B1').click();
  await command(page, 'add a wall cabinet above it');
  await expect(page.getByTestId('cmd-entry').last()).toHaveClass(/rejected/);
  await expect(page.getByTestId('cmd-entry').last()).toContainText('overlap');
  await page.waitForTimeout(3000);
  expect(kitchenItems(be.latest.scene, 'wallcabinet').length).toBe(2);

  // Wall-unit mount height through natural language: out of range is refused, in range applies.
  await objects.getByText('Wall unit W1').click();
  await expect(page.locator('.right .prop-head strong')).toHaveText('Wall unit W1');
  await command(page, 'set the wall cabinet mount height to 2500');
  await expect(page.getByTestId('cmd-entry').last()).toContainText('Mount height must be between 1,200 and 2,200 mm');
  await command(page, 'set the wall cabinet mount height to 1500');
  await expect(page.getByTestId('cmd-entry').last()).toHaveClass(/done/);
  await expect(page.getByTestId('furn-mount_height')).toHaveValue('1500');
  await expect.poll(() => kitchenItems(be.latest.scene, 'wallcabinet').find((w) => w.name === 'Wall unit W1')?.params, { timeout: 10_000 }).toMatchObject({ mountHeightUm: mm(1500) });

  // The inspector's front selector switches the unit to a lift-up flap (one validated tool call).
  await page.locator('.right select').first().selectOption('flap');
  await expect(page.locator('.right')).toContainText('Lift-up flap');
  await expect.poll(() => (kitchenItems(be.latest.scene, 'wallcabinet').find((w) => w.name === 'Wall unit W1')?.params as { front?: string })?.front, { timeout: 10_000 }).toBe('flap');
  await page.screenshot({ path: 'test-results/kitchen-run.png' });

  // The corner unit's inspector shows the blind panel; it can be turned back into an ordinary unit.
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByRole('tab', { name: 'Scene' }).click();
  await objects.getByText('Corner unit B4').click();
  await expect(page.getByTestId('furn-blind')).toHaveValue('600');
  await expect(page.locator('.right').getByLabel('Corner')).toHaveValue('right');
  await command(page, 'set the base cabinet width to 800');
  await expect(page.getByTestId('cmd-entry').last()).toContainText('300 mm of open door');
  await expect(page.getByTestId('furn-width')).toHaveValue('900');

  // Drawings carry sheets for the new units.
  await page.getByRole('tab', { name: 'Drawings' }).click();
  await expect(page.locator('.main')).toContainText('Wall unit W1');
  await expect(page.locator('.main')).toContainText('Corner unit B4');
});
