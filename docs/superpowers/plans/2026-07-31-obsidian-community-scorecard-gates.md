# Obsidian Community Scorecard Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic local and CI gates that preserve AI Transcriber's current Obsidian Community Health Excellent / Review Passed status while shipping GPT Transcribe support.

**Architecture:** Keep the official `eslint-plugin-obsidianmd@0.4.1` as the source-policy authority, and add focused cross-file contract tests for metadata and disclosures that source lint cannot prove. Build into a dedicated three-file Community release boundary, verify it with a dependency-free Node.js CLI, and reuse the same deterministic gate from pull-request and tag workflows; keep the network-dependent production audit separate.

**Tech Stack:** TypeScript 5.x, Jest 30 with ts-jest, ESLint 9, `eslint-plugin-obsidianmd@0.4.1`, Node.js 20/22/24, esbuild, GitHub Actions.

## Global Constraints

- Preserve the current public Health Excellent / Review Passed baseline; do not claim exact equivalence with Obsidian's private scanner.
- Keep `eslint-plugin-obsidianmd` pinned exactly to `0.4.1`.
- Treat all official lint warnings as failures.
- Add no runtime dependency and no unofficial Obsidian runtime test harness.
- Send no paid OpenAI request, audio, API key, prompt, transcript, or vault content from tests or CI.
- Preserve GPT Transcribe behavior, model defaults, persistence, API payloads, and all user-facing behavior.
- Keep `isDesktopOnly: true`; Electron and desktop file access remain intentional.
- The Community upload boundary contains exactly `main.js`, `manifest.json`, and `styles.css`.
- Keep deterministic local checks usable without network access; run `npm audit` as a separate network-dependent gate.
- Do not use `npm audit fix --force`.
- Do not publish a release, submit to Community Plugins, or push this branch.
- Re-check `obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md` before completion.

---

## File map

- `tests/community/CommunityToolingConfig.test.ts`: guards the official lint pin, warning policy, test TypeScript project, and composed quality commands.
- `tests/community/CommunityMetadata.test.ts`: guards manifest, version, lockfile, funding, and README disclosure contracts.
- `tests/community/CommunityReleaseVerifier.test.ts`: exercises the release verifier through its CLI using isolated temporary repositories.
- `tests/community/CommunityWorkflowContracts.test.ts`: guards Node.js CI coverage, deterministic checks, production audit, and the verified release upload boundary.
- `scripts/verify-community-release.mjs`: dependency-free CLI that verifies the exact Community release directory.
- `eslint.config.mjs`: keeps production Obsidian rules strict and explicitly excludes non-shipping tests, coverage, docs, and tooling.
- `tsconfig.test.json`: explicitly includes `src/**/*` and `tests/**/*` without inheriting the production test exclusion.
- `package.json`: exposes focused and composed quality commands.
- `package-lock.json`: records only safe, non-breaking advisory remediation.
- `.github/workflows/quality.yml`: runs deterministic checks on Node.js 20, 22, and 24 and audits production dependencies once.
- `.github/workflows/release.yml`: reuses the Community gate and uploads/attests only the verified release directory.
- `CONTRIBUTING.md`: documents the deterministic Community check and separate network audit.

---

### Task 1: Enforce official lint warnings and type-check the test project

**Files:**
- Create: `tests/community/CommunityToolingConfig.test.ts`
- Modify: `eslint.config.mjs:84-92`
- Modify: `tsconfig.test.json:1-12`
- Modify: `package.json:7-20`

**Interfaces:**
- Consumes: `eslint-plugin-obsidianmd@0.4.1`, `tsconfig.json`, and the existing `src/**/*.ts` production project.
- Produces: `npm run lint` with zero-warning enforcement and `npm run typecheck:test` for all source, tests, and mocks.

- [ ] **Step 1: Write the failing tooling-contract test**

