import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Fixture {
  root: string;
  manifest: Record<string, unknown>;
  packageJson: FixturePackageJson;
}

interface FixturePackageJson {
  version: string;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
}

const verifierPath = join(process.cwd(), 'scripts', 'verify-community-metadata.mjs');
const roots: string[] = [];

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function compliantReadme(): string {
  return [
    'OpenAI API account with API key.',
    'OpenAI API is a paid service.',
    'The plugin uses api.openai.com.',
    'Audio data is sent to OpenAI for transcription.',
    'Files selected outside the vault are copied to a plugin-owned temporary folder.',
    'API keys are saved only when Electron safeStorage is available.',
    'No telemetry or usage data is collected.',
    'Plugin data stores settings, dictionaries, and up to 50 transcription-history items.',
    'Locally processed chunks use WebCodecs Opus with a 16 kHz mono WAV fallback.',
    'For a selected time range, only that processed range is encoded into upload chunks.',
    'プラグインデータには、設定、辞書、最大50件の文字起こし履歴を保存します。',
    'ローカル処理したチャンクではWebCodecs Opusを使用し、失敗時は16 kHzモノラルWAVへフォールバックします。',
    '時間範囲を選択した場合、その処理範囲だけをアップロード用チャンクへエンコードします。'
  ].join('\n');
}

function writeReadme(root: string, override = compliantReadme()): void {
  writeFileSync(join(root, 'README.md'), override);
}

function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'ai-transcriber-metadata-'));
  const manifest: Record<string, unknown> = {
    id: 'ai-transcriber',
    name: 'AI Transcriber',
    version: '1.2.3',
    minAppVersion: '1.8.7',
    description: 'Transcribe audio and video files with OpenAI transcription models.',
    author: 'Musashino Software',
    fundingUrl: 'https://buymeacoffee.com/mssoft',
    isDesktopOnly: true
  };
  const packageJson: FixturePackageJson = {
    version: '1.2.3',
    scripts: {
      'lint:artifacts': 'eslint "build/**/*.js" --max-warnings=0'
    },
    devDependencies: {
      'eslint-plugin-obsidianmd': '0.4.1'
    }
  };

  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeJson(join(root, 'manifest.json'), manifest);
  writeJson(join(root, 'package.json'), packageJson);
  writeJson(join(root, 'versions.json'), { '1.2.3': '1.8.7' });
  writeJson(join(root, 'package-lock.json'), { lockfileVersion: 3 });
  writeReadme(root);
  writeFileSync(join(root, 'CONTRIBUTING.md'), [
    'Run `npm run check:community` locally and in CI.',
    'Pin `eslint-plugin-obsidianmd@0.4.1` in local and CI scans.',
    'Run `npm run lint:artifacts` after the build.',
    'The Community release bundle contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`.'
  ].join('\n'));
  mkdirSync(join(root, 'docs', 'releases'), { recursive: true });
  writeFileSync(
    join(root, 'docs', 'releases', '1.2.3.md'),
    '# AI Transcriber 1.2.3\n'
  );
  return { root, manifest, packageJson };
}

