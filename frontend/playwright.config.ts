import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests against the real app: Vite dev server + FastAPI (throwaway SQLite, fake NASA POWER).
 * Ports 5180/8100 avoid clashing with a normal dev session on 5173/8000.
 * "phone" emulates an iPhone 13 viewport with touch input in Chromium (not real Safari).
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 45_000,
  forbidOnly: Boolean(process.env.CI), // a stray test.only must not silently skip the suite in CI
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: 'http://127.0.0.1:5180', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: [
    { command: 'bash e2e/start-backend.sh', url: 'http://127.0.0.1:8100/ready', timeout: 60_000, reuseExistingServer: false },
    {
      command: 'npx vite --host 127.0.0.1 --port 5180 --strictPort',
      url: 'http://127.0.0.1:5180',
      env: { AGRISENSE_API_TARGET: 'http://127.0.0.1:8100' },
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
})
