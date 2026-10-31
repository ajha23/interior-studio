import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 3 acceptance with a scripted speech engine standing in for the browser's (no microphone,
 * no network). `window.__voice` drives the latest recognition session; spoken replies are recorded.
 */
const FAKE_SPEECH = () => {
  type Handler<T> = ((e: T) => void) | null;
  class FakeRecognition {
    lang = '';
    continuous = true;
    interimResults = false;
    maxAlternatives = 1;
    onstart: Handler<Event> = null;
    onresult: Handler<unknown> = null;
    onerror: Handler<{ error: string }> = null;
    onend: Handler<Event> = null;
    constructor() {
      (globalThis as unknown as { __voice: unknown }).__voice = this;
    }
    start() {}
    stop() {
      this.onend?.(new Event('end'));
    }
    abort() {
      this.onend?.(new Event('end'));
    }
  }
  const w = globalThis as unknown as Record<string, unknown>;
  // Chromium has both the standard and the prefixed constructor; replace both.
  w.SpeechRecognition = FakeRecognition;
  w.webkitSpeechRecognition = FakeRecognition;
  w.__spoken = [] as string[];
  const synth = {
    speaking: false,
    speak(u: { text: string; onend?: () => void }) {
      (w.__spoken as string[]).push(u.text);
      setTimeout(() => u.onend?.(), 0);
    },
    cancel() {},
  };
  Object.defineProperty(globalThis, 'speechSynthesis', { value: synth, configurable: true });
};

async function newProject(page: Page) {
  await page.goto('/');
  await page.getByLabel('Project name').fill('Voice kitchen');
  await page.getByText('Empty room', { exact: true }).click();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Split' }).click();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
}

const status = (page: Page) => page.getByTestId('voice-status');
const rec = (page: Page, script: string) => page.evaluate(script);
const result = (text: string, final: boolean) => `window.__voice.onresult({ results: [Object.assign([{ transcript: ${JSON.stringify(text)}, confidence: 0.9 }], { isFinal: ${final} })] })`;

async function speak(page: Page, text: string) {
  await page.getByRole('button', { name: 'Speak a request' }).click();
  await expect(status(page)).toHaveText('Waiting for microphone permission…');
  await rec(page, 'window.__voice.onstart()');
  await expect(status(page)).toHaveText('Listening…');
  await rec(page, result(text.split(' ').slice(0, 3).join(' '), false));
  await expect(page.getByTestId('voice-interim')).toHaveText(text.split(' ').slice(0, 3).join(' '));
  await rec(page, result(text, true));
  await rec(page, result(text, true)); // a duplicate final from the engine
  await rec(page, 'window.__voice.onend()');
}

test('Phase 3: speak a change, see it as text, preview, say “apply”, and undo by voice', async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH);
  await newProject(page);
  const plan = page.locator('[data-testid^="plan-element-"]');

  await speak(page, 'create a nine hundred millimetre base cabinet');
  await expect(page.getByTestId('user-message')).toHaveCount(1);
  await expect(page.getByTestId('user-message')).toHaveText('create a 900 mm base cabinet');
  await expect(page.getByTestId('user-message')).toHaveAttribute('data-source', 'voice');
  await expect(page.getByTestId('change-preview').last().getByTestId('proposal-status')).toHaveText('Validated · awaiting approval');
  await expect(status(page)).toHaveText('Change ready: say “apply” or “reject”');
  await expect(plan).toHaveCount(0);
  expect(await page.evaluate('window.__spoken.at(-1)')).toMatch(/^The change is ready to preview/);

  await speak(page, 'apply');
  await expect(page.getByTestId('change-preview').last().getByTestId('proposal-status')).toHaveText('Applied');
  await expect(plan).toHaveCount(1);
  await expect(page.getByTestId('inspector-width')).toHaveAttribute('data-mm', '900');
  await expect(page.locator('canvas[data-rendered]')).toBeVisible();

  await speak(page, 'make it two foot six high');
  await expect(page.getByTestId('change-preview').last()).toContainText('→ 900 mm × 762 mm × 560 mm');
  await speak(page, 'apply');
  await expect(page.getByTestId('inspector-height')).toHaveAttribute('data-mm', '762');

  await speak(page, 'undo that last change');
  await expect(page.getByTestId('assistant-history').last()).toContainText('Undid:');
  await expect(page.getByTestId('inspector-height')).toHaveAttribute('data-mm', '720');

  // Mute spoken replies.
  await page.getByRole('button', { name: 'Mute spoken replies' }).click();
  const before = await page.evaluate('window.__spoken.length');
  await speak(page, 'show me the dimensions of this room');
  await expect(page.getByTestId('assistant-answer').last()).toContainText('room size');
  expect(await page.evaluate('window.__spoken.length')).toBe(before);
});

test('a blocked microphone is explained and typing still works', async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH);
  await newProject(page);
  await page.getByRole('button', { name: 'Speak a request' }).click();
  await rec(page, "window.__voice.onerror({ error: 'not-allowed' })");
  await expect(page.getByTestId('voice-error')).toContainText('Microphone access is blocked');
  const box = page.getByLabel('Message the design assistant');
  await box.fill('Create a 900 mm base cabinet');
  await box.press('Enter');
  await expect(page.getByTestId('change-preview')).toHaveCount(1);
});

test('browsers without speech recognition get text-only operation', async ({ page }) => {
  await page.addInitScript(() => {
    const w = globalThis as unknown as Record<string, unknown>;
    delete w.webkitSpeechRecognition;
    delete w.SpeechRecognition;
  });
  await newProject(page);
  await expect(page.getByRole('button', { name: 'Voice input is not supported in this browser' })).toBeDisabled();
  const box = page.getByLabel('Message the design assistant');
  await box.fill('Show me all cabinet dimensions');
  await box.press('Enter');
  await expect(page.getByTestId('assistant-answer')).toBeVisible();
});
