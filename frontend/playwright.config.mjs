import { defineConfig } from '@playwright/test'

const port = Number(process.env.GRADEFLOW_E2E_PORT || 3011)
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.js',
  fullyParallel: true,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: {
    command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