function run(root: string) {
  return spawnSync(process.execPath, [verifierPath, root], { encoding: 'utf8' });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('Community metadata verifier', () => {
  it('accepts a compliant repository', () => {
    const fixture = createFixture();
    const result = run(fixture.root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Verified Community metadata 1.2.3');
    expect(result.stderr).toBe('');
  });

  it('accepts tracked contributor guidance without an ignored AGENTS.md', () => {
    const fixture = createFixture();
    expect(existsSync(join(fixture.root, 'AGENTS.md'))).toBe(false);

    const result = run(fixture.root);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('rejects cross-file version mismatches', () => {
    const fixture = createFixture();
    writeJson(join(fixture.root, 'package.json'), { version: '1.2.4' });

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('package.json version 1.2.4');
  });

  it.each<[string, unknown, string]>([
    ['id', 'obsidian-ai-transcriber', 'plugin id'],
    ['description', 'This plugin transcribes audio', 'description'],
    ['isDesktopOnly', false, 'isDesktopOnly']
  ])('rejects invalid manifest %s', (field, value, expectedMessage) => {
    const fixture = createFixture();
    fixture.manifest[field] = value;
    writeJson(join(fixture.root, 'manifest.json'), fixture.manifest);

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedMessage);
  });

  it('rejects a missing required disclosure', () => {
    const fixture = createFixture();
    writeReadme(fixture.root, 'OpenAI API account with API key.');

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[disclosure]');
    expect(result.stderr).toContain('paid API use');
  });

  it.each<[string, string]>([
    [
      'English plugin-data persistence',
      'Plugin data stores settings, dictionaries, and up to 50 transcription-history items.'
    ],
    [
      'Japanese plugin-data persistence',
      'プラグインデータには、設定、辞書、最大50件の文字起こし履歴を保存します。'
    ],
    [
      'Japanese WebCodecs fallback',
      'ローカル処理したチャンクではWebCodecs Opusを使用し、失敗時は16 kHzモノラルWAVへフォールバックします。'
    ],
    [
      'Japanese selected-range upload',
      '時間範囲を選択した場合、その処理範囲だけをアップロード用チャンクへエンコードします。'
    ]
  ])('rejects a missing %s disclosure', (label, sentence) => {
    const fixture = createFixture();
    writeReadme(fixture.root, compliantReadme().replace(sentence, ''));

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[disclosure]');
    expect(result.stderr).toContain(label);
  });

  it.each<[string, string]>([
    [
      'English no-persistence claim',
      'No data is stored permanently by the plugin beyond the transcribed text'
    ],
    [
      'Japanese no-persistence claim',
      'プラグインによって文字起こしされたテキスト以外のデータは永続的に保存されません'
    ],
    ['English recording workflow', '"Recording failed" error'],
    ['Japanese recording workflow', '「録音に失敗しました」エラー'],
    ['English microphone permission', 'Ensure your computer has microphone permissions'],
    ['Japanese microphone permission', 'PCにマイクの権限があることを確認'],
    ['English audio-format setting', 'Try using a different audio format in settings'],
    ['Japanese audio-format setting', '設定で別の音声形式を試す']
  ])('rejects obsolete %s guidance', (label, staleText) => {
    const fixture = createFixture();
    writeReadme(fixture.root, `${compliantReadme()}\n${staleText}`);

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[disclosure]');
    expect(result.stderr).toContain(label);
  });

  it('rejects a non-support funding destination', () => {
    const fixture = createFixture();
    fixture.manifest['fundingUrl'] = 'https://example.com/product';
    writeJson(join(fixture.root, 'manifest.json'), fixture.manifest);

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('fundingUrl');
  });

  it('rejects a missing lockfile', () => {
    const fixture = createFixture();
    unlinkSync(join(fixture.root, 'package-lock.json'));

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('package-lock.json');
  });

  it('rejects an unpinned Obsidian lint dependency', () => {
    const fixture = createFixture();
    fixture.packageJson.devDependencies['eslint-plugin-obsidianmd'] = '^0.4.1';
    writeJson(join(fixture.root, 'package.json'), fixture.packageJson);

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[tooling]');
    expect(result.stderr).toContain('eslint-plugin-obsidianmd');
  });

  it.each<[string, string]>([
    ['pinned lint package', 'eslint-plugin-obsidianmd@0.4.1'],
    ['canonical artifact lint command', 'npm run lint:artifacts'],
    [
      'exact Community release bundle',
      'contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`'
    ]
  ])('rejects missing %s guidance', (label, requiredText) => {
    const fixture = createFixture();
    const contributingPath = join(fixture.root, 'CONTRIBUTING.md');
    const guidance = readFileSync(contributingPath, 'utf8').replace(requiredText, '');
    writeFileSync(contributingPath, guidance);

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[tooling]');
    expect(result.stderr).toContain(label);
  });

  it('rejects release notes for a different version', () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.root, 'docs', 'releases', '1.2.3.md'),
      '# AI Transcriber 1.2.2\n'
    );

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[release]');
    expect(result.stderr).toContain('1.2.3');
  });
});
