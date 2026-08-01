# Documentation and Scan Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI Transcriber 0.11.1 documentation accurately describe current persistence and transcription behavior, and make the local/CI Community gate reject the stale-documentation patterns that the previous automated review missed.

**Architecture:** Extend the existing network-independent Community metadata verifier with narrow required and forbidden semantic invariants, backed by fixture-based Jest tests. Keep package scripts as the canonical local/CI scan configuration, preserve the hosted Developer Dashboard as an exact-pushed-commit gate, and fast-forward that same accepted commit into `main`.

**Tech Stack:** Node.js 20/22/24, ECMAScript modules, TypeScript 5.9, Jest 30 with ts-jest, ESLint 9, GitHub Actions, Obsidian Developer Dashboard.

## Global Constraints

- Do not change any file under `docs/screenshots/`.
- Do not change the English or Japanese README screenshot headings, tables, image links, captions, or surrounding descriptions.
- Do not launch Obsidian or install the candidate into any vault.
- Do not change runtime transcription, storage, networking, model, VAD, or UI behavior.
- Keep `eslint-plugin-obsidianmd` pinned exactly to `0.4.1` in `package.json` and `package-lock.json`.
- Keep all source and generated-artifact warnings fatal.
- Community release artifacts remain exactly `main.js`, `manifest.json`, and `styles.css`; do not add `fvad.wasm`.
- Do not claim local equivalence with Obsidian's private hosted analyzer.
- Do not create a tag, GitHub release, or Community Plugins submission.
- Use only synthetic text in tests; do not add real transcripts, vault paths, API keys, or user data.
- Integrate only an exact Developer Dashboard-scanned commit, using `git merge --ff-only`.

## File map

- `scripts/verify-community-metadata.mjs`: one deterministic verifier for metadata, bilingual README invariants, contributor guidance, and release-note alignment.
- `tests/community/CommunityMetadataVerifier.test.ts`: isolated temporary-repository fixtures and regression tests for every new invariant.
- `README.md`: corrected English and Japanese persistence, local-processing, selected-range, and troubleshooting text outside both screenshot sections.
- `AGENTS.md`: current repository layout, tab indentation, lint package, canonical artifact scan, and exact release bundle instructions.
- `CONTRIBUTING.md`: canonical local/CI gate contents and exact release-bundle boundary.
- `docs/releases/0.11.1.md`: complete 0.11.1 review and documentation-hardening summary.
- `docs/superpowers/plans/2026-08-01-obsidian-scorecard-0.11.1.md`: concise historical-status note for the completed earlier plan.
- `.github/workflows/quality.yml`: inspected, but no change expected because it already invokes `npm run check:community` on Node 20/22/24.
- `.github/workflows/release.yml`: inspected, but no change expected because it already invokes the canonical `npm run build:release` release gate.

---

### Task 1: Detect false README privacy and workflow claims

**Files:**
- Modify: `tests/community/CommunityMetadataVerifier.test.ts:12-134`
- Modify: `scripts/verify-community-metadata.mjs:12-124`

**Interfaces:**
- Consumes: complete `README.md` text from a repository root.
- Produces: required disclosure checks named by language and forbidden stale-guidance checks with `[disclosure]` failures.
- Preserves: `verifyCommunityMetadata(repositoryRoot = process.cwd())` and its `{ version }` return value.

- [ ] **Step 1: Re-check the repository documentation policies before coding**

Read these files without editing them:

```bash
sed -n '1,220p' obsidian-developer-docs/en/Home.md
sed -n '1,260p' "obsidian-developer-docs/en/Developer policies.md"
sed -n '1,320p' "obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md"
```

Expected: the Community release, disclosure, persistence, and screenshot-review rules are understood; no screenshot change is authorized by this plan.

- [ ] **Step 2: Expand the compliant README fixture**

Replace the inline `disclosures` array in `writeReadme` with a reusable function whose default text includes all old and new required statements:

```ts
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
```

- [ ] **Step 3: Write focused failing tests for missing bilingual semantics**

Add a table-driven test that removes one required sentence at a time:

