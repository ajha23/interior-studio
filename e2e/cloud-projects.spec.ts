// Spec 043: studio projects saved to the database (local Supabase stack).
// US1: listed, created, opened on another device, renamed, archived, deleted; device projects kept apart.
// US2: autosave and Save version; viewers are view-only and never save.
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { localAccessToken, localSelect } from './support/localAdmin';

test.use({ storageState: { cookies: [], origins: [] } });

const saved = (page: Page) => expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });

async function signInAs(page: Page, email: string, hash = '#/s/alpha/projects') {
  await page.goto(`/${hash}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
}

/** Another browser (a laptop and a phone): a fresh context, signed in as the same person. */
async function otherDevice(browser: Browser, email: string, hash?: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAs(page, email, hash);
  return { context, page };
}

async function createKitchen(page: Page, name: string) {
  await expect(page.getByRole('heading', { name: 'Alpha Studio projects' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/#\/s\/alpha\/p\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('viewport-3d').locator('canvas')).toBeVisible();
  return new URL(page.url()).hash.split('/').pop()!;
}

async function widenFirstBase(page: Page, width: string) {
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 600', exact: true }).first().click();
  const field = page.getByTestId('inspector-width');
  await field.fill(width);
  await field.press('Enter');
  await expect(field).toHaveValue(width);
}

const card = (page: Page, name: string) => page.getByTestId('studio-project').filter({ has: page.getByRole('heading', { name, exact: true }) });

test.describe('US1: my projects are in my studio', () => {
  test('a project made in one browser opens, identical, in another', async ({ page, browser }) => {
    const name = `Cloud kitchen ${Date.now()}`;
    await signInAs(page, 'designer.a@example.test');
    const id = await createKitchen(page, name);
    await widenFirstBase(page, '900');
    await saved(page);

    const phone = await otherDevice(browser, 'designer.a@example.test');
    await expect(card(phone.page, name)).toContainText('by Alpha Designer');
    await expect(card(phone.page, name)).toContainText('Kitchen');
    await card(phone.page, name).getByRole('button', { name: `Open ${name}` }).click();
    await expect(phone.page).toHaveURL(new RegExp(`#/s/alpha/p/${id}$`));
    await phone.page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(phone.page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 900', exact: true })).toBeVisible();
    await phone.context.close();
  });

  test('rename and archive persist; archived projects are hidden until shown; only admins delete, and only archived ones', async ({ page, browser }) => {
    const name = `Archive me ${Date.now()}`;
    await signInAs(page, 'designer.a@example.test');
    await createKitchen(page, name);
    await page.getByRole('button', { name: 'All projects' }).click();

    await card(page, name).getByRole('button', { name: `Rename ${name}` }).click();
    await page.getByLabel('New name').fill(`${name} v2`);
    await page.getByLabel('New name').press('Enter');
    await page.reload();
    const renamed = `${name} v2`;
    await expect(card(page, renamed)).toBeVisible({ timeout: 30_000 });

    await card(page, renamed).getByRole('button', { name: `Archive ${renamed}` }).click();
    await expect(card(page, renamed)).toHaveCount(0);
    await page.getByLabel(/Show archived/).check();
    await expect(card(page, renamed)).toContainText('Archived');
    // A designer cannot delete; the control is not offered.
    await expect(card(page, renamed).getByRole('button', { name: `Delete ${renamed}` })).toHaveCount(0);

    const admin = await otherDevice(browser, 'admin.a@example.test');
    await admin.page.getByLabel(/Show archived/).check({ timeout: 30_000 });
    await card(admin.page, renamed).getByRole('button', { name: `Delete ${renamed}` }).click();
    const confirm = admin.page.getByRole('button', { name: 'Delete for everyone' });
    await expect(confirm).toBeDisabled();
    await admin.page.getByLabel('Project name to delete').fill(renamed);
    await confirm.click();
    await expect(card(admin.page, renamed)).toHaveCount(0);
    await admin.page.reload();
    await admin.page.getByLabel(/Show archived/).check({ timeout: 30_000 });
    await expect(card(admin.page, renamed)).toHaveCount(0);
    await admin.context.close();
  });

  test('unarchive brings a project back', async ({ page }) => {
    const name = `Unarchive me ${Date.now()}`;
    await signInAs(page, 'designer.a@example.test');
    await createKitchen(page, name);
    await page.getByRole('button', { name: 'All projects' }).click();
    await card(page, name).getByRole('button', { name: `Archive ${name}` }).click();
    await page.getByLabel(/Show archived/).check();
    await card(page, name).getByRole('button', { name: `Unarchive ${name}` }).click();
    await page.getByLabel(/Show archived/).uncheck();
    await expect(card(page, name)).not.toContainText('Archived');
  });

  test('a home is one studio document: room changes save with the home and open on another device (FR-014)', async ({ page, browser }) => {
    await signInAs(page, 'designer.a@example.test');
    await expect(page.getByRole('heading', { name: 'Alpha Studio projects' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Design home' }).click();
    await expect(page).toHaveURL(/#\/s\/alpha\/h\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByTestId('home-view')).toBeVisible();
    const homeId = new URL(page.url()).hash.split('/').pop()!;
    const guest = `Guest ${Date.now()}`;
    await page.getByTestId('room-list-item').filter({ hasText: 'Bedroom 2' }).click();
    await page.getByLabel('Room name').fill(guest);
    await page.getByLabel('Room name').blur();
    await page.getByTestId('open-room').click();
    await expect(page).toHaveURL(new RegExp(`#/s/alpha/h/${homeId}/room/[A-Za-z0-9_-]+$`));
    await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
    await saved(page);

    const token = await localAccessToken('designer.a@example.test');
    const [head] = await localSelect<{ doc_type: string; version_no: number; scene: { rooms: { name: string }[] } }>(
      token,
      `project_versions?project_id=eq.${homeId}&select=doc_type,version_no,scene&order=version_no.desc&limit=1`,
    );
    expect(head).toMatchObject({ doc_type: 'home' });
    expect(head!.scene.rooms.map((r) => r.name)).toContain(guest);

    const other = await otherDevice(browser, 'designer.a@example.test', `#/s/alpha/h/${homeId}`);
    await expect(other.page.getByTestId('room-list-item').filter({ hasText: guest })).toHaveCount(1, { timeout: 30_000 });
    await other.context.close();
  });

  test('another studio cannot open it, and an old-format project does not open', async ({ page, browser }) => {
    await signInAs(page, 'designer.a@example.test');
    const id = await createKitchen(page, `Private ${Date.now()}`);
    const beta = await otherDevice(browser, 'designer.b@example.test', `#/s/beta/p/${id}`);
    await expect(beta.page.getByRole('alert')).toHaveText("This project isn't in this studio.", { timeout: 30_000 });
    await beta.context.close();

    await page.getByRole('button', { name: 'All projects' }).click();
    await expect(card(page, 'Alpha Kitchen')).toContainText('Older format: opens after the import update.');
    await expect(card(page, 'Alpha Kitchen').getByRole('button', { name: 'Open Alpha Kitchen' })).toHaveCount(0);
  });

  test('projects saved only in this browser are listed under "On this device" and open there', async ({ page }) => {
    await signInAs(page, 'designer.a@example.test');
    await expect(page.getByRole('heading', { name: 'Alpha Studio projects' })).toBeVisible({ timeout: 30_000 });
    const file = readFileSync('e2e/fixtures/l-kitchen-12x10.kitchen.json', 'utf8');
    const { project } = JSON.parse(file) as { project: { id: string; name: string; room: { width: number; length: number; height: number } } };
    // Written straight into the device store, as a project saved before spec 043 would be.
    const record = { id: project.id, name: project.name, updatedAt: new Date().toISOString(), room: project.room, elementCount: 1, file };
    await page.evaluate(`new Promise((resolve, reject) => {
      const req = indexedDB.open('interior-studio');
      req.onsuccess = () => {
        const tx = req.result.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(${JSON.stringify(record)});
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    })`);
    await page.reload();
    const device = page.getByRole('heading', { name: 'On this device' });
    await expect(device).toBeVisible({ timeout: 30_000 });
    await page.getByRole('region', { name: 'On this device' }).getByRole('button', { name: `Open ${project.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`#/project/${project.id}$`));
    await expect(page.getByTestId('save-state')).toHaveText('Saved');
  });
});

test.describe('US2: autosave with a clear status', () => {
  test('an edit autosaves; Save version adds a manual version with its message', async ({ page }) => {
    await signInAs(page, 'designer.a@example.test');
    const id = await createKitchen(page, `Autosave ${Date.now()}`);
    await widenFirstBase(page, '800');
    await expect(page.locator('[data-save-status="saving"]')).toBeVisible();
    await saved(page);

    await page.getByRole('button', { name: 'Save version…' }).click();
    await page.getByLabel('Version message').fill('client review');
    await page.getByRole('button', { name: 'Save version', exact: true }).click();
    await saved(page);

    const token = await localAccessToken('designer.a@example.test');
    const versions = await localSelect<{ version_no: number; kind: string; message: string }>(token, `project_versions?project_id=eq.${id}&select=version_no,kind,message&order=version_no`);
    expect(versions.map((v) => v.kind)).toEqual(['manual', 'autosave', 'manual']);
    expect(versions.at(-1)).toMatchObject({ message: 'client review' });

    await page.reload();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 800', exact: true })).toBeVisible({ timeout: 30_000 });

    // The design is saved to the studio; its client packages and photos stay on this device (spec 043).
    await page.getByRole('button', { name: 'Deliverables' }).click();
    await page.getByRole('navigation', { name: 'Sheets' }).getByRole('button', { name: /Client package/ }).click();
    await expect(page.getByText('Packages and photos are on this device only')).toBeVisible();
  });

  test('a viewer opens a studio project view-only and never saves', async ({ page }) => {
    const saves: string[] = [];
    page.on('request', (r) => r.url().includes('/rest/v1/rpc/save_project_version') && saves.push(r.url()));
    await signInAs(page, 'viewer.a@example.test');
    await expect(page.getByRole('heading', { name: 'Alpha Studio projects' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Create project' })).toBeDisabled();
    await card(page, 'Alpha Cloud Kitchen').getByRole('button', { name: 'Open Alpha Cloud Kitchen' }).click();
    await expect(page.getByText('View only')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 600', exact: true }).first().click();
    const field = page.getByTestId('inspector-width');
    await field.fill('900');
    await field.press('Enter');
    await expect(page.getByText('View only: ask a studio owner for edit access.').first()).toBeVisible();
    await expect(page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 900', exact: true })).toHaveCount(0);
    await page.waitForTimeout(2_500);
    expect(saves).toEqual([]);
  });
});

test.describe('US3: never lose a concurrent edit', () => {
  test('two tabs: the second save conflicts; Save mine on top keeps both versions', async ({ page }) => {
    await signInAs(page, 'designer.a@example.test');
    const id = await createKitchen(page, `Conflict ${Date.now()}`);
    const tab2 = await page.context().newPage();
    await tab2.goto(`/#/s/alpha/p/${id}`);
    await expect(tab2.getByTestId('viewport-3d').locator('canvas')).toBeVisible({ timeout: 30_000 });

    await widenFirstBase(page, '900'); // tab 1 saves version 2
    await saved(page);
    await widenFirstBase(tab2, '800'); // tab 2 still expects version 1
    await expect(tab2.getByRole('dialog', { name: 'Someone else saved this project' })).toBeVisible({ timeout: 15_000 });
    await expect(tab2.getByTestId('conflict-who')).toContainText('Alpha Designer saved version 2');
    await tab2.getByRole('button', { name: 'Save mine on top' }).click();
    await saved(tab2);

    const token = await localAccessToken('designer.a@example.test');
    const versions = await localSelect<{ version_no: number }>(token, `project_versions?project_id=eq.${id}&select=version_no&order=version_no`);
    expect(versions.map((v) => v.version_no)).toEqual([1, 2, 3]);
    await tab2.close();
  });

  test('Load theirs opens the other version after confirming', async ({ page }) => {
    await signInAs(page, 'designer.a@example.test');
    const id = await createKitchen(page, `Theirs ${Date.now()}`);
    const tab2 = await page.context().newPage();
    await tab2.goto(`/#/s/alpha/p/${id}`);
    await expect(tab2.getByTestId('viewport-3d').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await widenFirstBase(page, '900');
    await saved(page);
    await widenFirstBase(tab2, '800');
    await expect(tab2.getByRole('dialog', { name: 'Someone else saved this project' })).toBeVisible({ timeout: 15_000 });
    tab2.once('dialog', (d) => void d.accept());
    await tab2.getByRole('button', { name: 'Load theirs' }).click();
    await saved(tab2);
    await expect(tab2.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 900', exact: true })).toBeVisible();
    await tab2.close();
  });
});

test.describe('US4: keep working offline', () => {
  test('three edits offline are sent in order on reconnect; offline, the project opens from this device', async ({ page, context }) => {
    await signInAs(page, 'designer.a@example.test');
    const name = `Offline ${Date.now()}`;
    const id = await createKitchen(page, name);
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await context.setOffline(true);
    for (const w of ['700', '800', '900']) {
      const current = await page.getByTestId('plan-view').getByRole('button', { name: /^Base cabinet \d+$/ }).first().getAttribute('aria-label');
      await page.getByTestId('plan-view').getByRole('button', { name: current!, exact: true }).first().click();
      await page.getByTestId('inspector-width').fill(w);
      await page.getByTestId('inspector-width').press('Enter');
      await page.waitForTimeout(2_600);
    }
    await expect(page.getByRole('status').filter({ hasText: 'Offline (queued 3)' })).toBeVisible();

    await context.setOffline(false);
    await saved(page);
    const token = await localAccessToken('designer.a@example.test');
    const versions = await localSelect<{ version_no: number; kind: string }>(token, `project_versions?project_id=eq.${id}&select=version_no,kind&order=version_no`);
    expect(versions.map((v) => v.version_no)).toEqual([1, 2, 3, 4]);

    // Offline again, in the open app (there is no offline app shell yet, so not after a reload):
    // the Projects page and the project open from this device, with the banner (FR-011a).
    await context.setOffline(true);
    await page.getByRole('button', { name: 'All projects' }).click();
    await expect(page.getByText('Offline — showing the copy on this device').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Create project' })).toBeDisabled();
    await card(page, name).getByRole('button', { name: `Open ${name}` }).click();
    await expect(page).toHaveURL(new RegExp(`#/s/alpha/p/${id}$`));
    await expect(page.getByText('Offline — showing the copy on this device').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 900', exact: true })).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('US5: version history', () => {
  test('open an old version read-only, then restore it as a new version', async ({ page }) => {
    await signInAs(page, 'designer.a@example.test');
    const id = await createKitchen(page, `History ${Date.now()}`);
    await widenFirstBase(page, '900');
    await saved(page);

    await page.getByRole('button', { name: 'History' }).click();
    const history = page.getByRole('dialog', { name: 'Version history' });
    await expect(history.getByTestId('version-row')).toHaveCount(2);
    await history.getByRole('button', { name: 'Open version 1' }).click();
    await expect(page.getByTestId('version-banner')).toContainText('Viewing version 1');
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByTestId('plan-view').getByRole('button', { name: 'Base cabinet 600', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save version/ })).toHaveCount(0);

    await page.getByTestId('version-banner').getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByTestId('version-banner')).toHaveCount(0);
    await saved(page);
    const token = await localAccessToken('designer.a@example.test');
    const versions = await localSelect<{ version_no: number; kind: string; message: string }>(token, `project_versions?project_id=eq.${id}&select=version_no,kind,message&order=version_no`);
    expect(versions.map((v) => [v.version_no, v.kind])).toEqual([
      [1, 'manual'],
      [2, 'autosave'],
      [3, 'restore'],
    ]);
    expect(versions[2]!.message).toBe('Restored version 1');
  });
});
