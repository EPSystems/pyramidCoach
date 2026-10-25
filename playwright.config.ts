import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  use: { baseURL: process.env.APP_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 180_000 },
});
