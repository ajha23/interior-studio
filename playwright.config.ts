import { defineConfig, devices } from '@playwright/test';

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
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
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
  webServer: { command: 'npm run dev -- --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI, env: { ASSISTANT_PROVIDER: 'rules', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', OPENAI_API_KEY: '' } },
});
