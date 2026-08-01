# Obsidian Community Scorecard 0.11.1 Implementation Plan

> **Status:** Historical plan. The implementation was completed and integrated into `main` as `b3c2da2` on 2026-08-01; unchecked boxes below preserve the original execution plan and do not represent current pending work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 0.11.0 hosted review warning, align the executable lint stack with Obsidian's current official sample, preserve intentional vault media discovery, and prepare a verified 0.11.1 branch for push.

**Architecture:** Isolate the cross-analyzer event decision in a pure structural-narrowing helper consumed by the modal. Compose the official Obsidian flat config through ESLint's current helpers and one TypeScript ESLint package, while retaining strict repository overrides and the generated-artifact pass. Keep the hosted Developer Dashboard preview as an explicit post-push release gate because the hosted analyzer is not public.

**Tech Stack:** TypeScript 5.9, Jest 30 with ts-jest, ESLint 9 flat config, typescript-eslint 8, `eslint-plugin-obsidianmd@0.4.1`, Node.js 20/22/24, esbuild, GitHub Actions.

**Execution note:** The user approved inline execution through commit and push. Multi-agent delegation is disabled for this task, so use `superpowers:executing-plans` in this dedicated feature branch.

## Global Constraints

- Keep `eslint-plugin-obsidianmd` pinned exactly to `0.4.1`; all source and artifact warnings fail.
- Do not claim exact equivalence with Obsidian's private hosted scanner.
- Preserve the user-invoked vault media picker and documented `Vault#getFiles()` implementation.
- Do not add a runtime dependency, network request, telemetry, or paid OpenAI test.
- Keep `isDesktopOnly: true` and `minAppVersion: 1.8.7`.
- Community release artifacts remain exactly `main.js`, `manifest.json`, and `styles.css`.
- Do not create a tag or GitHub release; push only the implementation branch.

## File map

- `src/ui/TimeInputNavigation.ts`: structural event decision for time-field auto-advance.
- `tests/ui/TimeInputNavigation.test.ts`: behavioral regression coverage for insertion/deletion/length branches.
- `src/ui/ApiTranscriptionModal.ts`: consumes the decision helper in the existing input listener.
- `eslint.config.mjs`: official flat-config composition plus project-specific strict rules.
- `package.json`: pinned scanner toolchain and 0.11.1 metadata.
- `package-lock.json`: deterministic dependency graph and 0.11.1 root metadata.
- `CONTRIBUTING.md`: exact local and hosted pre-release gates.
- `manifest.json`, `versions.json`: Community version metadata.
- `docs/releases/0.11.1.md`: release-facing change summary.
- `docs/superpowers/specs/2026-08-01-obsidian-scorecard-0.11.1-design.md`: approved implementation contract.

---

### Task 1: Remove the hosted type-assertion warning with behavioral coverage

**Files:**
- Create: `tests/ui/TimeInputNavigation.test.ts`
- Create: `src/ui/TimeInputNavigation.ts`
- Modify: `src/ui/ApiTranscriptionModal.ts:1380-1400`

**Interfaces:**
- Produces: `shouldAutoAdvanceTimeInput(event: Event, valueLength: number, maxLength: number): boolean`.
- Consumes: browser/Obsidian `Event` objects without `instanceof` or type assertions.

- [ ] **Step 1: Write the failing behavioral test**

Create a table-driven suite with hand-derived outcomes:

```ts
import { shouldAutoAdvanceTimeInput } from '../../src/ui/TimeInputNavigation';

function inputEvent(inputType: string): Event {
  return Object.assign(new Event('input'), { inputType });
}

it.each<[string, Event, number, number, boolean]>([
  ['completed insertion', inputEvent('insertText'), 2, 2, true],
  ['backward deletion', inputEvent('deleteContentBackward'), 2, 2, false],
  ['incomplete insertion', inputEvent('insertText'), 1, 2, false],
  ['generic event', new Event('input'), 2, 2, true]
])('%s => %s', (_name, event, valueLength, maxLength, expected) => {
  expect(shouldAutoAdvanceTimeInput(event, valueLength, maxLength)).toBe(expected);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --runTestsByPath tests/ui/TimeInputNavigation.test.ts --runInBand
```

