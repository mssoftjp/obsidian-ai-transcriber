# Obsidian Audit Type Warning Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the source-code type warnings reported for release 0.10.0 while preserving the user-invoked vault media picker and all runtime behavior.

**Architecture:** Keep documented Obsidian APIs and existing data flows. Remove audit-sensitive explicit unions by narrowing the already-`TFile` selection contract and representing absent UI state without imported-type unions; remove redundant assertions by tightening boundaries and relying on existing predicates. A source-contract Jest suite reproduces the audit findings locally and protects the intentional `Vault#getFiles()` use.

**Tech Stack:** TypeScript 5.9, Obsidian API 1.13.0, Jest 30 with ts-jest, ESLint 9 with typescript-eslint.

## Global Constraints

- Preserve the Vault audio/video picker and its documented `Vault#getFiles()` implementation.
- Do not change persisted state versions, serialized fields, API endpoints, response behavior, or external-file cleanup behavior.
- Keep TypeScript strict flags enabled, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Do not add dependencies, use `any`, restore undocumented metadata-cache APIs, or push Git changes.
- Re-check `obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md` after implementation.

## File map

- `tests/ObsidianAuditWarnings.test.ts`: source-contract regression coverage for the exact audit warning shapes and the intentional vault enumeration.
- `src/ApiSettingsTab.ts`: output-folder component holder.
- `src/main-api.ts`: `TFile`-only selection callback.
- `src/ui/ApiTranscriptionModal.ts`: optional button state and output-folder component holder.
- `src/ui/AudioFileSelectionModal.ts`: `TFile`-only callback and optional modal state.
- `src/ui/TranscriptionView.ts`: recovered-file holder and inferred metadata-cache result.
- `src/config/ModelOptions.ts`: structurally checked model literals.
- `src/infrastructure/api/ApiClient.ts`: one generic conversion at the response boundary.
- `src/infrastructure/storage/PluginStateRepository.ts`: record-based legacy input and assertion-free dictionary objects.
- `src/infrastructure/storage/SafeStorageService.ts`: Electron renderer type supplied by the existing predicate.

---

### Task 1: Remove audit-sensitive Obsidian type unions

**Files:**
- Create: `tests/ObsidianAuditWarnings.test.ts`
- Modify: `src/ApiSettingsTab.ts:189-222`
- Modify: `src/main-api.ts:294-307`
- Modify: `src/ui/ApiTranscriptionModal.ts:58, 349-351, 408-410, 446-448, 993-1022`
- Modify: `src/ui/AudioFileSelectionModal.ts:12-31, 42-72, 161-170, 331-336`
- Modify: `src/ui/TranscriptionView.ts:9, 493-529`

**Interfaces:**
- Consumes: `TempFileManager.copyExternalFile(file, onProgress): Promise<{ tFile: TFile; sessionId: string }>`.
- Produces: `AudioFileSelectionModal` constructor callback `(file: TFile, isExternal: boolean, tempSessionId?: string) => void`.
- Preserves: `collectAudioFiles(vault: Vault): TFile[]` implemented with `vault.getFiles()`.

- [ ] **Step 1: Write the failing source-contract test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
	return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Obsidian audit source contracts', () => {
	it.each([
		['src/ApiSettingsTab.ts', 'TextComponent | null'],
		['src/main-api.ts', 'TFile | File'],
		['src/ui/ApiTranscriptionModal.ts', 'ButtonComponent | null'],
		['src/ui/ApiTranscriptionModal.ts', 'TextComponent | null'],
		['src/ui/AudioFileSelectionModal.ts', 'TFile | null'],
		['src/ui/AudioFileSelectionModal.ts', 'TFile | File'],
		['src/ui/AudioFileSelectionModal.ts', 'ButtonComponent | null'],
		['src/ui/TranscriptionView.ts', 'TFile | null'],
		['src/ui/TranscriptionView.ts', 'CachedMetadata | null']
	])('avoids audit-sensitive union %s: %s', (path, union) => {
		expect(source(path)).not.toContain(union);
	});

	it('keeps deliberate vault enumeration in the user-invoked media picker', () => {
		expect(source('src/ui/AudioFileCollection.ts')).toContain('vault.getFiles()');
	});
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --runTestsByPath tests/ObsidianAuditWarnings.test.ts --runInBand`

Expected: FAIL on the listed explicit unions while the `Vault#getFiles()` preservation assertion passes.