Create `tests/community/CommunityToolingConfig.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageJson {
  scripts: Record<string, string | undefined>;
  devDependencies: Record<string, string | undefined>;
}

interface TypeScriptConfig {
  include?: string[];
  exclude?: string[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as T;
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Community tooling contracts', () => {
  const packageJson = readJson<PackageJson>('package.json');
  const testConfig = readJson<TypeScriptConfig>('tsconfig.test.json');

  it('pins the official Obsidian ESLint plugin and rejects warnings', () => {
    expect(packageJson.devDependencies['eslint-plugin-obsidianmd']).toBe('0.4.1');
    expect(packageJson.scripts['lint']).toBe(
      'eslint "src/**/*.ts" package.json --max-warnings=0'
    );
  });

  it('keeps non-shipping files outside the Obsidian source-rule pass', () => {
    const config = source('eslint.config.mjs');

    expect(config).toContain("'tests/**'");
    expect(config).toContain("'coverage/**'");
    expect(config).toContain("'jest.config.js'");
  });

  it('type-checks tests in an explicit TypeScript project', () => {
    expect(testConfig.include).toEqual(
      expect.arrayContaining(['src/**/*', 'tests/**/*'])
    );
    expect(testConfig.exclude).toBeDefined();
    expect(testConfig.exclude).not.toContain('tests/**/*');
    expect(packageJson.scripts['typecheck:test']).toBe(
      'tsc --project tsconfig.test.json --noEmit'
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityToolingConfig.test.ts --runInBand
```

Expected: FAIL because `lint` lacks `package.json` and `--max-warnings=0`, the ignore entries are absent, `tsconfig.test.json` has no explicit `exclude`, and `typecheck:test` is undefined.

- [ ] **Step 3: Add the explicit lint and test-project configuration**

In the global ignore block of `eslint.config.mjs`, use:

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

In `tsconfig.test.json`, retain the existing compiler options and include list, then add:

```json
  "exclude": [
    "node_modules",
    "build",
    "dist",
    "coverage",
    "to_delete*"
  ]
```

In `package.json`, replace the lint scripts and add the test type-check:

```json
    "lint": "eslint \"src/**/*.ts\" package.json --max-warnings=0",
    "lint:fix": "eslint \"src/**/*.ts\" package.json --fix",
    "typecheck:test": "tsc --project tsconfig.test.json --noEmit",
```

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityToolingConfig.test.ts --runInBand
npm run lint
npm run typecheck:test
```

Expected: the focused suite passes, official lint reports zero errors and zero warnings, and TypeScript checks all 170 current source/test files with zero diagnostics.

- [ ] **Step 5: Commit the lint and type-check gate**

```bash
git add tests/community/CommunityToolingConfig.test.ts eslint.config.mjs tsconfig.test.json package.json
git commit -m "test: enforce Community lint and test typing"
```

---

### Task 2: Add Community metadata and disclosure contracts

**Files:**
- Create: `tests/community/CommunityMetadata.test.ts`
- Modify: `package.json:7-23`

**Interfaces:**
- Consumes: `manifest.json`, `package.json`, `versions.json`, `README.md`, and `package-lock.json`.
- Produces: `npm run test:community`, initially covering all suites under `tests/community/` and automatically including later Community suites.

- [ ] **Step 1: Write the failing metadata/disclosure suite**

Create `tests/community/CommunityMetadata.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Manifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  fundingUrl?: string;
  isDesktopOnly: boolean;
}

interface PackageJson {
  version: string;
  scripts: Record<string, string | undefined>;
}

type Versions = Record<string, string | undefined>;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as T;
}

