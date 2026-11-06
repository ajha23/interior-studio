import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

/**
 * The app needs a Supabase project: tests use the local stack (spec 041) with its seeded users.
 * The anon key is read from the environment, or once from `supabase status` so `npm run e2e` works
 * right after `npm run db:start`.
 */
function localAnonKey(): string {
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  try {
    const env = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const key = /^ANON_KEY="?([^"\n]+)"?$/m.exec(env)?.[1];
    if (key) return key;
  } catch {
    // Reported below.
  }
  throw new Error('End-to-end tests need the local Supabase stack. Start it with: npm run db:start');
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SIGNED_IN_STATE = 'playwright/.auth/designer.json';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // CI runners render software WebGL more slowly than a developer machine; allow assertions longer there only.
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [
    // Signs in once as a seeded designer and saves the session for the other tests.
    { name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: SIGNED_IN_STATE,
        viewport: { width: 1440, height: 900 },
        // Chromium's new headless mode, not the default headless shell: on Linux CI runners the headless
        // shell throttles software WebGL to 1–4 frames a second, which starves 3D picking, camera moves
        // and input. New headless renders the same scene at about 14 fps (measured 2026-11-05).
        channel: 'chromium',
        // Software WebGL so the 3D viewport renders on CI machines without a GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  // The assistant endpoint uses the deterministic rule-based provider in tests, whatever the shell has configured.
  // Email-and-password sign-in is enabled here only (VITE_AUTH_PASSWORD_SIGN_IN); production allows Google only.
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    env: {
      ASSISTANT_PROVIDER: 'rules',
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: '',
      GOOGLE_API_KEY: '',
      OPENAI_API_KEY: '',
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: localAnonKey(),
      VITE_AUTH_PASSWORD_SIGN_IN: 'true',
    },
  },
});
