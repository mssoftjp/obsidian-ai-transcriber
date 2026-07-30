# Obsidian Community Scorecard Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve AI Transcriber's current Obsidian Community Health Excellent / Review Passed status by enforcing official lint, metadata/disclosure, release-artifact, CI, and production-dependency gates.

**Architecture:** Keep `eslint-plugin-obsidianmd@0.4.1` authoritative for source policy. Add dependency-free metadata and release verifiers, test their observable CLI behavior against isolated temporary repositories, then compose them with build, type-check, Jest, and artifact lint in one deterministic command reused by CI and releases.

**Tech Stack:** TypeScript 5.x, Jest 30 with ts-jest, ESLint 9, `eslint-plugin-obsidianmd@0.4.1`, Node.js 20/22/24, esbuild, GitHub Actions.

## Global Constraints

- Do not claim exact equivalence with Obsidian's private hosted scanner.
- Keep `eslint-plugin-obsidianmd` pinned exactly to `0.4.1`; all warnings fail.
- Add no runtime dependency or unofficial Obsidian runtime harness.
- Send no paid OpenAI request or private data from tests or CI.
- Preserve GPT Transcribe behavior, persistence, UI, and API payloads.
- Keep `isDesktopOnly: true`.
- The Community upload boundary contains exactly `main.js`, `manifest.json`, and `styles.css`.
- Keep deterministic checks network-independent; audit production dependencies separately.
- Do not use `npm audit fix --force`.
- Do not release, submit, or push.

## File map

- `scripts/verify-community-metadata.mjs`: cross-file manifest/version/disclosure verifier.
- `scripts/verify-community-release.mjs`: exact three-file release verifier.
- `tests/community/CommunityMetadataVerifier.test.ts`: metadata verifier CLI fixtures.
- `tests/community/CommunityReleaseVerifier.test.ts`: release verifier CLI fixtures.
- `eslint.config.mjs`: official source lint scopes and non-shipping ignores.
- `tsconfig.test.json`: explicit source/test TypeScript project.
- `package.json`: focused and composed quality commands.
- `package-lock.json`: non-breaking advisory remediation only.
- `.github/workflows/quality.yml`: Node.js 20/22/24 quality matrix and one audit job.
- `.github/workflows/release.yml`: verified release upload/attestation.
- `CONTRIBUTING.md`: contributor-facing gate instructions.

---

### Task 1: Make official lint and test type-check executable gates

**Files:**
- Modify: `eslint.config.mjs:84-92`
- Modify: `tsconfig.test.json:1-12`
- Modify: `package.json:7-22`

**Interfaces:**
- Produces: `npm run lint` with warnings forbidden and `npm run typecheck:test`.

- [ ] **Step 1: Verify current configuration failures**

Run:

```bash
npx --no-install eslint . --max-warnings=0
node --input-type=module -e "import ts from 'typescript'; const raw=ts.readConfigFile('tsconfig.test.json',ts.sys.readFile); const parsed=ts.parseJsonConfigFileContent(raw.config,ts.sys,process.cwd()); const included=parsed.fileNames.some((file)=>file.endsWith('tests/ApiSettingsTab.test.ts')); console.log('test-file-included='+included); process.exitCode=included?0:1;"
```

Expected: ESLint exits 2 while parsing tests without project information; the TypeScript probe prints `test-file-included=false` and exits 1.

Configuration files are the TDD exception for this task. Their observable behavior is exercised directly before and after the change; no source-text change-detector test is committed.

- [ ] **Step 2: Add explicit scopes and scripts**

Change the ignore block in `eslint.config.mjs` to:

```js
    ignores: [
      'node_modules/**',
      '*.config.mjs',
      'jest.config.js',
      'scripts/**',
      'docs/**',
      'tests/**',
      'coverage/**'
    ]
```

Add this top-level exclusion to `tsconfig.test.json`:

```json
  "exclude": [
    "node_modules",
    "build",
    "dist",
    "coverage",
    "to_delete*"
  ]
```

Set these `package.json` scripts:

```json
    "lint": "eslint \"src/**/*.ts\" package.json --max-warnings=0",
    "lint:fix": "eslint \"src/**/*.ts\" package.json --fix",
    "typecheck:test": "tsc --project tsconfig.test.json --noEmit",
```

