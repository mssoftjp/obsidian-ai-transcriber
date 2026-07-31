import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { deployPluginArtifacts } from './deploy-to-obsidian.mjs';

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ai-transcriber-deploy-'));
  const outputDir = path.join(root, 'build');
  const pluginsDir = path.join(root, 'plugins');
  const manifestPath = path.join(root, 'manifest.json');
  const stylesPath = path.join(root, 'styles.css');
  const wasmSourcePath = path.join(root, 'fvad.wasm');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'main.js'), 'main');
  writeFileSync(manifestPath, '{"id":"ai-transcriber"}');
  writeFileSync(stylesPath, 'styles');
  writeFileSync(wasmSourcePath, 'wasm');

  return {
    root,
    outputDir,
    pluginsDir,
    manifestPath,
    stylesPath,
    wasmSourcePath
  };
}

test('deploys requested VAD WASM with the local plugin artifacts', (context) => {
  const fixture = createFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));

  const targetDir = deployPluginArtifacts({
    ...fixture,
    pluginId: 'ai-transcriber'
  });

  assert.equal(readFileSync(path.join(targetDir, 'main.js'), 'utf8'), 'main');
  assert.equal(readFileSync(path.join(targetDir, 'manifest.json'), 'utf8'), '{"id":"ai-transcriber"}');
  assert.equal(readFileSync(path.join(targetDir, 'styles.css'), 'utf8'), 'styles');
  assert.equal(readFileSync(path.join(targetDir, 'fvad.wasm'), 'utf8'), 'wasm');
});

test('preserves an existing VAD WASM when a build does not request replacement', (context) => {
  const fixture = createFixture();
  context.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const targetDir = path.join(fixture.pluginsDir, 'ai-transcriber');
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(path.join(targetDir, 'fvad.wasm'), 'existing-wasm');

  deployPluginArtifacts({
    outputDir: fixture.outputDir,
    pluginsDir: fixture.pluginsDir,
    pluginId: 'ai-transcriber',
    manifestPath: fixture.manifestPath,
    stylesPath: fixture.stylesPath
  });

  assert.equal(readFileSync(path.join(targetDir, 'fvad.wasm'), 'utf8'), 'existing-wasm');
});
