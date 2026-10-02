import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:3000', channel: process.env.CI ? undefined : 'chrome', viewport: { width: 1440, height: 1000 } },
  webServer: process.env.TEST_URL ? undefined : { command: 'npm run dev -- --hostname 127.0.0.1', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI },
});
