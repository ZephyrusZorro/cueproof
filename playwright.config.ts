import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  workers: 2,
  timeout: 25_000,
  use: {
    baseURL: 'http://127.0.0.1:4188',
    channel: process.env.CUEPROOF_BROWSER_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4188 --strictPort',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: false,
  },
})
