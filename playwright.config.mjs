import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.mjs',
  globalSetup: './tests/browser/setup.mjs',
  outputDir: './tmp/media-browser/results',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8771', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/browser/server.mjs', url: 'http://127.0.0.1:8771', reuseExistingServer: false }
});
