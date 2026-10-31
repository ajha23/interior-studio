import { expect, test, type Page } from '@playwright/test';

/** Acting in the room through the assistant, reference photos and photoreal renders (no AI key on the test server). */
async function newProject(page: Page) {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Realism');
  await page.getByText('Straight', { exact: true }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('assistant-launcher').click();
}
async function ask(page: Page, text: string) {
  const box = page.getByLabel('Message the design assistant');
  await box.fill(text);
  await box.press('Enter');
  await expect(page.getByTestId('user-message').last()).toContainText(text);
  await expect(page.getByRole('status').filter({ hasText: 'planning' })).toHaveCount(0);
}
// A 4×4 PNG: enough for the browser to decode as a "photo".
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR4nGOYtqoHjhiI4wAA7HIcwUu19VoAAAAASUVORK5CYII=', 'base64');

test('the assistant opens doors, walks to a unit and changes the view, without touching the design', async ({ page }) => {
  await newProject(page);
  await ask(page, 'open the fridge');
  await expect(page.getByTestId('assistant-messages')).toContainText('Opened: Refrigerator');
  await ask(page, 'walk to the sink');
  await expect(page.getByTestId('assistant-messages')).toContainText('Walking to the sink unit');
  await expect(page.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true');
  await ask(page, 'stop walking');
  await ask(page, 'go to plan view');
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Nothing to undo: acting in the room is not an edit.
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
});

test('a reference photo is attached with a preview, and the missing key is explained', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('reference-input').setInputFiles({ name: 'look.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('attachment-strip')).toContainText('1 photo');
  await page.getByLabel('Message the design assistant').fill('Use these finishes');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('message-attachments').locator('img')).toHaveCount(1);
  await expect(page.getByTestId('assistant-messages')).toContainText('GEMINI_API_KEY');
  await expect(page.getByTestId('attachment-strip')).toHaveCount(0);
});

test('Photo opens the photoreal render window, which explains a missing key', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('assistant-launcher').click();
  await page.getByRole('button', { name: 'Render photo' }).click();
  await expect(page.getByTestId('render-dialog')).toBeVisible();
  await expect(page.getByTestId('render-error')).toContainText('GEMINI_API_KEY');
  await expect(page.getByTestId('render-dialog')).toContainText('AI visualisation');
  await page.getByRole('button', { name: 'Close render' }).click();
  await expect(page.getByTestId('render-dialog')).toHaveCount(0);
});
