import path from 'path';
import { defineConfig, devices } from '@playwright/test';

// A plain `--use-fake-device-for-media-stream` gives Chromium a synthetic *video* pattern with
// no real hardware needed, but for audio it still tries to open a real OS audio input device —
// which hangs `getUserMedia({audio:true})` indefinitely in a sandbox with no audio hardware at
// all (confirmed directly: video resolves instantly, audio never resolves or rejects). Pointing
// it at a real WAV file instead sidesteps needing any audio device — verified this actually
// fixes it (audio resolves in under a second) before wiring it in here.
const FAKE_AUDIO_FILE = path.join(__dirname, 'tests', 'fixtures', 'fake-mic.wav');

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
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-audio-capture=${FAKE_AUDIO_FILE}`,
          ],
        },
      },
    },
    {
      // Section 13: "one finger on the background pans, and one finger on a box drags it" —
      // only run against tests/phone.spec.ts (a real touch device, not just a narrow window; see
      // that file's comment for why `hasTouch`/`isMobile` matter here). `devices['iPhone 13']`'s
      // own default browser is WebKit — real iPhones run WebKit too, so this is a closer proxy
      // for actual Mobile Safari than emulating touch on Chromium would be.
      name: 'mobile',
      testMatch: /(phone|export-subpath)\.spec\.ts/,
      use: { ...devices['iPhone 13'], permissions: ['microphone', 'camera'] },
    },
    {
      // "Live voice recording on Safari/iOS and Chrome" (gift-readiness pass) — only run against
      // the specific features that need real getUserMedia/MediaRecorder coverage beyond Chromium.
      // Desktop Safari (WebKit) rather than an iOS device profile: WebKit ships its own built-in
      // mock capture devices that resolve getUserMedia instantly with no special launch flags
      // (unlike Chromium, which needed the file-based fake-audio-capture flag above) — verified
      // directly before relying on it. This is still the same rendering/JS engine real iOS Safari
      // uses, just without iOS-specific chrome/viewport quirks, which section 13's `mobile`
      // project above already covers separately.
      name: 'safari',
      testMatch: /(photobooth|voice-recording)\.spec\.ts/,
      use: { ...devices['Desktop Safari'], permissions: ['microphone', 'camera'] },
    },
  ],
});
