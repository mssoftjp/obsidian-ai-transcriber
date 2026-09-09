import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, openSync, writeSync, ftruncateSync, closeSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function setup() {
  const dir = resolve('tmp/media-browser/fixtures');
  mkdirSync(dir, { recursive: true });
  const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=5', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', `${dir}/short.mp4`]);
  ffmpeg(['-i', `${dir}/short.mp4`, '-c', 'copy', `${dir}/short.mov`]);
  ffmpeg(['-i', `${dir}/short.mp4`, '-c:v', 'libvpx-vp9', '-c:a', 'libopus', `${dir}/short.webm`]);
  ffmpeg(['-i', `${dir}/short.mp4`, '-c', 'copy', `${dir}/short.mkv`]);
  // An ISO BMFF free box makes a valid large video without committing a large fixture.
  for (const name of ['large.mp4', 'large.mov']) {
    copyFileSync(`${dir}/short.mp4`, `${dir}/${name}`);
    const fd = openSync(`${dir}/${name}`, 'a');
    const box = Buffer.alloc(8);
    box.writeUInt32BE(17 * 1024 * 1024); box.write('free', 4);
    writeSync(fd, box);
    closeSync(fd);
    const extend = openSync(`${dir}/${name}`, 'r+');
    // Keep the free box length exact.
    const { size } = statSync(`${dir}/${name}`);
    ftruncateSync(extend, size + 17 * 1024 * 1024 - 8);
    closeSync(extend);
  }
  for (const [name, duration] of [['thirteen-minutes.mp4', 780], ['over-two-hours.mp4', 7203]]) {
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=16x16:r=1', '-t', String(duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `${dir}/${name}`]);
  }
  for (const codec of ['wmav1', 'wmav2']) {
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '3', '-ac', '2', '-c:a', codec, `${dir}/${codec}.wma`]);
  }
  const durations = {};
  for (const name of ['short.mp4', 'short.mov', 'short.webm', 'short.mkv', 'large.mp4', 'large.mov', 'thirteen-minutes.mp4', 'over-two-hours.mp4']) {
    durations[name] = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', `${dir}/${name}`], { encoding: 'utf8' }).trim());
  }
  writeFileSync(resolve(dir, '../durations.json'), JSON.stringify(durations));
  const plugins = [];
  if (process.env.MEDIA_BASELINE_REF) {
    const ref = process.env.MEDIA_BASELINE_REF;
    if (!['0.11.1', 'HEAD'].includes(ref)) throw new Error('Unsupported baseline');
    plugins.push({ name: 'baseline-modal', setup(builder) {
      builder.onLoad({ filter: /[/\\]ApiTranscriptionModal\.ts$/ }, () => ({
        contents: execFileSync('git', ['show', `${ref}:src/ui/ApiTranscriptionModal.ts`], { encoding: 'utf8' }),
        loader: 'ts', resolveDir: resolve('src/ui')
      }));
    } });
  }
  await build({ plugins, entryPoints: ['tests/browser/harness.mjs'], bundle: true, format: 'iife', outfile: 'tmp/media-browser/harness.js', alias: { obsidian: resolve('tests/browser/obsidian.mjs') }, loader: { '.bin': 'base64', '.txt': 'text' } });
}
