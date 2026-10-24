import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real web app (routes, store, editor, saver) in Chromium. Supabase is
 * replaced by an in-test mock backend (e2e/backend.ts) so runs are hermetic and can assert exactly
 * what the app persists.
 */
const PORT = 5199;
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: 'apps/web',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: 'http://mock.supabase.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      VITE_BLENDER_WORKER_URL: '',
    },
  },
});