describe('Obsidian Community metadata contracts', () => {
  const manifest = readJson<Manifest>('manifest.json');
  const packageJson = readJson<PackageJson>('package.json');
  const versions = readJson<Versions>('versions.json');
  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

  it('keeps current version metadata aligned', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.version).toBe(manifest.version);
    expect(Object.prototype.hasOwnProperty.call(versions, manifest.version)).toBe(true);
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });

  it('keeps the manifest within Community submission requirements', () => {
    expect(manifest.id).toBe('ai-transcriber');
    expect(manifest.id).toMatch(/^[a-z0-9-]+$/);
    expect(manifest.id).not.toContain('obsidian');
    expect(manifest.name).toBe('AI Transcriber');
    expect(manifest.author).toBe('Musashino Software');
    expect(manifest.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description.length).toBeLessThanOrEqual(250);
    expect(manifest.description).toMatch(/^(Transcribe|Generate|Import|Sync|Open)\b/);
    expect(manifest.description).not.toMatch(/^(This is|This plugin)\b/i);
    expect(manifest.description).toMatch(/\.$/);
    expect(manifest.isDesktopOnly).toBe(true);
  });

  it('uses fundingUrl only for a recognized support destination', () => {
    expect(manifest.fundingUrl).toBeDefined();

    const fundingUrl = new URL(manifest.fundingUrl ?? '');
    expect(fundingUrl.protocol).toBe('https:');
    expect(['buymeacoffee.com', 'github.com', 'ko-fi.com', 'patreon.com'])
      .toContain(fundingUrl.hostname);
  });

  it.each([
    [/OpenAI API account with API key/i, 'OpenAI account and API-key requirement'],
    [/OpenAI API is a paid service/i, 'paid API use'],
    [/api\.openai\.com/i, 'OpenAI network destination'],
    [/Audio data is sent to OpenAI for transcription/i, 'audio transmission'],
    [/Files selected outside the vault are copied/i, 'external-file handling'],
    [/saved only when Electron safeStorage is available/i, 'local secret storage'],
    [/No telemetry or usage data is collected/i, 'absence of telemetry']
  ])('discloses %s', (pattern) => {
    expect(readme).toMatch(pattern);
  });

  it('keeps a committed npm lockfile and a focused Community test command', () => {
    expect(existsSync(join(process.cwd(), 'package-lock.json'))).toBe(true);
    expect(packageJson.scripts['test:community']).toBe(
      'jest tests/community --runInBand'
    );
  });
});
```

- [ ] **Step 2: Run the suite and verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityMetadata.test.ts --runInBand
```

Expected: all current metadata/disclosure assertions pass, but the final assertion fails because `test:community` is undefined.

- [ ] **Step 3: Add the focused Community test command**

Add to `package.json` scripts:

```json
    "test:community": "jest tests/community --runInBand",
```

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
npm run test:community
```

Expected: `CommunityToolingConfig.test.ts` and `CommunityMetadata.test.ts` both pass without network access.

- [ ] **Step 5: Commit the metadata contracts**

```bash
git add tests/community/CommunityMetadata.test.ts package.json
git commit -m "test: guard Community metadata disclosures"
```

---

### Task 3: Verify the exact three-file Community release boundary

**Files:**
- Create: `scripts/verify-community-release.mjs`
- Create: `tests/community/CommunityReleaseVerifier.test.ts`
- Modify: `tests/community/CommunityToolingConfig.test.ts`
- Modify: `package.json:7-25`

**Interfaces:**
- Consumes: an optional repository root argument and `<root>/manifest.json`.
- Produces: `verifyCommunityRelease(repositoryRoot: string): { version: string; releaseDir: string }` and CLI command `node scripts/verify-community-release.mjs [repository-root]`.

- [ ] **Step 1: Extend the tooling contract before adding the verifier**

Add this test to `tests/community/CommunityToolingConfig.test.ts`:

```ts
  it('exposes the deterministic Community release verifier', () => {
    expect(packageJson.scripts['verify:community']).toBe(
      'node scripts/verify-community-release.mjs'
    );
  });
```

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

const verifierPath = join(
  process.cwd(),
  'scripts',
  'verify-community-release.mjs'
);
const fixtureRoots: string[] = [];

function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'ai-transcriber-community-'));
  const releaseDir = join(root, 'build', '1.2.3', 'release');
  const manifest = '{"version":"1.2.3"}\n';

  fixtureRoots.push(root);
  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(join(root, 'manifest.json'), manifest);
  writeFileSync(join(releaseDir, 'manifest.json'), manifest);
  writeFileSync(join(releaseDir, 'main.js'), "'use strict';\n");
  writeFileSync(
    join(releaseDir, 'styles.css'),
    '.ai-transcriber-test { display: block; }\n'
  );

  return { root, releaseDir };
}

function runVerifier(root: string) {
  return spawnSync(process.execPath, [verifierPath, root], {
    encoding: 'utf8'
  });
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    const root = fixtureRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('Community release verifier', () => {
  it('accepts the exact three-file release', () => {
    const fixture = createFixture();
    const result = runVerifier(fixture.root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Verified Community release 1.2.3');
    expect(result.stderr).toBe('');
  });

  it('rejects a missing release directory', () => {
    const fixture = createFixture();
    rmSync(fixture.releaseDir, { recursive: true });

    const result = runVerifier(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cannot read release directory');
  });

  it('rejects missing and extra release entries', () => {
    const missingFixture = createFixture();
    rmSync(join(missingFixture.releaseDir, 'styles.css'));

    const missing = runVerifier(missingFixture.root);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('Expected exactly');

    const extraFixture = createFixture();
    writeFileSync(join(extraFixture.releaseDir, 'fvad.wasm'), 'unexpected');

    const extra = runVerifier(extraFixture.root);
    expect(extra.status).toBe(1);
    expect(extra.stderr).toContain('fvad.wasm');
  });

  it('rejects an empty required file', () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, 'styles.css'), '');

    const result = runVerifier(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('regular non-empty file');
  });

  it('rejects a built manifest that differs from the repository manifest', () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.releaseDir, 'manifest.json'),
      '{"version":"1.2.4"}\n'
    );

    const result = runVerifier(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match repository manifest');
  });

  it('rejects a source-map reference in main.js', () => {
    const fixture = createFixture();
    const mainPath = join(fixture.releaseDir, 'main.js');
    const main = readFileSync(mainPath, 'utf8');
    writeFileSync(mainPath, `${main}//# sourceMappingURL=main.js.map\n`);

    const result = runVerifier(fixture.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sourceMappingURL');
  });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm run test:community