```ts
it.each<[string, string]>([
  ['English plugin-data persistence', 'Plugin data stores settings, dictionaries, and up to 50 transcription-history items.'],
  ['Japanese plugin-data persistence', 'プラグインデータには、設定、辞書、最大50件の文字起こし履歴を保存します。'],
  ['Japanese WebCodecs fallback', 'ローカル処理したチャンクではWebCodecs Opusを使用し、失敗時は16 kHzモノラルWAVへフォールバックします。'],
  ['Japanese selected-range upload', '時間範囲を選択した場合、その処理範囲だけをアップロード用チャンクへエンコードします。']
])('rejects a missing %s disclosure', (label, sentence) => {
  const fixture = createFixture();
  writeReadme(fixture.root, compliantReadme().replace(sentence, ''));

  const result = run(fixture.root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('[disclosure]');
  expect(result.stderr).toContain(label);
});
```

- [ ] **Step 4: Write focused failing tests for obsolete guidance**

Add a second table for each stale concept rather than only the exact full paragraph:

```ts
it.each<[string, string]>([
  ['English no-persistence claim', 'No data is stored permanently by the plugin beyond the transcribed text'],
  ['Japanese no-persistence claim', 'プラグインによって文字起こしされたテキスト以外のデータは永続的に保存されません'],
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
```

- [ ] **Step 5: Run the focused suite and verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityMetadataVerifier.test.ts --runInBand
```

Expected: the new cases fail because the current verifier neither requires the new bilingual semantics nor rejects the stale claims.

- [ ] **Step 6: Add the minimum required and forbidden invariant tables**

Rename `DISCLOSURES` to `REQUIRED_README_STATEMENTS`, retain its existing entries, and append these stable patterns:

```js
const REQUIRED_README_STATEMENTS = [
  ['OpenAI account and API-key requirement', /OpenAI API account with API key/i],
  ['paid API use', /OpenAI API is a paid service/i],
  ['OpenAI network destination', /api\.openai\.com/i],
  ['audio transmission', /Audio data is sent to OpenAI for transcription/i],
  ['external-file handling', /Files selected outside the vault are copied/i],
  ['local secret storage', /saved only when Electron safeStorage is available/i],
  ['absence of telemetry', /No telemetry or usage data is collected/i],
  ['English plugin-data persistence', /Plugin data stores settings, dictionaries, and up to 50 transcription-history items/i],
  ['English local WebCodecs fallback', /Locally processed chunks use WebCodecs Opus[\s\S]*16 kHz mono WAV/i],
  ['English selected-range upload', /For a selected time range, only that processed range is encoded into upload chunks/i],
  ['Japanese plugin-data persistence', /プラグインデータには、設定、辞書、最大50件の文字起こし履歴を保存します/],
  ['Japanese WebCodecs fallback', /ローカル処理したチャンクでは[\s\S]*WebCodecs Opus[\s\S]*16 kHzモノラルWAV/],
  ['Japanese selected-range upload', /時間範囲を選択した場合、その処理範囲だけをアップロード用チャンクへエンコード/]
];

