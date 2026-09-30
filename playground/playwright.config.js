import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, actionTimeout: 10_000, viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
