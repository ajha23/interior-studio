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

test('choose a Gemini or ChatGPT reply voice; without a server key the browser voice speaks and says why', async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH);
  await newProject(page);
  await page.getByRole('button', { name: 'Assistant settings' }).click();

  const source = page.getByLabel('Reply voice source');
  const voice = page.getByLabel('Voice', { exact: true });
  await expect(source).toHaveValue('gemini');
  await expect(voice).toHaveValue('Kore');
  await expect(voice.locator('option')).toHaveCount(30);
  await expect(voice.locator('option').first()).toHaveText('Kore — Firm');
  await expect(page.getByTestId('voice-not-configured')).toContainText('GEMINI_API_KEY');

  await source.selectOption('openai');
  await expect(voice).toHaveValue('marin');
  await expect(voice.locator('option')).toHaveCount(10);
  await voice.selectOption('cedar');

  // The test server has no OpenAI key: the preview is spoken by the browser and the reason is shown.
  await page.getByRole('button', { name: 'Preview voice' }).click();
  await expect(page.getByTestId('voice-fallback-notice')).toContainText('OPENAI_API_KEY');
  await expect.poll(() => page.evaluate('window.__spoken.length')).toBe(1);

  await source.selectOption('browser');
  await expect(voice).toHaveValue('');
  await expect(page.getByTestId('voice-fallback-notice')).toHaveCount(0);

  // Remembered for next time.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('interior-studio:voice') ?? '{}').replyVoice)).toEqual({ engine: 'browser', voice: '' });
});

test('hands-free conversation: talk, hear the reply, apply by voice, then say goodbye', async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH);
  await newProject(page);
  await page.getByRole('button', { name: 'Start voice conversation' }).click();
  const bar = page.getByTestId('conversation-bar');
  const state = page.getByTestId('conversation-status');
  await expect(bar).toBeVisible();
  await expect(page.getByTestId('mic-button')).toHaveCount(0);
  // The test server has no Gemini key: realtime is unavailable, so the standard loop runs and says why.
  await expect(page.getByTestId('conversation-mode')).toHaveText('Standard');
  await expect(page.getByTestId('conversation-notice')).toContainText('GEMINI_API_KEY');

  /** Speak one utterance into whichever recognition session is listening now. */
  const utter = async (text: string) => {
    await expect(state).toHaveText(/Listening|Speaking/);
    await rec(page, 'window.__voice.onstart()');
    await rec(page, result(text, true));
    await rec(page, 'window.__voice.onend()');
  };

  await utter('create a nine hundred millimetre base cabinet');
  await expect(page.getByTestId('change-preview').last().getByTestId('proposal-status')).toHaveText('Validated · awaiting approval');
  await expect.poll(() => page.evaluate('window.__spoken.at(-1)')).toMatch(/^The change is ready to preview/);
  // After the reply it listens again by itself.
  await expect(state).toHaveText('Voice conversation · Listening');

  await utter('apply');
  await expect(page.getByTestId('change-preview').last().getByTestId('proposal-status')).toHaveText('Applied');
  await expect.poll(() => page.evaluate('window.__spoken.at(-1)')).toBe('The change was applied.');
  await expect(state).toHaveText('Voice conversation · Listening');

  // Hold pauses the microphone; Resume carries on.
  await page.getByRole('button', { name: 'Hold conversation' }).click();
  await expect(state).toHaveText('Voice conversation · On hold');
  await page.getByRole('button', { name: 'Resume conversation' }).click();
  await expect(state).toHaveText('Voice conversation · Listening');

  await utter('okay goodbye');
  await expect(bar).toHaveCount(0);
  await expect(page.getByTestId('conversation-ended')).toHaveText('Voice conversation ended.');
  await expect(page.getByTestId('mic-button')).toBeVisible();
});

test('a voice conversation ends with End', async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH);
  await newProject(page);
  await page.getByRole('button', { name: 'Start voice conversation' }).click();
  await expect(page.getByTestId('conversation-status')).toHaveText('Voice conversation · Listening');
  await page.getByRole('button', { name: 'End conversation' }).click();
  await expect(page.getByTestId('conversation-ended')).toHaveText('Voice conversation ended.');
});
