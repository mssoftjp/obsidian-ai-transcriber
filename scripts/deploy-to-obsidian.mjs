import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export function deployPluginArtifacts({
  outputDir,
  pluginsDir,
  pluginId,
  manifestPath,
  stylesPath,
  wasmSourcePath
}) {
  const targetDir = path.basename(pluginsDir) === pluginId
    ? pluginsDir
    : path.join(pluginsDir, pluginId);
  mkdirSync(targetDir, { recursive: true });

  copyFileSync(path.join(outputDir, 'main.js'), path.join(targetDir, 'main.js'));
  copyFileSync(manifestPath, path.join(targetDir, 'manifest.json'));
  if (existsSync(stylesPath)) {
    copyFileSync(stylesPath, path.join(targetDir, 'styles.css'));
  }
  if (wasmSourcePath && existsSync(wasmSourcePath)) {
    copyFileSync(wasmSourcePath, path.join(targetDir, 'fvad.wasm'));
  }

  return targetDir;
}
