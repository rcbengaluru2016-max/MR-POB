import { defineConfig } from '@playwright/test';

const frontendPort = process.env.E2E_FRONTEND_PORT || '3200';
const backendPort = process.env.E2E_BACKEND_PORT || '3201';
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  reporter: [['list'], ['json', {outputFile: '.local/playwright-results.json'}]],
  timeout: 240000,
  expect: {timeout: 20000},
  use: {baseURL: frontendUrl, headless: true, trace: 'retain-on-failure'},
  projects: [{name: 'chrome', use: {browserName: 'chromium', channel: 'chrome'}}],
  webServer: [
    {command: 'node test/e2e/start-harness.cjs', url: `${backendUrl}/api/health/live`, timeout: 420000, reuseExistingServer: false,
      env: {E2E_BACKEND_PORT: backendPort, E2E_FRONTEND_ORIGIN: frontendUrl}},
    {command: 'node test/e2e/start-frontend.cjs', url: `${frontendUrl}/login`, timeout: 420000, reuseExistingServer: false,
      env: {BACKEND_API_URL: backendUrl, E2E_FRONTEND_PORT: frontendPort, NEXT_PUBLIC_APP_URL: frontendUrl, SESSION_SECRET: 'browser-test-session-secret-at-least-32-characters', FRONTEND_ORIGIN: frontendUrl}},
  ],
});
