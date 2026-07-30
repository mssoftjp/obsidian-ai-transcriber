import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;
const SUPPORT_HOSTS = new Set([
  'buymeacoffee.com',
  'github.com',
  'ko-fi.com',
  'patreon.com'
]);
const DISCLOSURES = [
  ['OpenAI account and API-key requirement', /OpenAI API account with API key/i],
  ['paid API use', /OpenAI API is a paid service/i],
  ['OpenAI network destination', /api\.openai\.com/i],
  ['audio transmission', /Audio data is sent to OpenAI for transcription/i],
  ['external-file handling', /Files selected outside the vault are copied/i],
  ['local secret storage', /saved only when Electron safeStorage is available/i],
  ['absence of telemetry', /No telemetry or usage data is collected/i]
];

function fail(category, message) {
  throw new Error(`[${category}] ${message}`);
}

function readJson(filePath) {
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail('metadata', `${filePath} must contain a JSON object.`);
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[metadata]')) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    fail('metadata', `Cannot read ${filePath}: ${message}`);
  }
}

function readReadme(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail('disclosure', `Cannot read ${filePath}: ${message}`);
  }
}

export function verifyCommunityMetadata(repositoryRoot = process.cwd()) {
  const root = path.resolve(repositoryRoot);
  const manifest = readJson(path.join(root, 'manifest.json'));
  const packageJson = readJson(path.join(root, 'package.json'));
  const versions = readJson(path.join(root, 'versions.json'));
  const manifestVersion = manifest.version;
  const pluginId = manifest.id;
  const description = manifest.description;
  const minAppVersion = manifest.minAppVersion;

  if (typeof manifestVersion !== 'string' || !SEMVER.test(manifestVersion)) {
    fail('metadata', `Expected semantic manifest version; found ${String(manifestVersion)}.`);
  }
  if (packageJson.version !== manifestVersion) {
    fail(
      'metadata',
      `package.json version ${String(packageJson.version)} does not match manifest ${manifestVersion}.`
    );
  }
  if (versions[manifestVersion] !== minAppVersion) {
    fail(
      'metadata',
      `versions.json[${manifestVersion}] must equal minAppVersion ${String(minAppVersion)}.`
    );
  }
  if (
    typeof pluginId !== 'string'
    || pluginId !== 'ai-transcriber'
    || !/^[a-z0-9-]+$/.test(pluginId)
    || pluginId.includes('obsidian')
  ) {
    fail('metadata', `Invalid plugin id: ${String(pluginId)}.`);
  }
  if (
    typeof description !== 'string'
    || description.length > 250
    || !/^(Transcribe|Generate|Import|Sync|Open)\b/.test(description)
    || /^(This is|This plugin)\b/i.test(description)
    || !description.endsWith('.')
  ) {
    fail('metadata', `Invalid Community description: ${String(description)}.`);
  }
  if (typeof minAppVersion !== 'string' || !SEMVER.test(minAppVersion)) {
    fail('metadata', `Invalid minAppVersion: ${String(minAppVersion)}.`);
  }
  if (manifest.isDesktopOnly !== true) {
    fail('metadata', 'isDesktopOnly must remain true for Electron and desktop file access.');
  }

  let fundingUrl;
  try {
    if (typeof manifest.fundingUrl !== 'string') {
      throw new TypeError('fundingUrl must be a string');
    }
    fundingUrl = new URL(manifest.fundingUrl);
  } catch {
    fail('metadata', `Invalid fundingUrl: ${String(manifest.fundingUrl)}.`);
  }
  if (fundingUrl.protocol !== 'https:' || !SUPPORT_HOSTS.has(fundingUrl.hostname)) {
    fail('metadata', `fundingUrl is not a recognized support destination: ${fundingUrl.href}.`);
  }

  const lockfilePath = path.join(root, 'package-lock.json');
  if (!existsSync(lockfilePath)) {
    fail('metadata', `Missing committed lockfile: ${lockfilePath}.`);
  }

  const readmePath = path.join(root, 'README.md');
  const readme = readReadme(readmePath);
  for (const [label, pattern] of DISCLOSURES) {
    if (!pattern.test(readme)) {
      fail('disclosure', `README is missing ${label}.`);
    }
  }

  return { version: manifestVersion };
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = verifyCommunityMetadata(process.argv[2] ?? process.cwd());
    process.stdout.write(`Verified Community metadata ${result.version}.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
