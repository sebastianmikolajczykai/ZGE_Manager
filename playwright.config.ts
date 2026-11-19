import { defineConfig } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npx tsx src/server.ts',
    url: `http://localhost:${PORT}/health`,
    env: { PORT: String(PORT), DB_PATH: 'e2e-data/e2e.db' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