```

Expected: FAIL because `verify:community` is undefined and the verifier CLI file does not exist; the release-verifier success test observes a non-zero process status.

- [ ] **Step 3: Implement the dependency-free verifier**

Create `scripts/verify-community-release.mjs`:

```js
import {
  readFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMMUNITY_FILES = ['main.js', 'manifest.json', 'styles.css'];

function fail(category, message) {
  throw new Error(`[${category}] ${message}`);
}

function readManifest(manifestPath) {
  let manifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail('metadata', `Cannot read ${manifestPath}: ${message}`);
  }

  if (
    typeof manifest !== 'object'
    || manifest === null
    || typeof manifest.version !== 'string'
    || !/^\d+\.\d+\.\d+$/.test(manifest.version)
  ) {
    fail('metadata', `Expected a semantic version in ${manifestPath}.`);
  }

  return manifest;
}

export function verifyCommunityRelease(repositoryRoot = process.cwd()) {
  const root = path.resolve(repositoryRoot);
  const sourceManifestPath = path.join(root, 'manifest.json');
  const manifest = readManifest(sourceManifestPath);
  const releaseDir = path.join(root, 'build', manifest.version, 'release');

  let entries;
  try {
    entries = readdirSync(releaseDir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail('packaging', `Cannot read release directory ${releaseDir}: ${message}`);
  }

  const observedNames = entries.map((entry) => entry.name).sort();
  const expectedNames = [...COMMUNITY_FILES].sort();

  if (JSON.stringify(observedNames) !== JSON.stringify(expectedNames)) {
    fail(
      'packaging',
      `Expected exactly ${expectedNames.join(', ')}; found ${observedNames.join(', ') || '(empty)'}.`
    );
  }

  for (const expectedName of expectedNames) {
    const entry = entries.find((candidate) => candidate.name === expectedName);
    const filePath = path.join(releaseDir, expectedName);

    if (!entry?.isFile() || statSync(filePath).size === 0) {
      fail('packaging', `Expected regular non-empty file: ${filePath}.`);
    }
  }

  const sourceManifest = readFileSync(sourceManifestPath);
  const builtManifestPath = path.join(releaseDir, 'manifest.json');
  const builtManifest = readFileSync(builtManifestPath);

  if (!sourceManifest.equals(builtManifest)) {
    fail(
      'metadata',
      `Built manifest does not match repository manifest: ${builtManifestPath}.`
    );
  }

  const mainPath = path.join(releaseDir, 'main.js');
  const main = readFileSync(mainPath, 'utf8');
  if (/[#@]\s*sourceMappingURL\s*=/.test(main)) {
    fail('packaging', `main.js contains a sourceMappingURL reference: ${mainPath}.`);
  }

  return { version: manifest.version, releaseDir };
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = verifyCommunityRelease(process.argv[2] ?? process.cwd());
    process.stdout.write(
      `Verified Community release ${result.version}: ${result.releaseDir}\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
```

Add to `package.json` scripts:

```json
    "verify:community": "node scripts/verify-community-release.mjs",
```

- [ ] **Step 4: Run focused tests and the real production verifier**

Run:

```bash
npm run test:community
npm run build
npm run verify:community
```

Expected: all Community suites pass; the production build succeeds; the verifier reports version 0.10.1 and the versioned `release/` directory.

- [ ] **Step 5: Commit the release verifier**

```bash
git add scripts/verify-community-release.mjs tests/community/CommunityReleaseVerifier.test.ts tests/community/CommunityToolingConfig.test.ts package.json
git commit -m "test: verify Community release artifacts"
```

---

### Task 4: Compose one deterministic Community quality gate

**Files:**
- Modify: `tests/community/CommunityToolingConfig.test.ts`
- Modify: `package.json:7-30`

**Interfaces:**
- Consumes: `lint`, `build`, `verify:community`, `lint:artifacts`, `typecheck:test`, and Jest.
- Produces: `check:community` as the deterministic release gate, `check` as its developer alias, `build:release` as its release alias, and separate `audit:production`.

- [ ] **Step 1: Add failing command-composition assertions**

Append these tests to `tests/community/CommunityToolingConfig.test.ts`:

```ts
  it('lints generated JavaScript only after a build', () => {
    expect(packageJson.scripts['lint:artifacts']).toBe(
      'eslint "build/**/*.js" --max-warnings=0'
    );
  });

  it('composes one deterministic Community gate', () => {
    expect(packageJson.scripts['check:community']).toBe(
      'npm run lint && npm run build && npm run verify:community && '
      + 'npm run lint:artifacts && npm run typecheck:test && '
      + 'npm test -- --runInBand --coverage'
    );
    expect(packageJson.scripts['check']).toBe('npm run check:community');
    expect(packageJson.scripts['build:release']).toBe('npm run check:community');
  });

  it('keeps the production audit separate from deterministic checks', () => {
    expect(packageJson.scripts['audit:production']).toBe(
      'npm audit --omit=dev --audit-level=high'
    );
    expect(packageJson.scripts['check:community']).not.toContain('audit');
  });
```

- [ ] **Step 2: Run the tooling suite and verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityToolingConfig.test.ts --runInBand
```

Expected: FAIL because `lint:artifacts`, `check:community`, and `audit:production` are absent and the existing `check`/`build:release` commands do not match.

- [ ] **Step 3: Compose the package scripts**

Set the relevant `package.json` scripts to:

```json
    "build:release": "npm run check:community",
    "lint:artifacts": "eslint \"build/**/*.js\" --max-warnings=0",
    "audit:production": "npm audit --omit=dev --audit-level=high",
    "check": "npm run check:community",
    "check:community": "npm run lint && npm run build && npm run verify:community && npm run lint:artifacts && npm run typecheck:test && npm test -- --runInBand --coverage"
```

Keep all focused test and long-form scripts unchanged.

- [ ] **Step 4: Run the composed gate and verify GREEN**

Run:

```bash
npm run check:community
```

Expected: official source lint passes with zero warnings; build and exact release verification pass; generated JavaScript lint passes; test TypeScript passes; all Jest suites pass with coverage.

- [ ] **Step 5: Commit the composed gate**

```bash
git add tests/community/CommunityToolingConfig.test.ts package.json
git commit -m "chore: compose Community quality gate"
```

---

### Task 5: Run the gate on pushes, pull requests, and tag releases

**Files:**
- Create: `tests/community/CommunityWorkflowContracts.test.ts`
- Create: `.github/workflows/quality.yml`
- Modify: `.github/workflows/release.yml:1-85`

**Interfaces:**
- Consumes: `npm run check:community`, `npm run audit:production`, and `build/<version>/release/*`.
- Produces: Node.js 20/22/24 quality matrix, one production-audit job, and a tag release that uploads and attests only verified files.

- [ ] **Step 1: Write failing workflow contracts**

Create `tests/community/CommunityWorkflowContracts.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Community workflow contracts', () => {
  it('runs deterministic checks on the official sample Node.js matrix', () => {
    const quality = source('.github/workflows/quality.yml');

    expect(quality).toContain("branches: ['**']");
    expect(quality).toContain('node-version: [20.x, 22.x, 24.x]');
    expect(quality).toContain('uses: actions/checkout@v6');
    expect(quality).toContain('uses: actions/setup-node@v6');
    expect(quality).toContain('run: npm run check:community');
  });

  it('runs the production audit once outside the compatibility matrix', () => {
    const quality = source('.github/workflows/quality.yml');
    const auditCommands = quality.match(/run: npm run audit:production/g) ?? [];

    expect(quality).toContain('production-audit:');
    expect(auditCommands).toHaveLength(1);
  });

  it('reuses the gate and verified release directory for tags', () => {
    const release = source('.github/workflows/release.yml');

    expect(release).toContain('uses: actions/checkout@v6');
    expect(release).toContain('uses: actions/setup-node@v6');
    expect(release).toContain('run: npm run build:release');
    expect(release).toContain('run: npm run audit:production');
    expect(release).toContain('run: npm run verify:community');
    expect(release).toContain('"build/${version}/release/"*');
    expect(release).toContain('build/${{ steps.manifest.outputs.version }}/release/*');
    expect(release).not.toContain('"build/${version}/main.js"');
  });
});
```

- [ ] **Step 2: Run the workflow suite and verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityWorkflowContracts.test.ts --runInBand
```

Expected: FAIL with `ENOENT` for `.github/workflows/quality.yml`.

- [ ] **Step 3: Add the push and pull-request quality workflow**

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

- [ ] **Step 4: Reuse the verified directory from the release workflow**

In `.github/workflows/release.yml`:

- update `actions/checkout` and `actions/setup-node` to `@v6`;
- set release Node.js to `24.x`;
- add `run: npm run audit:production` after `build:release`;
- replace the shell presence checks with `run: npm run verify:community`;
- upload `"build/${version}/release/"*`;
- replace `actions/attest-build-provenance@v2` with `actions/attest@v4`;
- attest `build/${{ steps.manifest.outputs.version }}/release/*`.

The resulting build/audit/verify/upload section must be:

```yaml
      - name: Build release artifacts
        env:
          OBSIDIAN_PLUGINS_DIR: ''
          OBSIDIAN_DEPLOY_LOG: ''
        run: npm run build:release

      - name: Audit production dependencies
        run: npm run audit:production

      - name: Verify release artifacts
        run: npm run verify:community

      - name: Create or update GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          version="${{ steps.manifest.outputs.version }}"
          tag="${GITHUB_REF_NAME}"
          previous_tag="$(git tag --sort=-v:refname | grep -v "^${tag}$" | head -n 1 || true)"
          if [ -n "${previous_tag}" ]; then
            notes="**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/${previous_tag}...${tag}"
          else
            notes="**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/commits/${tag}"
          fi
          if ! gh release view "${tag}" >/dev/null 2>&1; then
            gh release create "${tag}" --title "${tag}" --notes "${notes}"
          fi
          gh release upload "${tag}" "build/${version}/release/"* --clobber

      - name: Attest release artifacts
        uses: actions/attest@v4
        with:
          subject-path: build/${{ steps.manifest.outputs.version }}/release/*
```

- [ ] **Step 5: Run workflow and repository verification**

Run:

```bash
npm run test:community
npm run check:community
```

Expected: all Community workflow contracts and the complete deterministic gate pass. No workflow is dispatched locally and no release is created.

- [ ] **Step 6: Commit the workflows**

```bash
git add tests/community/CommunityWorkflowContracts.test.ts .github/workflows/quality.yml .github/workflows/release.yml
git commit -m "ci: enforce Community quality gates"
```

---

### Task 6: Remediate safe dependency advisories and document the gate

**Files:**
- Modify: `package-lock.json`
- Modify: `CONTRIBUTING.md:5-25`

**Interfaces:**
- Consumes: npm's advisory endpoint and the deterministic `check:community` command.
- Produces: a production audit with zero high/critical findings, a best-effort clean development audit without forced upgrades, and contributor instructions for both checks.

- [ ] **Step 1: Reproduce the audit boundary before modifying the lockfile**

Run:

```bash
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

Expected: the production-only command exits 0 with zero vulnerabilities; the full command exits 1 with the current `brace-expansion` and `fast-uri` high-severity development findings.

- [ ] **Step 2: Apply only npm's non-breaking lockfile remediation**

Run:

```bash
npm audit fix --package-lock-only --ignore-scripts
git diff --exit-code -- package.json
npm ci
```

Expected: npm updates only `package-lock.json`; `package.json` has no diff; `npm ci` installs the revised lock successfully. Do not run a forced audit fix.

- [ ] **Step 3: Verify both dependency scopes**

Run:

```bash
npm run audit:production
npm audit --audit-level=high
```

Expected: both commands exit 0. If the full development audit still fails because the fixed version is unavailable within declared non-breaking ranges, stop dependency remediation, do not use `--force`, and report the exact upstream-only finding while continuing to require a clean production audit.

- [ ] **Step 4: Document deterministic and network-dependent checks**

Replace the numbered development setup checks in `CONTRIBUTING.md` with:

```markdown
1. Install exact dependencies with `npm ci`.
2. Run `npm run build` to type-check and build the plugin during development.
3. Run `npm run test:community` while changing manifest, disclosures, packaging, or workflows.
4. Run `npm run check:community` before opening a pull request. This deterministic gate runs official Obsidian lint, production and test type-checks, the production build, release-artifact verification, generated-artifact lint, and the complete Jest suite.
5. Run `npm run audit:production` with network access before preparing a release.
```

Add this paragraph below the setup list:

```markdown
`npm run check:community` is intentionally network-independent. A network error during `npm run audit:production` is not a clean audit and must be resolved before release.
```

Keep the existing `.env`, test-data, pull-request, and privacy guidance unchanged.

- [ ] **Step 5: Run the complete gate after dependency remediation**

Run:

```bash
npm run check:community
npm run test:long-form:verifier
```

Expected: all deterministic checks pass, including all existing and new tests; the dependency-free long-form verifier tests also pass.

- [ ] **Step 6: Commit dependency and contributor updates**

If `package-lock.json` changed and both audits pass:

```bash
git add package-lock.json CONTRIBUTING.md
git commit -m "chore: refresh audited development dependencies"
```

If npm made no lockfile change, commit only the documentation:

```bash
git add CONTRIBUTING.md
git commit -m "docs: document Community release checks"
```

---

### Task 7: Full Obsidian policy and scope verification

**Files:**
- Inspect: all files changed by Tasks 1-6
- Inspect: `obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md`
- Inspect: `docs/superpowers/specs/2026-07-31-obsidian-community-scorecard-gates-design.md`

**Interfaces:**
- Consumes: the complete Community quality-gate implementation.
- Produces: fresh completion evidence, a clean worktree, and no external publication.

- [ ] **Step 1: Re-read the Obsidian checklist from the canonical checkout**

Run:

```bash
sed -n '1,220p' /Users/hidetoshi/Documents/Projects/obsidian-ai-transcriber/public/obsidian-developer-docs/en/Obsidian\ October\ plugin\ self-critique\ checklist.md
```

Expected: confirm no new default hotkey, global app access, inline style, Node/mobile mismatch, telemetry, undisclosed network use, unpinned lockfile, or release artifact was introduced.

- [ ] **Step 2: Run final deterministic verification**

Run:

```bash
npm run check:community
npm run test:long-form:verifier
git diff --check main...HEAD
```

Expected: every command exits 0; Jest reports no failed suites/tests; the release verifier reports the current manifest version; `git diff --check` produces no output.

- [ ] **Step 3: Run final dependency verification**

Run:

```bash
npm run audit:production
npm audit --audit-level=high
```

Expected: production audit exits 0 with zero high/critical findings. The full audit also exits 0 after the safe lockfile update; if an upstream development-only blocker remains, report it separately and do not represent it as a shipped vulnerability.

- [ ] **Step 4: Inspect scope and generated boundaries**

Run:

```bash
git status --short --branch
git diff --stat main...HEAD
git diff main...HEAD -- package.json package-lock.json eslint.config.mjs tsconfig.test.json tests/community scripts/verify-community-release.mjs .github/workflows CONTRIBUTING.md
find build/0.10.1/release -maxdepth 1 -type f -print
```

Confirm:

- the release directory lists exactly `main.js`, `manifest.json`, and `styles.css`;
- no root `main.js`, source map, `fvad.wasm`, `.env`, log, transcript, audio, or vault data is tracked;
- no runtime dependency was added;
- no GPT Transcribe request, model, storage, or UI behavior changed in this hardening phase;
- no unrelated file is modified or staged.

- [ ] **Step 5: Report completion without publishing**

Report:

- design and plan commits;
- implementation commits and files;
- official lint version and zero-warning result;
- production/test TypeScript result;
- final Jest suite/test counts;
- exact release artifact list;
- production and full audit results;
- Node.js CI matrix;
- current worktree status;
- that no paid API request, release, submission, or push occurred.
