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
const REQUIRED_README_STATEMENTS = [
  ['OpenAI account and API-key requirement', /OpenAI API account with API key/i],
  ['paid API use', /OpenAI API is a paid service/i],
  ['OpenAI network destination', /api\.openai\.com/i],
  ['audio transmission', /Audio data is sent to OpenAI for transcription/i],
  ['external-file handling', /Files selected outside the vault are copied/i],
  ['local secret storage', /saved only when Electron safeStorage is available/i],
  ['absence of telemetry', /No telemetry or usage data is collected/i],
  [
    'English plugin-data persistence',
    /Plugin data stores settings, dictionaries, and up to 50 transcription-history items/i
  ],
  [
    'English local WebCodecs fallback',
    /Locally processed chunks use WebCodecs Opus[\s\S]*16 kHz mono WAV/i
  ],
  [
    'English selected-range upload',
    /For a selected time range, only that processed range is encoded into upload chunks/i
  ],
  [
    'Japanese plugin-data persistence',
    /プラグインデータには、設定、辞書、最大50件の文字起こし履歴を保存します/
  ],
  [
    'Japanese WebCodecs fallback',
    /ローカル処理したチャンクでは[\s\S]*WebCodecs Opus[\s\S]*16 kHzモノラルWAV/
  ],
  [
    'Japanese selected-range upload',
    /時間範囲を選択した場合、その処理範囲だけをアップロード用チャンクへエンコード/
  ]
];
const FORBIDDEN_README_STATEMENTS = [
  [
    'English no-persistence claim',
    /No data is stored permanently by the plugin beyond the transcribed text/i
  ],
  [
    'Japanese no-persistence claim',
    /プラグインによって文字起こしされたテキスト以外のデータは永続的に保存されません/
  ],
  ['English recording workflow', /"Recording failed" error/i],
  ['Japanese recording workflow', /「録音に失敗しました」エラー/],
  ['English microphone permission', /microphone permissions/i],
  ['Japanese microphone permission', /マイクの権限/],
  ['English audio-format setting', /different audio format in settings/i],
  ['Japanese audio-format setting', /設定で別の音声形式を試す/]
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

function readText(filePath, category) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(category, `Cannot read ${filePath}: ${message}`);
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

  const lintPluginVersion = packageJson.devDependencies?.['eslint-plugin-obsidianmd'];
  if (typeof lintPluginVersion !== 'string' || !SEMVER.test(lintPluginVersion)) {
    fail('tooling', 'eslint-plugin-obsidianmd must be pinned to an exact semantic version.');
  }
  if (typeof packageJson.scripts?.['lint:artifacts'] !== 'string') {
    fail('tooling', 'package.json must define the canonical lint:artifacts script.');
  }

  const contributing = readText(path.join(root, 'CONTRIBUTING.md'), 'tooling');
  const contributorRequirements = [
    ['pinned lint package', `eslint-plugin-obsidianmd@${lintPluginVersion}`],
    ['canonical artifact lint command', 'npm run lint:artifacts'],
    [
      'exact Community release bundle',
      'contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`'
    ]
  ];
  for (const [label, requiredText] of contributorRequirements) {
    if (!contributing.includes(requiredText)) {
      fail('tooling', `CONTRIBUTING.md is missing ${label}.`);
    }
  }

  if (!contributing.includes('npm run check:community')) {
    fail('tooling', 'CONTRIBUTING.md must name npm run check:community as the canonical gate.');
  }

  const readmePath = path.join(root, 'README.md');
  const readme = readText(readmePath, 'disclosure');
  for (const [label, pattern] of REQUIRED_README_STATEMENTS) {
    if (!pattern.test(readme)) {
      fail('disclosure', `README is missing ${label}.`);
    }
  }
  for (const [label, pattern] of FORBIDDEN_README_STATEMENTS) {
    if (pattern.test(readme)) {
      fail('disclosure', `README contains obsolete ${label}.`);
    }
  }

  const releaseNotesPath = path.join(root, 'docs', 'releases', `${manifestVersion}.md`);
  const releaseNotes = readText(releaseNotesPath, 'release');
  const expectedHeading = `# AI Transcriber ${manifestVersion}`;
  if (!releaseNotes.split(/\r?\n/, 1).includes(expectedHeading)) {
    fail('release', `${releaseNotesPath} must start with ${expectedHeading}.`);
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
