import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Fixture {
  root: string;
  manifest: Record<string, unknown>;
}

const verifierPath = join(process.cwd(), 'scripts', 'verify-community-metadata.mjs');
const roots: string[] = [];

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeReadme(root: string, override = ''): void {
  const disclosures = [
    'OpenAI API account with API key.',
    'OpenAI API is a paid service.',
    'The plugin uses api.openai.com.',
    'Audio data is sent to OpenAI for transcription.',
    'Files selected outside the vault are copied to a plugin-owned temporary folder.',
    'API keys are saved only when Electron safeStorage is available.',
    'No telemetry or usage data is collected.'
  ].join('\n');
  writeFileSync(join(root, 'README.md'), override || disclosures);
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

  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeJson(join(root, 'manifest.json'), manifest);
  writeJson(join(root, 'package.json'), { version: '1.2.3' });
  writeJson(join(root, 'versions.json'), { '1.2.3': '1.8.7' });
  writeJson(join(root, 'package-lock.json'), { lockfileVersion: 3 });
  writeReadme(root);
  return { root, manifest };
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
});
