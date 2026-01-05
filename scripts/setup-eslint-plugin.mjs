import { existsSync, cpSync, rmSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const pluginEntry = join(rootDir, 'node_modules', 'eslint-plugin-obsidianmd', 'dist', 'lib', 'index.js');

const pluginDir = join(rootDir, 'node_modules', 'eslint-plugin-obsidianmd');
if (!existsSync(pluginDir)) {
  console.warn('[eslint-plugin-obsidianmd] Package not installed; skipping setup.');
  process.exit(0);
}

const pluginNodeModulesDir = join(pluginDir, 'node_modules');
const expectedPackageJsons = [
  join(pluginNodeModulesDir, '@eslint', 'js', 'package.json'),
  join(pluginNodeModulesDir, '@microsoft', 'eslint-plugin-sdl', 'package.json'),
  join(pluginNodeModulesDir, 'eslint-plugin-import', 'package.json'),
  join(pluginNodeModulesDir, 'typescript-eslint', 'package.json')
];
if (existsSync(pluginNodeModulesDir) && expectedPackageJsons.some((p) => {
  const dir = p.replace(/[/\\\\]package\\.json$/, '');
  return existsSync(dir) && !existsSync(p);
})) {
  rmSync(pluginNodeModulesDir, { recursive: true, force: true });
}

let pluginVersion = '';
try {
  const pkgJson = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'));
  pluginVersion = typeof pkgJson.version === 'string' ? pkgJson.version.trim() : '';
} catch {
  pluginVersion = '';
}

const versionMarker = join(pluginDir, 'dist', '.built-version');
const pluginUtilsEntry = join(pluginDir, 'node_modules', '@typescript-eslint', 'utils', 'dist', 'index.js');
if (!existsSync(pluginUtilsEntry)) {
  rmSync(join(pluginDir, 'node_modules', '@typescript-eslint', 'utils'), { recursive: true, force: true });
}

const eslintScopeDir = join(pluginDir, 'node_modules', '@eslint');
const eslintJsPackageJson = join(eslintScopeDir, 'js', 'package.json');
if (existsSync(eslintScopeDir) && !existsSync(eslintJsPackageJson)) {
  rmSync(eslintScopeDir, { recursive: true, force: true });
}

if (existsSync(pluginEntry) && existsSync(versionMarker)) {
  const builtVersion = readFileSync(versionMarker, 'utf8').trim();
  if (builtVersion === pluginVersion) {
    process.exit(0);
  }
}

const tempBase = mkdtempSync(join(tmpdir(), 'obsidianmd-eslint-'));
const repoDir = join(tempBase, 'repo');

console.log('[eslint-plugin-obsidianmd] Cloning sources...');
try {
  const ref = pluginVersion || 'main';
  execSync(`git clone --depth 1 --branch ${ref} https://github.com/obsidianmd/eslint-plugin.git "${repoDir}"`, { stdio: 'inherit' });
} catch {
  execSync(`git clone --depth 1 https://github.com/obsidianmd/eslint-plugin.git "${repoDir}"`, { stdio: 'inherit' });
}

console.log('[eslint-plugin-obsidianmd] Installing dependencies...');
execSync('npm install', { cwd: repoDir, stdio: 'inherit' });

console.log('[eslint-plugin-obsidianmd] Building plugin...');
execSync('npm run build', { cwd: repoDir, stdio: 'inherit' });

console.log('[eslint-plugin-obsidianmd] Copying dist assets...');
cpSync(join(repoDir, 'dist'), join(pluginDir, 'dist'), { recursive: true });
writeFileSync(versionMarker, `${pluginVersion}\n`, 'utf8');

if (!existsSync(pluginUtilsEntry)) {
  rmSync(join(pluginDir, 'node_modules', '@typescript-eslint', 'utils'), { recursive: true, force: true });
}

if (existsSync(eslintScopeDir) && !existsSync(eslintJsPackageJson)) {
  rmSync(eslintScopeDir, { recursive: true, force: true });
}

rmSync(tempBase, { recursive: true, force: true });

console.log('[eslint-plugin-obsidianmd] Setup complete.');