- [ ] **Step 3: Verify corrected behavior**

Run:

```bash
npm run lint
npm run typecheck:test
npx --no-install eslint . --max-warnings=0
```

Expected: all commands exit 0 with no warnings; the test project checks the current 170 source/test files.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs tsconfig.test.json package.json
git commit -m "chore: enforce Community lint and test typing"
```

---

### Task 2: Add a tested Community metadata/disclosure verifier

**Files:**
- Create: `scripts/verify-community-metadata.mjs`
- Create: `tests/community/CommunityMetadataVerifier.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `verifyCommunityMetadata(root?: string): { version: string }`.
- CLI: `node scripts/verify-community-metadata.mjs [repository-root]`.

- [ ] **Step 1: Write failing CLI behavior tests**

Create `tests/community/CommunityMetadataVerifier.test.ts`:

```ts
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
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityMetadataVerifier.test.ts --runInBand
```

Expected: FAIL because the verifier CLI does not exist.

- [ ] **Step 3: Implement minimal metadata validation**

Create `scripts/verify-community-metadata.mjs`:

```js
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
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail('metadata', `Cannot read ${filePath}: ${message}`);
  }
}

export function verifyCommunityMetadata(repositoryRoot = process.cwd()) {
  const root = path.resolve(repositoryRoot);
  const manifest = readJson(path.join(root, 'manifest.json'));
  const packageJson = readJson(path.join(root, 'package.json'));
  const versions = readJson(path.join(root, 'versions.json'));

  if (!SEMVER.test(manifest.version ?? '')) {
    fail('metadata', `Expected semantic manifest version; found ${String(manifest.version)}.`);
  }
  if (packageJson.version !== manifest.version) {
    fail(
      'metadata',
      `package.json version ${String(packageJson.version)} does not match manifest ${manifest.version}.`
    );
  }
  if (versions[manifest.version] !== manifest.minAppVersion) {
    fail(
      'metadata',
      `versions.json[${manifest.version}] must equal minAppVersion ${String(manifest.minAppVersion)}.`
    );
  }
  if (
    manifest.id !== 'ai-transcriber'
    || !/^[a-z0-9-]+$/.test(manifest.id)
    || manifest.id.includes('obsidian')
  ) {
    fail('metadata', `Invalid plugin id: ${String(manifest.id)}.`);
  }
  if (
    typeof manifest.description !== 'string'
    || manifest.description.length > 250
    || !/^(Transcribe|Generate|Import|Sync|Open)\b/.test(manifest.description)
    || /^(This is|This plugin)\b/i.test(manifest.description)
    || !manifest.description.endsWith('.')
  ) {
    fail('metadata', `Invalid Community description: ${String(manifest.description)}.`);
  }
  if (!SEMVER.test(manifest.minAppVersion ?? '')) {
    fail('metadata', `Invalid minAppVersion: ${String(manifest.minAppVersion)}.`);
  }
  if (manifest.isDesktopOnly !== true) {
    fail('metadata', 'isDesktopOnly must remain true for Electron and desktop file access.');
  }

  let fundingUrl;
  try {
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
  const readme = readFileSync(readmePath, 'utf8');
  for (const [label, pattern] of DISCLOSURES) {
    if (!pattern.test(readme)) {
      fail('disclosure', `README is missing ${label}.`);
    }
  }

  return { version: manifest.version };
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
```

Add scripts:

```json
    "test:community": "jest tests/community --runInBand",
    "verify:metadata": "node scripts/verify-community-metadata.mjs",
```

- [ ] **Step 4: Verify GREEN on fixtures and repository**

Run:

```bash
npm run test:community
npm run verify:metadata
```

Expected: all fixture cases pass and the repository reports version 0.10.1.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-community-metadata.mjs tests/community/CommunityMetadataVerifier.test.ts package.json
git commit -m "test: verify Community metadata disclosures"
```

---

### Task 3: Add a tested exact release verifier

**Files:**
- Create: `scripts/verify-community-release.mjs`
- Create: `tests/community/CommunityReleaseVerifier.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `verifyCommunityRelease(root?: string): { version: string; releaseDir: string }`.
- CLI: `node scripts/verify-community-release.mjs [repository-root]`.

