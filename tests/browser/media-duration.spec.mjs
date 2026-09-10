import { test, expect } from '@playwright/test';
import { statSync, readFileSync } from 'node:fs';

test('transcription start screen retains the 0.11.1 user controls', async ({ page }) => {
  await page.goto('/');
  const size = statSync('tmp/media-browser/fixtures/short.mp4').size;
  const state = await page.evaluate(size => window.openStartScreen('short.mp4', size), size);

  await expect(page.getByRole('heading', { name: 'AI transcriber' })).toHaveCount(1);
  const model = page.locator('.model-select');
  await expect(model).toHaveValue('gpt-transcribe');
  await expect(model.locator('option')).toHaveCount(5);
  await expect(page.locator('.file-name')).toContainText('short.mp4');
  await expect(page.locator('.file-details')).toContainText('Video file');
  await expect(page.locator('.cost-value')).not.toHaveText('--');

  const optionNames = await page.locator('.processing-options-section .setting-item-name').allTextContents();
  expect(optionNames).toEqual(expect.arrayContaining([
    'Language',
    'Output folder',
    'Enable AI post-processing',
    'Apply user dictionary',
    'Related information'
  ]));
  await expect(page.locator('.processing-options-section input[type="text"]')).toHaveCount(1);
  await expect(page.locator('.processing-options-section input[type="checkbox"]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Manage dictionary' })).toHaveCount(1);

  await expect(page.locator('.audio-duration')).toContainText('0:03');
  await expect(page.locator('.waveform-container canvas')).toHaveCount(1);
  await expect(page.locator('.ait-enable-time-range')).not.toBeChecked();
  await expect(page.locator('.ait-time-field')).toHaveCount(6);
  await expect(page.locator('.ait-time-field').nth(5)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Start transcription' })).toHaveClass(/mod-cta/);

  await model.selectOption('whisper-1');
  await expect.poll(async () => page.evaluate(() => window.activeModal.settings.model)).toBe('whisper-1');
  expect((await page.evaluate(() => window.activeModal.settings)).language).toBe(state.settings.language);
  expect(await page.evaluate(() => window.activeModal.saveSettings !== null)).toBe(true);
  await page.evaluate(() => window.activeModal.onClose());
});

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
      expect(result.reads).toBe(1);
      await expect(page.locator('canvas')).toHaveCount(1);
    }
    if (name === 'over-two-hours.mp4') expect(result.reads).toBe(1);
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
  for (const name of [
    'short.mp3', 'short.m4a', 'short.wav', 'short.flac', 'short.ogg', 'short.aac',
    'short.mp4', 'short.m4v', 'short.mov', 'short.mkv', 'short.webm',
    'wmav1.wma', 'wmav2.wma'
  ]) {
    test(`${route} decodes only the selected second: ${name}`, async ({ page }) => {
      await page.goto('/');
      const result = await page.evaluate(([name, route]) => window.decodeMediaRange(name, route), [name, route]);
      expect(result.duration).toBeCloseTo(1, 3);
      expect(result.samples).toBe(16000);
      expect(result.peak).toBeGreaterThan(0.02);
    });
  }
}

for (const route of ['engine', 'vad-converter']) {
  test(`${route} reports the inherited AVI runtime-codec limitation`, async ({ page }) => {
    await page.goto('/');
    await expect(page.evaluate(route => window.decodeMediaRange('short.avi', route), route))
      .rejects.toThrow(/decod/i);
  });
}

test('retains the original audio-decode fallback when metadata is unavailable', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => window.openMedia('short.mp4', 1000, { metadataUnavailable: true }));
  expect(result.duration).toBeCloseTo(3, 1);
  expect(result.reads).toBe(1);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.audio-duration')).not.toContainText('Unknown');
});


test('56-minute audio over 16 MB retains waveform dragging and time-field sync', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  const size = statSync('tmp/media-browser/fixtures/fifty-six-minutes.m4a').size;
  expect(size).toBeGreaterThan(16 * 1024 * 1024);
  const result = await page.evaluate(size => window.openMedia('fifty-six-minutes.m4a', size), size);
  expect(result.duration).toBeCloseTo(3362, 1);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  const retainedWaveform = await page.evaluate(() => {
    const selector = window.activeModal.waveformSelector;
    return {
      hasAudioBuffer: Object.prototype.hasOwnProperty.call(selector, 'audioBuffer'),
      points: selector.waveformData.length
    };
  });
  expect(retainedWaveform).toEqual({ hasAudioBuffer: false, points: 560 });
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.ait-enable-time-range')).toBeChecked();
  const selected = await page.evaluate(() => window.activeModal.waveformSelector.getTimeRange());
  expect(selected.start).toBeGreaterThan(700);
  expect(selected.start).toBeLessThan(1000);
  const fields = page.locator('.ait-time-field');
  await expect(fields.nth(1)).toHaveValue(String(Math.floor(selected.start / 60)));
  await fields.nth(1).fill('2');
  await fields.nth(2).fill('0');
  expect(await page.evaluate(() => window.activeModal.waveformSelector.getTimeRange().start)).toBe(120);
  await page.evaluate(() => window.activeModal.onClose());
  await expect(canvas).toHaveCount(0);
});

for (const name of ['over-128mb.mp4', 'long-audio.m4a']) {
  test(`waveform remains selectable beyond the former budgets: ${name}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/');
    const size = statSync(`tmp/media-browser/fixtures/${name}`).size;
    if (name === 'over-128mb.mp4') expect(size).toBeGreaterThan(128 * 1024 * 1024);
    const result = await page.evaluate(([name, size]) => window.openMedia(name, size), [name, size]);
    expect(result.reads).toBe(1);
    if (name === 'long-audio.m4a') expect(result.duration).toBeGreaterThan(7200);
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.locator('.ait-enable-time-range').check();
    await page.locator('.ait-time-field').nth(2).fill('1');
    expect(await page.evaluate(() => window.activeModal.waveformSelector.getTimeRange().start)).toBe(1);
    await page.evaluate(() => window.activeModal.onClose());
    await expect(page.locator('canvas')).toHaveCount(0);
  });
}
