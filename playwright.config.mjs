import { defineConfig, devices, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Prefer the browser matching the installed Playwright release. This Windows
// workspace also has a previously downloaded Chromium usable for local QA.
const cachedChromium = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe');
const executablePath = process.env.GYMTRACK_CHROMIUM_PATH ||
  (!existsSync(chromium.executablePath()) && existsSync(cachedChromium) ? cachedChromium : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.mjs',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: './test-results/browser',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: { executablePath },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', browserName: 'chromium' } },
    { name: 'mobile-375', grep: /@layout/, use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 }, screen: { width: 375, height: 812 }, defaultBrowserType: 'chromium', browserName: 'chromium' } },
    { name: 'mobile-320', grep: /@layout/, use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium', browserName: 'chromium' } },
    { name: 'desktop', grep: /@layout/, use: { viewport: { width: 1440, height: 1100 } } },
  ],
  webServer: {
    command: `"${process.execPath}" scripts/serve.mjs`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