- [ ] **Step 1: Write failing release behavior tests**

Create `tests/community/CommunityReleaseVerifier.test.ts`:

```ts
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
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityReleaseVerifier.test.ts --runInBand
```

Expected: FAIL because the release verifier does not exist.

- [ ] **Step 3: Implement release verification**

Create `scripts/verify-community-release.mjs` with:

```js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMMUNITY_FILES = ['main.js', 'manifest.json', 'styles.css'];

function fail(category, message) {
  throw new Error(`[${category}] ${message}`);
}

export function verifyCommunityRelease(repositoryRoot = process.cwd()) {
  const root = path.resolve(repositoryRoot);
  const sourceManifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
  const releaseDir = path.join(root, 'build', manifest.version, 'release');

  let entries;
  try {
    entries = readdirSync(releaseDir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail('packaging', `Cannot read release directory ${releaseDir}: ${message}`);
  }

  const observed = entries.map((entry) => entry.name).sort();
  const expected = [...COMMUNITY_FILES].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    fail(
      'packaging',
      `Expected exactly ${expected.join(', ')}; found ${observed.join(', ') || '(empty)'}.`
    );
  }

  for (const name of expected) {
    const entry = entries.find((candidate) => candidate.name === name);
    const filePath = path.join(releaseDir, name);
    if (!entry?.isFile() || statSync(filePath).size === 0) {
      fail('packaging', `Expected regular non-empty file: ${filePath}.`);
    }
  }

  const builtManifestPath = path.join(releaseDir, 'manifest.json');
  if (!readFileSync(sourceManifestPath).equals(readFileSync(builtManifestPath))) {
    fail('metadata', `Built manifest does not match repository manifest: ${builtManifestPath}.`);
  }

  const mainPath = path.join(releaseDir, 'main.js');
  if (/[#@]\s*sourceMappingURL\s*=/.test(readFileSync(mainPath, 'utf8'))) {
    fail('packaging', `main.js contains a sourceMappingURL reference: ${mainPath}.`);
  }

  return { version: manifest.version, releaseDir };
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = verifyCommunityRelease(process.argv[2] ?? process.cwd());
    process.stdout.write(`Verified Community release ${result.version}: ${result.releaseDir}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
```

Add scripts:

```json
    "verify:release": "node scripts/verify-community-release.mjs",
    "verify:community": "npm run verify:metadata && npm run verify:release",
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run test:community
npm run build
npm run verify:community
```

Expected: all fixture tests pass; real metadata and exact versioned release pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-community-release.mjs tests/community/CommunityReleaseVerifier.test.ts package.json
git commit -m "test: verify Community release artifacts"
```

---

### Task 4: Compose the deterministic release gate

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `check:community`, `check`, `build:release`, `lint:artifacts`, and `audit:production`.

- [ ] **Step 1: Verify missing command behavior**

Run:

```bash
npm run check:community
```

Expected: npm exits non-zero because `check:community` is not defined.

This package-script composition is a configuration TDD exception authorized by the user's instruction to self-review the plan and proceed. Its observable command behavior is verified before and after editing; no exact-source test is committed.

- [ ] **Step 2: Add exact command composition**

Set:

```json
    "build:release": "npm run check:community",
    "lint:artifacts": "eslint \"build/**/*.js\" --max-warnings=0",
    "audit:production": "npm audit --omit=dev --audit-level=high",
    "check": "npm run check:community",
    "check:community": "npm run lint && npm run build && npm run verify:community && npm run lint:artifacts && npm run typecheck:test && npm test -- --runInBand --coverage"
```

- [ ] **Step 3: Verify the composed behavior**

Run:

```bash
npm run check:community
```

Expected: official lint, build, metadata/release verification, generated JS lint, test type-check, and all Jest suites/coverage pass.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: compose Community quality gate"
```

---

### Task 5: Reuse the gate in push/PR and release workflows

**Files:**
- Create: `.github/workflows/quality.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `check:community`, `audit:production`, and `build/<version>/release/*`.

