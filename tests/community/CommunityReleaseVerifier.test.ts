import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Fixture {
  root: string;
  releaseDir: string;
}

const verifierPath = join(process.cwd(), 'scripts', 'verify-community-release.mjs');
const roots: string[] = [];

function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'ai-transcriber-release-'));
  const releaseDir = join(root, 'build', '1.2.3', 'release');
  const manifest = '{"version":"1.2.3"}\n';

  roots.push(root);
  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(join(root, 'manifest.json'), manifest);
  writeFileSync(join(releaseDir, 'manifest.json'), manifest);
  writeFileSync(join(releaseDir, 'main.js'), "'use strict';\n");
  writeFileSync(join(releaseDir, 'styles.css'), '.ai-transcriber-test { display: block; }\n');
  return { root, releaseDir };
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

describe('Community release verifier', () => {
  it('accepts the exact three-file release', () => {
    const fixture = createFixture();
    const result = run(fixture.root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Verified Community release 1.2.3');
    expect(result.stderr).toBe('');
  });

  it('rejects a missing release directory', () => {
    const fixture = createFixture();
    rmSync(fixture.releaseDir, { recursive: true });

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cannot read release directory');
  });

  it('rejects an invalid manifest version before resolving the release path', () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.root, 'manifest.json'), '{"version":"../../outside"}\n');

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[metadata]');
    expect(result.stderr).toContain('Invalid manifest version');
  });

  it('rejects missing and extra release entries', () => {
    const missingFixture = createFixture();
    rmSync(join(missingFixture.releaseDir, 'styles.css'));
    const missing = run(missingFixture.root);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('Expected exactly');

    const extraFixture = createFixture();
    writeFileSync(join(extraFixture.releaseDir, 'fvad.wasm'), 'unexpected');
    const extra = run(extraFixture.root);
    expect(extra.status).toBe(1);
    expect(extra.stderr).toContain('fvad.wasm');
  });

  it('rejects an empty required file', () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, 'styles.css'), '');

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('regular non-empty file');
  });

  it('rejects a mismatched built manifest', () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, 'manifest.json'), '{"version":"1.2.4"}\n');

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match repository manifest');
  });

  it('rejects a source-map reference', () => {
    const fixture = createFixture();
    const mainPath = join(fixture.releaseDir, 'main.js');
    const main = readFileSync(mainPath, 'utf8');
    writeFileSync(mainPath, `${main}//# sourceMappingURL=main.js.map\n`);

    const result = run(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sourceMappingURL');
  });
});
