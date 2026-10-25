import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  reporter: [['list'], ['json', {outputFile: '.local/playwright-results.json'}]],
  timeout: 240000,
  expect: {timeout: 20000},
  use: {baseURL: 'http://127.0.0.1:3200', headless: true, trace: 'retain-on-failure'},
  projects: [{name: 'chrome', use: {browserName: 'chromium', channel: 'chrome'}}],
  webServer: [
    {command: 'node test/e2e/start-harness.cjs', url: 'http://127.0.0.1:3201/api/health/live', timeout: 420000, reuseExistingServer: false},
    {command: 'node test/e2e/start-frontend.cjs', url: 'http://127.0.0.1:3200/login', timeout: 420000, reuseExistingServer: false,
      env: {BACKEND_API_URL: 'http://127.0.0.1:3201', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3200', SESSION_SECRET: 'browser-test-session-secret-at-least-32-characters', FRONTEND_ORIGIN: 'http://127.0.0.1:3200'}},
  ],
});