- [ ] **Step 3: Narrow the selection callback and represent absent state without imported-type unions**

Apply these exact shapes:

```ts
// src/ApiSettingsTab.ts
const outputFolderState: { component?: TextComponent } = {};
// assign/read as outputFolderState.component

// src/main-api.ts
(file: TFile, isExternal: boolean, tempSessionId?: string) => {
	this.transcribeAudioFile(file, isExternal, tempSessionId);
}

// src/ui/ApiTranscriptionModal.ts
private transcribeBtn?: ButtonComponent;
// replace `!== null` checks with truthy checks
const folderTextState: { component?: TextComponent } = {};

// src/ui/AudioFileSelectionModal.ts
private selectedFile?: TFile;
private onFileSelect: (file: TFile, isExternal: boolean, tempSessionId?: string) => void;
private okButton?: ButtonComponent;
private fileSuggest?: AudioFileSuggest;
// assign `undefined`, not `null`, during onClose cleanup

// src/ui/TranscriptionView.ts
const recoveredAudio: { file?: TFile } = {};
// assign/read as recoveredAudio.file
const cache = this.app.metadataCache.getFileCache(file);
```

Remove the now-unused `CachedMetadata` type import. Do not alter callback timing, selection confirmation, recovery order, notices, sorting, filtering, or `collectAudioFiles()`.

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
npm test -- --runTestsByPath tests/ObsidianAuditWarnings.test.ts tests/ui/AudioFileSelectionModal.test.ts tests/infrastructure/storage/TempFileManager.test.ts --runInBand
npm run build
```

Expected: all focused suites pass and TypeScript/build exits 0.

- [ ] **Step 5: Commit the union cleanup**

```bash
git add tests/ObsidianAuditWarnings.test.ts src/ApiSettingsTab.ts src/main-api.ts src/ui/ApiTranscriptionModal.ts src/ui/AudioFileSelectionModal.ts src/ui/TranscriptionView.ts
git commit -m "fix: remove audit-sensitive Obsidian type unions"
```

---

### Task 2: Remove unnecessary type assertions

**Files:**
- Modify: `tests/ObsidianAuditWarnings.test.ts`
- Modify: `src/config/ModelOptions.ts:17-34`
- Modify: `src/infrastructure/api/ApiClient.ts:257-267`
- Modify: `src/infrastructure/storage/PluginStateRepository.ts:160-168, 250-275, 324-332`
- Modify: `src/infrastructure/storage/SafeStorageService.ts:6, 26-32`

**Interfaces:**
- Consumes: `isElectronWindow(window)` predicate that narrows `window.require` to `(moduleName: string) => ElectronRenderer`.
- Produces: unchanged `MODEL_OPTIONS`, `ApiClient` generic request methods, `PluginStateRepository.initialize()`, and `SafeStorageService` public methods.

- [ ] **Step 1: Extend the source-contract test with assertion cases**

```ts
	it.each([
		['src/config/ModelOptions.ts', 'as TranscriptionModel'],
		['src/infrastructure/api/ApiClient.ts', 'response.text as unknown as T'],
		['src/infrastructure/storage/PluginStateRepository.ts', 'raw as Partial<APITranscriptionSettings>'],
		['src/infrastructure/storage/PluginStateRepository.ts', '} as DictionaryEntry'],
		['src/infrastructure/storage/PluginStateRepository.ts', 'raw as Record<string, unknown>'],
		['src/infrastructure/storage/SafeStorageService.ts', "window.require('electron') as ElectronRenderer"]
	])('does not restore unnecessary assertion %s: %s', (path, assertion) => {
		expect(source(path)).not.toContain(assertion);
	});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --runTestsByPath tests/ObsidianAuditWarnings.test.ts --runInBand`

Expected: FAIL for every assertion pattern added in Step 1.

- [ ] **Step 3: Replace assertions with checked boundaries**

Use these implementations:

```ts
// src/config/ModelOptions.ts
export const MODEL_OPTIONS = [
	{ value: MODEL_NAMES.GPT4O, model: MODEL_NAMES.GPT4O },
	{ value: MODEL_NAMES.GPT4O_MINI, model: MODEL_NAMES.GPT4O_MINI },
	{ value: MODEL_NAMES.WHISPER, model: MODEL_NAMES.WHISPER },
	{ value: MODEL_NAMES.WHISPER_TS, model: MODEL_NAMES.WHISPER_TS }
] satisfies ModelOption[];