Expected: FAIL because `src/ui/TimeInputNavigation.ts` does not exist.

- [ ] **Step 3: Implement the minimum structural decision**

Create:

```ts
export function shouldAutoAdvanceTimeInput(
  event: Event,
  valueLength: number,
  maxLength: number
): boolean {
  const isBackwardDelete =
    'inputType' in event && event.inputType === 'deleteContentBackward';
  return valueLength === maxLength && !isBackwardDelete;
}
```

Import it into `ApiTranscriptionModal.ts` and replace the assertion-based condition with:

```ts
if (shouldAutoAdvanceTimeInput(e, value.length, maxLength)) {
```

- [ ] **Step 4: Verify GREEN and lint the changed source**

Run:

```bash
npm test -- --runTestsByPath tests/ui/TimeInputNavigation.test.ts --runInBand
npx eslint src/ui/TimeInputNavigation.ts src/ui/ApiTranscriptionModal.ts --max-warnings=0
```

Expected: both commands exit 0 with no warnings.

- [ ] **Step 5: Commit the behavior slice**

```bash
git add src/ui/TimeInputNavigation.ts src/ui/ApiTranscriptionModal.ts tests/ui/TimeInputNavigation.test.ts
git commit -m "fix: avoid review-sensitive input assertion"
```

---

### Task 2: Align the local and CI analyzer stack with the official sample

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `npm run lint` and `npm run lint:artifacts` using one locked analyzer graph.
- Consumes: `eslint-plugin-obsidianmd.configs.recommendedWithLocalesEn`, repository `tsconfig.json`, and generated `build/**/*.js`.

- [ ] **Step 1: Record the existing executable mismatch**

Run:

```bash
npm ls --depth=0 @eslint/js eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser typescript-eslint globals obsidian typescript eslint-plugin-obsidianmd
npx eslint --print-config src/ui/ApiTranscriptionModal.ts
```

Expected: direct parser/plugin packages and the aggregate TypeScript ESLint package are all present at the older 8.46 line; the config uses `parserOptions.project` rather than `projectService`.

- [ ] **Step 2: Update only scanner-facing development dependencies**

Use the current published versions verified against the official sample, keep `eslint-plugin-obsidianmd@0.4.1` exact, and remove the two redundant direct TypeScript ESLint packages:

```bash
npm uninstall --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install --save-dev --save-exact @eslint/js@9.39.4 eslint@9.39.4 globals@17.6.0 typescript-eslint@8.59.1 obsidian@1.13.0 typescript@5.9.3 eslint-plugin-obsidianmd@0.4.1
```

The root Obsidian API package deliberately remains `1.13.0`: `1.13.1` fails this repository's strict `skipLibCheck: false` build because its `HistoryHandler` implementers omit the required `onHistoryBack` declaration. Do not weaken TypeScript library checking to adopt it. If any scanner package version is unavailable, stop and update this plan/spec before continuing; do not silently substitute a version.

- [ ] **Step 3: Migrate flat-config composition**