const FORBIDDEN_README_STATEMENTS = [
  ['English no-persistence claim', /No data is stored permanently by the plugin beyond the transcribed text/i],
  ['Japanese no-persistence claim', /プラグインによって文字起こしされたテキスト以外のデータは永続的に保存されません/],
  ['English recording workflow', /"Recording failed" error/i],
  ['Japanese recording workflow', /「録音に失敗しました」エラー/],
  ['English microphone permission', /microphone permissions/i],
  ['Japanese microphone permission', /マイクの権限/],
  ['English audio-format setting', /different audio format in settings/i],
  ['Japanese audio-format setting', /設定で別の音声形式を試す/]
];
```

After the required loop, add:

```js
for (const [label, pattern] of FORBIDDEN_README_STATEMENTS) {
  if (pattern.test(readme)) {
    fail('disclosure', `README contains obsolete ${label}.`);
  }
}
```

- [ ] **Step 7: Run the focused suite and verify GREEN**

Run the same Jest command from Step 5.

Expected: PASS, including the original metadata tests and all new bilingual/forbidden cases.

- [ ] **Step 8: Commit the verifier regression gate**

```bash
git add scripts/verify-community-metadata.mjs tests/community/CommunityMetadataVerifier.test.ts
git commit -m "test: detect stale Community documentation"
```

---

### Task 2: Correct README truth and Japanese parity

**Files:**
- Modify: `README.md:111-168`
- Modify: `README.md:317-372`

**Interfaces:**
- Consumes: storage fields in `PluginStateRepository`, `ProgressTracker`, and `UI_CONSTANTS.MAX_HISTORY_ITEMS` / `PREVIEW_LENGTH`.
- Produces: bilingual disclosure text accepted by Task 1's invariant patterns.
- Preserves: all content in `README.md:11-16` and `README.md:217-222` at the task baseline.

- [ ] **Step 1: Capture the authorized screenshot-section baseline**

Run these read-only commands and retain the two outputs for the task review:

```bash
git show HEAD:README.md | sed -n '/^## Screenshots$/,/^## Supported file formats$/p'
git show HEAD:README.md | sed -n '/^## スクリーンショット$/,/^## 対応ファイル形式$/p'
```

Expected: the current English and Japanese screenshot tables, which must remain byte-for-byte unchanged.

- [ ] **Step 2: Replace the false English persistence bullet**

Replace the final nested bullet under `OpenAI API` with:

```markdown
  - Plugin data stores settings, dictionaries, and up to 50 transcription-history items. History can include input/output file names and paths, status, timestamps, progress, provider, estimated cost, error details, and a transcript preview of up to 50 characters. Completed full transcripts are not retained as another copy in plugin data
```

Replace the final English privacy bullet with:

```markdown
- Completed transcription notes are saved to your local vault. Plugin data retains only the bounded history fields described above, including the short preview
```

- [ ] **Step 3: Remove the unsupported English recording workflow**

Delete exactly this troubleshooting block:

```markdown
**"Recording failed" error**
- Ensure your computer has microphone permissions
- Try using a different audio format in settings
```

- [ ] **Step 4: Correct Japanese persistence and processing disclosures**

Replace the false final OpenAI API nested bullet with:

```markdown
  - プラグインデータには、設定、辞書、最大50件の文字起こし履歴を保存します。履歴には入出力ファイル名とパス、状態、日時、進捗、プロバイダー、推定料金、エラー詳細、最大50文字の文字起こしプレビューが含まれる場合があります。完了した文字起こし全文を別のコピーとしてプラグインデータに保持することはありません
```

After the existing direct-upload paragraph, add:

```markdown
- ローカル処理したチャンクでは、現在のObsidianランタイムが対応している場合、音声専用WebMコンテナのWebCodecs Opusを使用します。機能検出、エンコード、コンテナ作成に失敗した場合は、APIリクエスト前に16 kHzモノラルWAVへフォールバックします
- 時間範囲を選択した場合、その処理範囲だけをアップロード用チャンクへエンコードし、元ファイル全体を範囲指定リクエストへ添付することはありません
```

Replace the final Japanese privacy bullet with:

```markdown
- 完了した文字起こしノートはローカルのVaultに保存します。プラグインデータに保持するのは、上記の件数制限付き履歴項目（短いプレビューを含む）だけです
```

- [ ] **Step 5: Remove the unsupported Japanese recording workflow**

Delete exactly this block:

```markdown
**「録音に失敗しました」エラー**
- PCにマイクの権限があることを確認
- 設定で別の音声形式を試す
```

- [ ] **Step 6: Verify the real README against the new scanner**

Run:

```bash
npm run verify:metadata
```

Expected: `Verified Community metadata 0.11.1.`

- [ ] **Step 7: Prove the screenshot sections and files are untouched**

Run:

```bash
git diff -- docs/screenshots
git diff --unified=0 HEAD -- README.md
```

Expected: the screenshot-file diff is empty, and README hunks occur only in Network Usage Disclosure / Privacy and Security / Troubleshooting and their Japanese equivalents. No hunk touches either screenshot table.

- [ ] **Step 8: Commit the bilingual README correction**

```bash
git add README.md
git commit -m "docs: align privacy disclosures with implementation"
```

---

### Task 3: Detect contributor and release guidance drift

**Files:**
- Modify: `tests/community/CommunityMetadataVerifier.test.ts`
- Modify: `scripts/verify-community-metadata.mjs`

**Interfaces:**
- Consumes: `package.json`, `AGENTS.md`, `CONTRIBUTING.md`, and `docs/releases/<manifest.version>.md`.
- Produces: `[tooling]` failures for lint/scan-contract drift and `[release]` failures for missing or mismatched release notes.
- Preserves: all Task 1 README checks and existing metadata checks.

- [ ] **Step 1: Add complete guidance and release-note fixtures**

Extend `Fixture` with `packageJson: Record<string, unknown>`. In `createFixture`, write:

```ts
const packageJson: Record<string, unknown> = {
  version: '1.2.3',
  scripts: {
    'lint:artifacts': 'eslint "build/**/*.js" --max-warnings=0'
  },
  devDependencies: {
    'eslint-plugin-obsidianmd': '0.4.1'
  }
};

