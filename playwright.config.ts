import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone', 'camera'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
    {
      // Section 13: "one finger on the background pans, and one finger on a box drags it" —
      // only run against tests/phone.spec.ts (a real touch device, not just a narrow window;
      // see that file's comment for why `hasTouch`/`isMobile` matter here). iPhone 13's own
      // viewport/touch/UA emulation, forced onto Chromium (the only browser installed in this
      // environment — WebKit isn't available) rather than `devices['iPhone 13']`'s default
      // browser; Chromium's touch emulation is a well-supported combination.
      name: 'mobile',
      testMatch: /phone\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
});