Import:

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
```

Replace the hand-written `flattenConfigs`/`expandConfig` machinery with `defineConfig(...)`, use `globalIgnores(...)`, set the parser to `tseslint.parser`, load `tseslint.plugin`, and set:

```js
parserOptions: {
  projectService: true,
  tsconfigRootDir: import.meta.dirname ?? process.cwd(),
  sourceType: 'module',
  ecmaVersion: 2022
}
```

Preserve every repository-specific rule, locale exception, global, ignore, and generated-artifact override.

- [ ] **Step 4: Verify the clean analyzer graph and executable gates**

Run:

```bash
npm ls --depth=0 @eslint/js eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser typescript-eslint globals obsidian typescript eslint-plugin-obsidianmd
npm run lint
npm run build
npm run lint:artifacts
```

Expected: the direct parser/plugin entries are absent at the root, the aggregate package is 8.59.1, the official Obsidian plugin is 0.4.1, the root Obsidian API package is the strict-build-compatible 1.13.0, and every gate exits 0 with no warnings.

- [ ] **Step 5: Prove a clean install uses the committed graph**

Run:

```bash
npm ci
npm run lint
```

Expected: installation and lint exit 0, including the committed `brace-expansion` compatibility patch.

- [ ] **Step 6: Commit the scanner slice**

```bash
git add eslint.config.mjs package.json package-lock.json
git commit -m "chore: align Obsidian review lint stack"
```

---

### Task 3: Prepare the 0.11.1 release boundary and hosted preview gate

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `versions.json`
- Modify: `CONTRIBUTING.md`
- Create: `docs/releases/0.11.1.md`

**Interfaces:**
- Produces: consistent Community metadata for version 0.11.1 and a contributor-facing hosted preview requirement.
- Consumes: `scripts/verify-community-metadata.mjs` and `scripts/verify-community-release.mjs`.

- [ ] **Step 1: Demonstrate the version contract failure**

Change `manifest.json` to `0.11.1` first, then run:

```bash
npm run verify:metadata
```

Expected: FAIL because `package.json` is still 0.11.0.

- [ ] **Step 2: Complete the 0.11.1 metadata set**

Set the package and lockfile root versions to 0.11.1 and add:

```json
"0.11.1": "1.8.7"
```

to `versions.json` without removing `0.11.0`.

- [ ] **Step 3: Document release changes and preview scan**

Add release notes stating that 0.11.1:

- removes the review-sensitive event assertion while preserving time navigation;
- aligns local/CI lint configuration with the current official sample;
- retains the intentional user-invoked vault picker.

Add a `Hosted review preview` section to `CONTRIBUTING.md` requiring a Developer Dashboard preview for the exact candidate commit after push and before tag/release. State that `check:community` does not reproduce the unpublished hosted analyzer.

- [ ] **Step 4: Verify the metadata and release artifact boundary**

Run:

```bash
npm run build
npm run verify:metadata
npm run verify:release
```

Expected: all commands exit 0 and the verifier reports 0.11.1 with exactly the three permitted release files.

- [ ] **Step 5: Commit the release slice**

```bash
git add manifest.json package.json package-lock.json versions.json CONTRIBUTING.md docs/releases/0.11.1.md
git commit -m "chore: prepare 0.11.1 review release"
```

---

### Task 4: Verify, self-review, and publish the branch

**Files:**
- Modify only files required to fix a failure caused by Tasks 1-3.

**Interfaces:**
- Produces: fresh local evidence and a remote branch whose commit equals local `HEAD`.

- [ ] **Step 1: Run the deterministic Community gate**

```bash
OBSIDIAN_PLUGINS_DIR= OBSIDIAN_DEPLOY_LOG= npm run check:community
```

Expected: lint, build, release verification, artifact lint, production/test typing, compatibility tests, local deploy tests, all Jest suites, and coverage thresholds pass.

- [ ] **Step 2: Run network-dependent dependency audits**

```bash
npm run audit:dependencies
npm run audit:production
```

Expected: both commands exit 0 with no high or critical vulnerability.

- [ ] **Step 3: Re-check repository policy and diff hygiene**

Re-read `obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md`, then run:

```bash
git diff --check main...HEAD
git status --short
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Expected: no whitespace errors or uncommitted changes; commits contain only the approved design, helper/test, scanner configuration, version metadata, contributor guidance, and release notes.

- [ ] **Step 4: Push the dedicated branch**

```bash
git push --set-upstream origin codex/scorecard-scan-0.11.1
```

- [ ] **Step 5: Verify remote equality**

```bash
git fetch origin codex/scorecard-scan-0.11.1
git rev-parse HEAD
git rev-parse origin/codex/scorecard-scan-0.11.1
```

Expected: both hashes are identical. Report the post-push Developer Dashboard preview scan as the only remaining pre-release hosted step.