// src/infrastructure/api/ApiClient.ts
const responseData: unknown = contentType?.includes('application/json')
	? response.json
	: response.text;
return responseData as T;

// src/infrastructure/storage/PluginStateRepository.ts
// after isRecord(raw):
this.state = this.createStateFromLegacy(raw);

// normalizeDictionaryEntry():
const from = Array.isArray(fromValue)
	? fromValue.filter((value): value is string => typeof value === 'string')
	: typeof fromValue === 'string'
		? fromValue.split(',').map(value => value.trim()).filter(Boolean)
		: [];
const normalizedEntry: DictionaryEntry = {
	...entry,
	from,
	to: toValue
};
return normalizedEntry;

private createStateFromLegacy(raw: Record<string, unknown>): PluginState {
	const state = getDefaultState();
	const userDictionaries = raw['userDictionaries'];
	state.settings.data = normalizeStoredSettings(raw);
	if (userDictionaries) {
		state.dictionaries.languages = this.migrateDictionaryFormat(
			this.ensureAllLanguages(userDictionaries)
		);
	}
	return state;
}

// src/infrastructure/storage/SafeStorageService.ts
const electron = window.require('electron');
```

Keep the `ElectronRenderer` type import because the safe-storage property and return types still use it. Preserve the API payload conversion contract and all state-normalization branches.

- [ ] **Step 4: Run focused verification and verify GREEN**

Run:

```bash
npm test -- --runTestsByPath tests/ObsidianAuditWarnings.test.ts tests/infrastructure/api/ApiClient.test.ts tests/infrastructure/storage/PluginStateRepository.test.ts tests/infrastructure/storage/SafeStorageService.test.ts --runInBand
npm run lint
npm run build
```

Expected: all focused suites pass; lint and build exit 0.

- [ ] **Step 5: Commit the assertion cleanup**

```bash
git add tests/ObsidianAuditWarnings.test.ts src/config/ModelOptions.ts src/infrastructure/api/ApiClient.ts src/infrastructure/storage/PluginStateRepository.ts src/infrastructure/storage/SafeStorageService.ts
git commit -m "fix: remove redundant audit assertions"
```

---

### Task 3: Full regression and Obsidian policy verification

**Files:**
- Inspect: all files changed by Tasks 1 and 2
- Inspect: `obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md`

**Interfaces:**
- Consumes: the complete implementation from Tasks 1 and 2.
- Produces: fresh verification evidence and a clean, reviewable Git diff. No release, push, or external submission.

- [ ] **Step 1: Run the repository checks**

```bash
npm run lint
npm run build
npm test -- --runInBand
npx eslint "build/**/*.js"
git diff --check HEAD~2..HEAD
```

Expected: every command exits 0, Jest reports zero failed suites/tests, and `git diff --check` produces no output.

- [ ] **Step 2: Verify the audit rules explicitly**

```bash
npx eslint "src/**/*.ts" --rule '@typescript-eslint/no-redundant-type-constituents: warn' --rule '@typescript-eslint/no-unnecessary-type-assertion: warn'
npm test -- --runTestsByPath tests/ObsidianAuditWarnings.test.ts --runInBand
```

Expected: ESLint reports no warnings and the source-contract suite passes.

- [ ] **Step 3: Inspect scope and policy compliance**

Run:

```bash
git status --short
git diff HEAD~2..HEAD -- src tests eslint.config.mjs package.json package-lock.json
```

Confirm all of the following from the diff and checklist:

- `AudioFileCollection.ts` still calls `vault.getFiles()` only for the existing user-invoked picker and recovery flow.
- No persisted schema, manifest, dependency, command, hotkey, CSS, network, or lifecycle behavior changed.
- No `any`, private Obsidian API, global `app`, inline style, `console.log`, or default hotkey was introduced.
- No generated binary, temporary store, or unrelated file is staged.

- [ ] **Step 4: Report exact verification results**

Report the commits, files changed, commands run, test counts, the intentionally retained Vault Enumeration recommendation, and that no push was performed.
