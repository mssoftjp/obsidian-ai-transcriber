import { test, expect } from '@playwright/test';
import { statSync, readFileSync } from 'node:fs';

for (const [name, seconds] of [
  ['short.mp4', 3], ['short.mov', 3], ['short.webm', 3], ['short.mkv', 3],
  ['large.mp4', 3], ['large.mov', 3], ['thirteen-minutes.mp4', 780], ['over-two-hours.mp4', 7203]
]) {
  test(`duration and range controls: ${name}`, async ({ page }) => {
    await page.goto('/');
    const size = statSync(`tmp/media-browser/fixtures/${name}`).size;
    const result = await page.evaluate(([name, size]) => window.openMedia(name, size), [name, size]);
    const measured = JSON.parse(readFileSync('tmp/media-browser/durations.json', 'utf8'))[name];
    expect(Math.abs(measured - seconds)).toBeLessThan(0.1);
    expect(result.duration).toBeCloseTo(measured, 2);
    expect(result.estimates.at(-1)).toBeCloseTo(measured, 2);
    await expect(page.locator('.audio-duration')).not.toContainText('Unknown');
    if (name === 'short.mp4') await expect(page.locator('canvas')).toHaveCount(1);
    if (name.startsWith('large')) {
      expect(size).toBeGreaterThan(16 * 1024 * 1024);
      if (!process.env.MEDIA_BASELINE_REF) expect(result.reads).toBe(0);
    }
    if (name === 'over-two-hours.mp4') expect(result.reads).toBe(0);
    await page.locator('.ait-enable-time-range').check();
    const fields = page.locator('.ait-time-field');
    await expect(fields.nth(5)).toBeEnabled();
    await expect(fields.nth(3)).toHaveValue(String(Math.floor(result.duration / 3600)));
    await expect(fields.nth(4)).toHaveValue(String(Math.floor(result.duration % 3600 / 60)));
    await expect(fields.nth(5)).toHaveValue(String(Math.floor(result.duration % 60)));
    await fields.nth(2).fill('1');
    expect(await page.evaluate(() => window.activeModal.startTimeInput.value)).toBe('0:01');
    await page.evaluate(() => window.activeModal.onClose());
  });
}

test('duration survives an unsupported waveform audio codec', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => window.openMedia('short.mp4', 1000, { failDecode: true }));
  expect(result.duration).toBeCloseTo(3, 1);
  await expect(page.locator('.audio-duration')).toContainText('0:03');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('close during metadata load cancels and does not resurrect controls', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => window.openMedia('large.mp4', 17 * 1024 * 1024, { closeImmediately: true }));
  expect(result.duration).toBe(0);
  expect(result.reads).toBe(0);
  await expect(page.locator('.audio-duration')).toHaveCount(0);
  await expect(page.locator('.ait-time-field')).toHaveCount(0);
});

test('corrupt metadata fails honestly and within a bounded time', async ({ page }) => {
  await page.goto('/');
  const error = await page.evaluate(async () => {
    try { await window.readMediaDuration('/harness.js', new AbortController().signal, 500); }
    catch (error) { return error.message; }
  });
  expect(error).toContain('Could not read media duration');
});

for (const route of ['engine', 'vad-converter']) {
  for (const name of ['short.mp4', 'short.mov', 'short.webm', 'wmav1.wma', 'wmav2.wma']) {
    test(`${route} decodes only the selected second: ${name}`, async ({ page }) => {
      await page.goto('/');
      const result = await page.evaluate(([name, route]) => window.decodeMediaRange(name, route), [name, route]);
      expect(result.duration).toBeCloseTo(1, 3);
      expect(result.samples).toBe(16000);
      expect(result.peak).toBeGreaterThan(0.02);
    });
  }
}

test('retains the original audio-decode fallback when metadata is unavailable', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => window.openMedia('short.mp4', 1000, { metadataUnavailable: true }));
  expect(result.duration).toBeCloseTo(3, 1);
  expect(result.reads).toBe(1);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.audio-duration')).not.toContainText('Unknown');
});
