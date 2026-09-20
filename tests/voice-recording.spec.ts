import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

/**
 * Gift-readiness pass: live voice recording (real `getUserMedia` + `MediaRecorder`), not the
 * upload-fallback path `tests/goodies-e2e.spec.ts` deliberately uses instead to dodge timing
 * flakiness. Runs under both the default `chromium` project (fake audio device, see
 * `playwright.config.ts` for why a file-based fake capture was needed there specifically) and
 * the `safari` project (real WebKit — its own built-in mock capture devices needed no special
 * flags at all) — "Chrome and Safari/iOS" from the gift-readiness checklist.
 */
test.describe('live voice recording', () => {
  test('records for real in Chrome and uploads a real clip', async ({ page, request }) => {
    test.setTimeout(30_000);
    const room = await seedRoom(request, { celebrantName: 'VoiceRecordingSuite' });
    const contribute = tokenFromLink(room.links.contribute);

    await page.goto(`/r/${contribute}`);
    await page.getByRole('button', { name: 'Add a present' }).click();
    await page.getByPlaceholder('Your name').fill('Chatty Chris');
    await page.getByRole('button', { name: '🎙️ Voice' }).first().click();

    await page.getByRole('button', { name: '🎙️ Record' }).click();
    // A visible recording indicator (the live level meter) confirms MediaRecorder actually
    // started against the fake mic track, not just that the button was clicked.
    await expect(page.getByRole('button', { name: '⏹ Stop' })).toBeVisible({ timeout: 5_000 });

    await page.waitForTimeout(1200); // record ~1.2s of the fake audio track
    await page.getByRole('button', { name: '⏹ Stop' }).click();

    // Confirms the real MediaRecorder blob was uploaded through the normal pipeline (not the
    // file-upload fallback) and a plausible non-zero duration was captured.
    await expect(page.getByText(/✓ \d+s recorded/)).toBeVisible({ timeout: 10_000 });
    const durationText = await page.getByText(/✓ \d+s recorded/).textContent();
    const seconds = Number(durationText?.match(/(\d+)s/)?.[1]);
    expect(seconds).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Add to box' }).click();
    await expect(page.getByRole('button', { name: 'Add to box' })).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('1 / 25')).toBeVisible();
  });
});
