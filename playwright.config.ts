import { defineConfig } from '@playwright/test';

const PORT = 3100;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/zge_test';

export default defineConfig({
  testDir: 'tests/e2e',
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
    env: { PORT: String(PORT), DATABASE_URL },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