GitHub Actions YAML is a configuration TDD exception. The commands it invokes are exercised locally, and the YAML is compared with Obsidian's current official sample without adding a source-text change-detector test or a new parser dependency.

- [ ] **Step 1: Add the current official Node.js matrix**

Create `.github/workflows/quality.yml`:

```yaml
name: Quality

on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [20.x, 22.x, 24.x]
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
      - name: Set up Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Run Community quality gate
        env:
          OBSIDIAN_PLUGINS_DIR: ''
          OBSIDIAN_DEPLOY_LOG: ''
        run: npm run check:community

  production-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24.x
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Audit production dependencies
        run: npm run audit:production
```

- [ ] **Step 2: Update tag release boundaries**

In `.github/workflows/release.yml`:

- use `actions/checkout@v6`, `actions/setup-node@v6`, Node `24.x`;
- retain tag/manifest equality validation;
- run `npm run build:release`;
- run `npm run audit:production`;
- run `npm run verify:community`;
- upload `"build/${version}/release/"*`;
- attest `build/${{ steps.manifest.outputs.version }}/release/*` with `actions/attest@v4`.

- [ ] **Step 3: Validate workflow commands locally**

Run:

```bash
npm run check:community
npm run audit:production
git diff --check -- .github/workflows/quality.yml .github/workflows/release.yml
```

Expected: both commands and whitespace validation pass. Compare both workflows line-by-line with the official sample versions already cited in the design. Do not dispatch or publish them.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/quality.yml .github/workflows/release.yml
git commit -m "ci: enforce Community quality gates"
```

---

### Task 6: Remediate safe advisories and document commands

**Files:**
- Modify: `package-lock.json`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Reproduce audit scope**

Run:

```bash
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

Expected: production exits 0; full audit exits 1 for current development-only `brace-expansion` and `fast-uri` findings.

- [ ] **Step 2: Apply non-breaking lockfile remediation**

Run:

```bash
npm audit fix --package-lock-only --ignore-scripts
git diff --exit-code -- package.json
npm ci
npm run audit:production
npm audit --audit-level=high
```

Expected: `package.json` stays unchanged and both audits pass. If the full audit remains blocked upstream, do not use `--force`; retain only a production-clean result and report the exact dev-only blocker.

- [ ] **Step 3: Update contributor instructions**

Document:

```markdown
1. Install exact dependencies with `npm ci`.
2. Run `npm run build` during development.
3. Run `npm run test:community` while changing metadata, disclosures, packaging, or workflows.
4. Run `npm run check:community` before a pull request.
5. Run `npm run audit:production` with network access before a release.

`npm run check:community` is intentionally network-independent. A network error during `npm run audit:production` is not a clean audit.
```

Keep existing privacy and `.env` guidance.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run check:community
npm run test:long-form:verifier
```

Then commit `package-lock.json` if changed plus `CONTRIBUTING.md`:

```bash
git add package-lock.json CONTRIBUTING.md
git commit -m "chore: refresh audited development dependencies"
```

---

### Task 7: Final policy and scope verification

**Files:**
- Inspect all Task 1-6 changes and the canonical October checklist.

- [ ] **Step 1: Re-read policy checklist**

```bash
sed -n '1,220p' /Users/hidetoshi/Documents/Projects/obsidian-ai-transcriber/public/obsidian-developer-docs/en/Obsidian\ October\ plugin\ self-critique\ checklist.md
```

- [ ] **Step 2: Run final deterministic and audit verification**

```bash
npm run check:community
npm run test:long-form:verifier
npm run audit:production
npm audit --audit-level=high
git diff --check main...HEAD
```

- [ ] **Step 3: Inspect exact scope**

```bash
git status --short --branch
git diff --stat main...HEAD
find build/0.10.1/release -maxdepth 1 -type f -print
```

Confirm exactly three release files, no runtime dependency addition, no GPT Transcribe behavior change during hardening, no private/generated data tracked, and no unrelated edit.

- [ ] **Step 4: Report without publishing**

Report commits, test counts, lint/type-check results, audit results, three release files, Node.js CI matrix, clean worktree, and that no paid request, release, submission, or push occurred.
