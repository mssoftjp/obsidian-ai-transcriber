import { existsSync, cpSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const pluginEntry = join(rootDir, 'node_modules', 'eslint-plugin-obsidianmd', 'dist', 'lib', 'index.js');

if (existsSync(pluginEntry)) {
  process.exit(0);
}

const pluginDir = join(rootDir, 'node_modules', 'eslint-plugin-obsidianmd');
if (!existsSync(pluginDir)) {
  console.warn('[eslint-plugin-obsidianmd] Package not installed; skipping setup.');
  process.exit(0);
}

const tempBase = mkdtempSync(join(tmpdir(), 'obsidianmd-eslint-'));
const repoDir = join(tempBase, 'repo');

console.log('[eslint-plugin-obsidianmd] Cloning sources...');
execSync(`git clone --depth 1 https://github.com/obsidianmd/eslint-plugin.git "${repoDir}"`, { stdio: 'inherit' });

console.log('[eslint-plugin-obsidianmd] Installing dependencies...');
execSync('npm install', { cwd: repoDir, stdio: 'inherit' });

console.log('[eslint-plugin-obsidianmd] Building plugin...');
execSync('npm run build', { cwd: repoDir, stdio: 'inherit' });

console.log('[eslint-plugin-obsidianmd] Copying dist assets...');
cpSync(join(repoDir, 'dist'), join(pluginDir, 'dist'), { recursive: true });

rmSync(tempBase, { recursive: true, force: true });

console.log('[eslint-plugin-obsidianmd] Setup complete.');
