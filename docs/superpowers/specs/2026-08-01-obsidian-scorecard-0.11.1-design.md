# Obsidian Community scorecard 0.11.1 design

## Goal

Release-ready source for AI Transcriber 0.11.1 that resolves the hosted review warning, keeps the intentional vault media picker intact, aligns local and CI linting with Obsidian's current official sample configuration, and makes the remaining hosted preview scan an explicit release gate.

## Evidence and root cause

The public 0.11.0 scorecard reports one unnecessary type-assertion warning at `src/ui/ApiTranscriptionModal.ts` and one informational vault-enumeration disclosure.

The local gate already enables `@typescript-eslint/no-unnecessary-type-assertion`, but the local TypeScript program assigns the event parameter the type `Event`. Casting that value to `InputEvent` changes its static type, so the local rule considers the assertion meaningful. A clean probe using the current official sample's ESLint, TypeScript ESLint, `projectService`, Obsidian types, and Obsidian plugin configuration also did not report the hosted warning. The hosted analyzer therefore applies a rule or semantic model that is not reproduced by the published local configuration.

The repository's source-contract test is retrospective: it prevents exact assertions found by previous reviews but does not cover `as InputEvent`. It also deliberately protects `Vault#getFiles()` because the vault media picker is user-invoked functionality. The local gate can prevent the specific regression and align with the official configuration, but it must not claim byte-for-byte equivalence with Obsidian's unpublished hosted analyzer.

## Scope

- Replace the review-sensitive `InputEvent` assertion without changing time-field navigation behavior.
- Add behavioral tests for insertion, backward deletion, incomplete input, and generic input events.
- Align flat ESLint configuration and lint dependencies with the current official Obsidian sample while preserving the repository's stricter rules.
- Keep source and generated-artifact lint warnings fatal locally and in CI.
- Document the Obsidian Developer Dashboard preview scan as a required pre-release check.
- Bump all release metadata and release notes to 0.11.1.
- Run deterministic checks, dependency audits, repository hygiene checks, and push the completed feature branch.

## Non-goals

- Reverse-engineering or claiming exact equivalence with Obsidian's hosted scanner.
- Adding SonarQube or another speculative scanner that does not reproduce the hosted service.
- Removing the vault media picker or replacing documented `Vault#getFiles()` with an undocumented traversal to hide equivalent behavior.
- Publishing a GitHub release, creating a tag, or submitting 0.11.1 to the Community Plugins catalog.
- Changing transcription, storage, networking, privacy, or model-selection behavior.

## Design

### 1. Time-input navigation

Move the auto-advance decision into a small pure helper:

```ts
export function shouldAutoAdvanceTimeInput(
  event: Event,
  valueLength: number,
  maxLength: number
): boolean
```

The helper returns `true` only when the normalized value has reached `maxLength` and the event is not a backward deletion. It determines deletion structurally:

```ts
const isBackwardDelete =
  'inputType' in event && event.inputType === 'deleteContentBackward';
```

This works for events from Obsidian pop-out windows without relying on cross-window `instanceof`, requires no type assertion, and preserves the current generic-`Event` fallback. `APITranscriptionModal` calls the helper after normalizing the input and updating the hidden range fields.

The focused test uses real `Event` instances. For input metadata, it attaches the platform-defined `inputType` property to the event and asserts observable boolean decisions. It covers:

- a completed insertion advances;
- backward deletion never advances;
- an incomplete value never advances;
- a generic event at full length preserves the existing advance behavior.

### 2. Official lint configuration alignment

Use ESLint's supported flat-config helpers:

- `defineConfig` to compose and flatten configurations;
- `globalIgnores` for non-shipping files and generated coverage;
- the aggregate `typescript-eslint` package so parser and plugin cannot drift;
- `parserOptions.projectService: true` with the repository root as `tsconfigRootDir`;
- `eslint-plugin-obsidianmd.configs.recommendedWithLocalesEn` as the official Obsidian rule base;
- the existing repository-specific TypeScript, import, console, formatting, and locale rules as stricter overrides.

Remove direct `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` dependencies after migrating the config to the aggregate package. Pin the scanner-facing packages to the verified versions used for this change so local `npm ci` and CI load the same analyzer stack. Keep `eslint-plugin-obsidianmd` pinned exactly to `0.4.1`.

Keep the root Obsidian API type package at `1.13.0`. A verification probe with `1.13.1` fails the repository's required `skipLibCheck: false` build because that release declares `Menu`, `Modal`, and `PopoverSuggest` as `HistoryHandler` implementations without declaring `onHistoryBack`. Weakening library type checking would hide an upstream contract error and is not required for ESLint alignment; the analyzer packages remain on the current official-compatible versions.

The generated JavaScript override remains separate: it disables TypeScript and Obsidian source-only rules while keeping applicable base JavaScript checks. `npm run lint` and `npm run lint:artifacts` retain `--max-warnings=0`.

No source-text test will assert the exact ESLint configuration. The gate is its executable behavior: clean installation, source lint, build, and generated-artifact lint must all exit zero.

### 3. Vault enumeration decision

Keep `collectAudioFiles(vault)` implemented with the documented `Vault#getFiles()` API. It executes when the user opens the vault media picker and when a saved task must recover a moved audio file by name. Removing it would remove a supported workflow; walking the vault tree or private metadata structures would retain the same behavior while making the implementation less clear and less stable.

The existing behavioral test continues to prove that only supported audio/video files are returned. The informational hosted disclosure is accepted as an accurate description of intentional functionality, not suppressed or disguised.

### 4. Hosted preview release gate

`CONTRIBUTING.md` will distinguish two checks:

1. `npm run check:community` is the deterministic, network-independent local/CI gate.
2. After the candidate commit is available on GitHub, run the Obsidian Developer Dashboard preview scan against the exact branch, tag, or commit.

Any new hosted warning blocks release until fixed or explicitly documented as an intentional disclosure. The preview result must correspond to the exact candidate commit; a previous version's scorecard is not evidence for 0.11.1.

The hosted preview has no public repository API, so this step remains human-authenticated and cannot be honestly embedded in `npm run check:community`.

### 5. Version and release boundary

Set `manifest.json`, `package.json`, and the root entries in `package-lock.json` to `0.11.1`. Add `"0.11.1": "1.8.7"` to `versions.json` while retaining historical entries. Add `docs/releases/0.11.1.md` describing the review fix and scan alignment.

The build continues to generate and verify exactly `main.js`, `manifest.json`, and `styles.css` under `build/0.11.1/release/`. No tag or GitHub release is created by this implementation.

## Verification

The implementation is complete only when fresh commands show:

- focused time-input tests pass after first demonstrating the intended failure;
- `npm ci` succeeds from the committed lockfile;
- `npm run lint` exits with zero warnings;
- `npm run build` succeeds;
- `npm run verify:community` succeeds for 0.11.1;
- `npm run lint:artifacts` succeeds;
- `npm run typecheck:test` succeeds;
- dependency compatibility and local deployment tests pass;
- the full Jest suite and coverage thresholds pass;
- full and production dependency audits report no high/critical vulnerabilities;
- `git diff --check` and repository status show only the intended committed changes;
- the feature branch is pushed and its remote commit matches local `HEAD`.

The Obsidian Developer Dashboard preview remains the post-push, pre-release hosted verification. The final handoff must identify it explicitly rather than claiming the unpublished hosted scan ran locally.