writeJson(join(root, 'package.json'), packageJson);
writeFileSync(join(root, 'AGENTS.md'), [
  'Pin `eslint-plugin-obsidianmd@0.4.1` in local and CI scans.',
  'Run `npm run lint:artifacts` after the build.',
  'The Community release bundle contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`.'
].join('\n'));
writeFileSync(join(root, 'CONTRIBUTING.md'), 'Run `npm run check:community` locally and in CI.');
mkdirSync(join(root, 'docs', 'releases'), { recursive: true });
writeFileSync(join(root, 'docs', 'releases', '1.2.3.md'), '# AI Transcriber 1.2.3\n');
```

Return `{ root, manifest, packageJson }`.

- [ ] **Step 2: Write focused failing tooling-contract tests**

Add these cases:

```ts
it('rejects an unpinned Obsidian lint dependency', () => {
  const fixture = createFixture();
  const devDependencies = fixture.packageJson['devDependencies'] as Record<string, unknown>;
  devDependencies['eslint-plugin-obsidianmd'] = '^0.4.1';
  writeJson(join(fixture.root, 'package.json'), fixture.packageJson);

  const result = run(fixture.root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('[tooling]');
  expect(result.stderr).toContain('eslint-plugin-obsidianmd');
});

it.each<[string, string]>([
  ['pinned lint package', 'eslint-plugin-obsidianmd@0.4.1'],
  ['canonical artifact lint command', 'npm run lint:artifacts'],
  ['exact Community release bundle', 'contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`']
])('rejects missing %s guidance', (label, requiredText) => {
  const fixture = createFixture();
  const agentsPath = join(fixture.root, 'AGENTS.md');
  const guidance = readFileSync(agentsPath, 'utf8').replace(requiredText, '');
  writeFileSync(agentsPath, guidance);

  const result = run(fixture.root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('[tooling]');
  expect(result.stderr).toContain(label);
});
```

Add `readFileSync` to the existing `node:fs` test import.

- [ ] **Step 3: Write focused failing release-note tests**

Add:

```ts
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
```

- [ ] **Step 4: Run the focused suite and verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/community/CommunityMetadataVerifier.test.ts --runInBand
```

Expected: the new tooling and release-note cases fail because the current verifier reads neither guidance nor release notes.

- [ ] **Step 5: Generalize text-file reads and implement tooling checks**

Replace `readReadme` with:

```js
function readText(filePath, category) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(category, `Cannot read ${filePath}: ${message}`);
  }
}
```

After validating the lockfile, validate the pinned scanner and canonical commands:

```js
const lintPluginVersion = packageJson.devDependencies?.['eslint-plugin-obsidianmd'];
if (typeof lintPluginVersion !== 'string' || !SEMVER.test(lintPluginVersion)) {
  fail('tooling', 'eslint-plugin-obsidianmd must be pinned to an exact semantic version.');
}
if (typeof packageJson.scripts?.['lint:artifacts'] !== 'string') {
  fail('tooling', 'package.json must define the canonical lint:artifacts script.');
}

const agents = readText(path.join(root, 'AGENTS.md'), 'tooling');
const contributorRequirements = [
  ['pinned lint package', `eslint-plugin-obsidianmd@${lintPluginVersion}`],
  ['canonical artifact lint command', 'npm run lint:artifacts'],
  ['exact Community release bundle', 'contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`']
];
for (const [label, requiredText] of contributorRequirements) {
  if (!agents.includes(requiredText)) {
    fail('tooling', `AGENTS.md is missing ${label}.`);
  }
}

const contributing = readText(path.join(root, 'CONTRIBUTING.md'), 'tooling');
if (!contributing.includes('npm run check:community')) {
  fail('tooling', 'CONTRIBUTING.md must name npm run check:community as the canonical gate.');
}
```

- [ ] **Step 6: Implement release-note version alignment**

Before returning, add:

```js
const releaseNotesPath = path.join(root, 'docs', 'releases', `${manifestVersion}.md`);
const releaseNotes = readText(releaseNotesPath, 'release');
const expectedHeading = `# AI Transcriber ${manifestVersion}`;
if (!releaseNotes.split(/\r?\n/, 1).includes(expectedHeading)) {
  fail('release', `${releaseNotesPath} must start with ${expectedHeading}.`);
}
```

Use `readText(readmePath, 'disclosure')` for README loading.

- [ ] **Step 7: Run the focused suite and verify GREEN**

Run the same Jest command from Step 4.

Expected: PASS for original metadata tests, README regression tests, tooling-contract tests, and release-note alignment.

- [ ] **Step 8: Commit the contributor/release drift gate**

```bash
git add scripts/verify-community-metadata.mjs tests/community/CommunityMetadataVerifier.test.ts
git commit -m "test: enforce review configuration contracts"
```

---

### Task 4: Align contributor and 0.11.1 documentation

**Files:**
- Modify: `AGENTS.md:3-81`
- Modify: `CONTRIBUTING.md:5-33`
- Modify: `docs/releases/0.11.1.md:3-8`
- Modify: `docs/superpowers/plans/2026-08-01-obsidian-scorecard-0.11.1.md:1-12`

**Interfaces:**
- Consumes: `package.json` scripts/dependencies, `verify-community-release.mjs`, and current Git history.
- Produces: guidance accepted by Task 3's exact stable invariants.
- Preserves: the prior plan's original unchecked steps as a historical record.

- [ ] **Step 1: Correct repository structure, build, and style guidance**

Apply these factual replacements in `AGENTS.md`:

```markdown
- Repository root assets include `build/<version>/`, `manifest.json`, `package.json`, and `styles.css`.
- `tests/` mirrors source structure; temp/review artifacts belong in `tmp/`. Optional user-selected `fvad.wasm` is not a Community release artifact.
```

```markdown
- `npm run build:release` runs `npm run check:community` and verifies the exact Community release bundle under `build/<version>/release/`.
```

```markdown
- TypeScript uses tabs, explicit interfaces where useful, and PascalCase classes with the repository's existing file-naming conventions.
```

- [ ] **Step 2: Correct lint and release-bundle guidance**

Use these exact contract phrases so the verifier can detect drift:

```markdown
- Pin `eslint-plugin-obsidianmd@0.4.1` locally and in CI; ensure `eslint.config.mjs` loads it. Update configuration, `package.json`, and `package-lock.json` together when upgrading.
```

```markdown
- Run `npm run lint:artifacts` after `npm run build`; it scans generated JavaScript with zero warnings allowed.
```

```markdown
- The Community release bundle contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`.
```

Remove the contradictory instructions that `fvad.wasm` must be copied or bundled into the Community release.

- [ ] **Step 3: Make the canonical scan boundary explicit in CONTRIBUTING**

After the network-independent gate paragraph, add:

```markdown
`npm run check:community` is the canonical local and CI scan. It runs source lint, the strict build, metadata and release verification, generated-artifact lint through `npm run lint:artifacts`, test type-checking, compatibility and deployment tests, and the full coverage suite. `npm run build:release` invokes this same gate. The resulting Community release bundle contains exactly `main.js`, `manifest.json`, and `styles.css`; optional user-selected `fvad.wasm` is not bundled.
```

- [ ] **Step 4: Complete the 0.11.1 release summary**

Append these bullets under `## Changes` in `docs/releases/0.11.1.md`:

```markdown
- Corrected bilingual privacy, persistence, local-processing, and selected-range disclosures to match the shipped implementation
- Removed troubleshooting for recording and microphone workflows that the plugin does not provide
- Added deterministic checks for bilingual disclosure parity, obsolete guidance, scanner dependency pinning, and release-document alignment
```

- [ ] **Step 5: Mark the old execution plan as historical**

Immediately after the title in `docs/superpowers/plans/2026-08-01-obsidian-scorecard-0.11.1.md`, add:

```markdown
> **Status:** Historical plan. The implementation was completed and integrated into `main` as `b3c2da2` on 2026-08-01; unchecked boxes below preserve the original execution plan and do not represent current pending work.
```

- [ ] **Step 6: Run the real repository metadata and focused tests**

Run:

```bash
npm run verify:metadata
npm test -- --runTestsByPath tests/community/CommunityMetadataVerifier.test.ts --runInBand
```

Expected: metadata verification reports 0.11.1 and the focused suite passes.

- [ ] **Step 7: Review only the intended documentation changes**

Run:

```bash
git diff --check
git diff -- AGENTS.md CONTRIBUTING.md README.md docs/releases/0.11.1.md docs/superpowers/plans/2026-08-01-obsidian-scorecard-0.11.1.md
git diff -- docs/screenshots
```

Expected: no whitespace errors, factual changes match this plan, and the screenshot diff is empty.

- [ ] **Step 8: Commit the current guidance**

```bash
git add AGENTS.md CONTRIBUTING.md docs/releases/0.11.1.md docs/superpowers/plans/2026-08-01-obsidian-scorecard-0.11.1.md
git commit -m "docs: align 0.11.1 guidance with release"
```

---

### Task 5: Run the complete deterministic candidate gate

**Files:**
- Verify only; no expected source edit.

**Interfaces:**
- Consumes: the committed candidate and the canonical package scripts.
- Produces: fresh local evidence for the exact candidate that will be pushed.

- [ ] **Step 1: Run the canonical Community gate without vault deployment**

Run:

```bash
OBSIDIAN_PLUGINS_DIR= OBSIDIAN_DEPLOY_LOG= npm run check:community
```

Expected: source lint, strict build, metadata/release verification, artifact lint, test type-checking, dependency compatibility, deployment tests, all Jest suites, and coverage thresholds pass with exit code 0.

- [ ] **Step 2: Run the standalone long-form verifier tests**

Run:

```bash
npm run test:long-form:verifier
```

Expected: all Node test-runner cases pass.

- [ ] **Step 3: Run both dependency audits with real network results**

Run:

```bash
npm run audit:dependencies
npm run audit:production
```

Expected: both commands exit 0 with no high or critical vulnerability. A DNS, registry, or timeout failure is not a clean audit and must be retried with approved network access.

- [ ] **Step 4: Verify local first-party Markdown links**

Run this read-only Node check:

```bash
node --input-type=module <<'NODE'
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(candidate);
    }
    return entry.isFile() && candidate.endsWith('.md') ? [candidate] : [];
  });
}

const sources = ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', ...markdownFiles('docs')];
const missing = [];
for (const source of sources) {
  const markdown = readFileSync(source, 'utf8');
  const links = markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of links) {
    const raw = match[1].trim();
    const wrapped = raw.startsWith('<') && raw.includes('>')
      ? raw.slice(1, raw.indexOf('>'))
      : raw.split(/\s+["']/u, 1)[0];
    const target = wrapped.split('#', 1)[0];
    if (!target || /^(?:https?:|mailto:)/i.test(target)) {
      continue;
    }
    const resolved = path.resolve(path.dirname(source), decodeURIComponent(target));
    if (!existsSync(resolved)) {
      missing.push(`${source}: ${target}`);
    }
  }
}
if (missing.length > 0) {
  process.stderr.write(`${missing.join('\n')}\n`);
  process.exitCode = 1;
}
NODE
```

Expected: zero missing first-party link targets.

- [ ] **Step 5: Verify repository hygiene and the protected screenshot scope**

Run:

```bash
git diff --check main...HEAD
git diff --name-only main...HEAD -- docs/screenshots
git status --short --branch
```

Expected: no whitespace errors, no screenshot paths, and a clean feature branch.

Inspect README hunks with:

```bash
git diff --unified=0 main...HEAD -- README.md
```

Expected: no hunk touches either screenshot section.

- [ ] **Step 6: Inspect the release bundle directly**

Run:

```bash
find build/0.11.1/release -maxdepth 1 -type f -print | sort
```

Expected exactly:

```text
build/0.11.1/release/main.js
build/0.11.1/release/manifest.json
build/0.11.1/release/styles.css
```

No `fvad.wasm` or additional file may be present.

---

### Task 6: Push, scan, fast-forward, and remove the feature branch

**Files:**
- Git refs and hosted scan state only; no file edits after the candidate SHA is selected.

**Interfaces:**
- Consumes: clean `codex/docs-scan-0.11.1` HEAD with all Task 5 evidence passing.
- Produces: local and remote `main` at the exact hosted-scanned SHA, with no local or remote feature branch.

- [ ] **Step 1: Push the immutable candidate branch**

Run:

```bash
git push -u origin codex/docs-scan-0.11.1
git rev-parse HEAD
git ls-remote --heads origin codex/docs-scan-0.11.1
```

Expected: the local SHA and the remote feature-branch SHA are identical.

- [ ] **Step 2: Run the hosted exact-commit preview**

Open the authenticated Obsidian Developer Dashboard, select the GitHub repository and `codex/docs-scan-0.11.1`, and verify that the displayed commit equals the SHA from Step 1 before starting the preview.

Expected: the preview completes with no unresolved actionable warning. Record the exact SHA and result in the final release handoff. If the dashboard shows a different SHA, do not treat the result as candidate evidence.

- [ ] **Step 3: Repeat after any hosted finding**

If the preview finds an actionable issue, return to the feature branch, add a focused regression test where deterministic reproduction is possible, implement the smallest correction, rerun every affected Task 5 check, commit, push, and repeat Steps 1-2 for the new SHA. Never reuse the earlier preview result for a changed commit.

- [ ] **Step 4: Revalidate the integration base**

Run:

```bash
git status --short --branch
git fetch origin
git rev-parse main
git rev-parse origin/main
git merge-base --is-ancestor main codex/docs-scan-0.11.1
```

Expected: the worktree is clean, local and remote `main` match, and `main` is an ancestor of the scanned feature commit. Any divergence blocks integration.

- [ ] **Step 5: Fast-forward the scanned commit into main**

Run:

```bash
git switch main
git merge --ff-only codex/docs-scan-0.11.1
git push origin main
```

Expected: no merge commit is created and remote `main` advances to the scanned SHA.

- [ ] **Step 6: Verify local and remote main before cleanup**

Run:

```bash
git rev-parse main
git ls-remote --heads origin main
git status --short --branch
```

Expected: both SHAs equal the hosted-scanned candidate and the worktree is clean.

- [ ] **Step 7: Delete remote and local feature refs**

Run:

```bash
git push origin --delete codex/docs-scan-0.11.1
git branch -d codex/docs-scan-0.11.1
git branch --list codex/docs-scan-0.11.1
git ls-remote --heads origin codex/docs-scan-0.11.1
```

Expected: both final branch-list commands produce no feature-branch entry.

- [ ] **Step 8: Final handoff evidence**

Report the root cause, modified documentation and verifier coverage, exact test counts and command exit codes, release-bundle contents, dependency-audit results, hosted-scanned SHA/result, final local/remote `main` SHA, and confirmation that both feature refs were deleted. Explicitly state that screenshots and their README sections were not changed.
