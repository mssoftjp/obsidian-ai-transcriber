# Stability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make transcription execution, persistence, output creation, and plugin lifecycle deterministic before adding performance-oriented behavior.

**Architecture:** Introduce one owned transcription job at a time, serialize durable state writes, and move note creation into a small atomic writer. Keep the public facade and stored-state shape compatible. Add a capability-based audio request plan only after these safety boundaries are covered by tests.

**Tech Stack:** TypeScript 5.6, Obsidian API 1.8.7, Jest 30 with ts-jest, ESLint 9, GitHub Actions.

## Global Constraints

- Stability takes priority over throughput; transcription remains serial by default.
- Use only public Obsidian APIs and keep `isDesktopOnly: true` unchanged.
- Preserve existing settings, dictionary, history, output body, and workspace event contracts.
- Never use localized display strings as control-flow sentinels.
- Do not add ffmpeg, Electron networking, telemetry, auto-update behavior, or new runtime dependencies.
- Write a failing regression test before each production-code behavior change.
- Do not push; work only on `codex/stability-hardening`.

---

### Task 1: Make tests trackable and part of the release gate

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `.github/workflows/release.yml`
- Test: existing `tests/**/*.test.ts`

**Interfaces:**
- Consumes: current Jest suite and `npm run check`.
- Produces: tracked new tests and a `check` command that includes serial tests.

- [ ] **Step 1: Confirm a new test path is currently ignored**

Run: `git check-ignore tests/application/APITranscriber.test.ts`
Expected: the path is reported because `.gitignore` contains `tests/`.

- [ ] **Step 2: Remove `tests/` and `test/` from `.gitignore`**

Keep security fixtures ignored by explicit names if one is later introduced; do not ignore the test tree.

- [ ] **Step 3: Add tests to the check contract**

Use this script contract:

```json
{
  "scripts": {
    "check": "npm run lint && npm run build && npm test -- --runInBand --coverage=false"
  }
}
```

- [ ] **Step 4: Run the release gate**

Run: `npm run check`
Expected: 7 suites and 30 tests pass before new tests are added.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json .github/workflows/release.yml
git commit -m "test: enforce release checks"
```

### Task 2: Enforce single-owner transcription jobs

**Files:**
- Create: `src/core/transcription/TranscriptionJob.ts`
- Modify: `src/ApiTranscriber.ts`
- Modify: `src/ui/ProgressTracker.ts`
- Create: `tests/ApiTranscriber.test.ts`
- Create: `tests/ui/ProgressTracker.test.ts`

**Interfaces:**
- Produces: `TranscriptionBusyError`, `ActiveTranscriptionJob`, and `APITranscriber.isTranscribing()`.
- Preserves: `APITranscriber.transcribe()` result type and `cancelTranscription()` signature.

- [ ] **Step 1: Write a failing facade test**

```ts
it('rejects a second transcription while the first job owns the facade', async () => {
  const first = transcriber.transcribe(firstFile);
  await expect(transcriber.transcribe(secondFile)).rejects.toMatchObject({ code: 'TRANSCRIPTION_BUSY' });
  resolveController('first result');
  await expect(first).resolves.toBe('first result');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tests/ApiTranscriber.test.ts`
Expected: FAIL because a second call replaces the shared controller/task state.

- [ ] **Step 3: Add the typed job contract**

```ts
export interface ActiveTranscriptionJob {
  readonly id: string;
  readonly abortController: AbortController;
  readonly taskId: string | null;
}

export class TranscriptionBusyError extends Error {
  readonly code = 'TRANSCRIPTION_BUSY' as const;
}
```

- [ ] **Step 4: Make job acquisition and release identity-safe**

Acquire before cost estimation and task creation. In `finally`, clear only when `this.activeJob === job`. Cancellation aborts and marks only that job. `ProgressTracker.startTask()` throws `TranscriptionBusyError` when its current task has status `processing`.

- [ ] **Step 5: Verify GREEN and regression suite**

Run: `npm test -- --runInBand tests/ApiTranscriber.test.ts tests/ui/ProgressTracker.test.ts`
Expected: PASS.

Run: `npm test -- --runInBand --coverage=false`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/transcription/TranscriptionJob.ts src/ApiTranscriber.ts src/ui/ProgressTracker.ts tests/ApiTranscriber.test.ts tests/ui/ProgressTracker.test.ts
git commit -m "fix: serialize transcription jobs"
```

### Task 3: Normalize corrupted state and serialize writes

**Files:**
- Modify: `src/infrastructure/storage/PluginStateRepository.ts`
- Create: `tests/infrastructure/storage/PluginStateRepository.test.ts`

**Interfaces:**
- Preserves: `PluginState`, `saveSettings()`, `saveHistory()`, and all persisted segment versions.
- Produces: segment-by-segment normalization and an internal promise write queue.

- [ ] **Step 1: Write failing recovery and ordering tests**

```ts
it('recovers a partial segmented state without throwing', async () => {
  plugin.loadData.mockResolvedValue({ meta: { version: 1 }, settings: { version: 1, data: {} } });
  await expect(repository.initialize()).resolves.toBeDefined();
  expect(repository.getDictionaries().ja.definiteCorrections).toEqual([]);
});

it('serializes overlapping settings and history writes without losing either segment', async () => {
  const settingsWrite = repository.saveSettings(settings);
  const historyWrite = repository.saveHistory([task]);
  await Promise.all([settingsWrite, historyWrite]);
  expect(plugin.saveData.mock.calls.at(-1)?.[0].history.items).toEqual([task]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tests/infrastructure/storage/PluginStateRepository.test.ts`
Expected: the partial state throws while reading missing dictionaries/history.

- [ ] **Step 3: Normalize every segment independently**

Treat absent or malformed `meta`, `settings.data`, `dictionaries.languages`, and `history.items` as defaults. Migrate legacy settings only when the object is not a segmented state candidate.

- [ ] **Step 4: Serialize immutable snapshots**

Use a queue shaped as:

```ts
private writeQueue: Promise<void> = Promise.resolve();

private persistState(): Promise<void> {
  const snapshot = deepClone(this.state);
  snapshot.meta.updatedAt = new Date().toISOString();
  this.state.meta.updatedAt = snapshot.meta.updatedAt;
  const write = this.writeQueue.then(() => this.plugin.saveData(snapshot));
  this.writeQueue = write.catch(() => undefined);
  return write;
}
```

- [ ] **Step 5: Persist on initialization only for migration or repair**

Fresh valid segmented state must not be rewritten merely because the plugin loaded.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test -- --runInBand tests/infrastructure/storage/PluginStateRepository.test.ts`
Expected: PASS.

```bash
git add src/infrastructure/storage/PluginStateRepository.ts tests/infrastructure/storage/PluginStateRepository.test.ts
git commit -m "fix: harden plugin state persistence"
```

### Task 4: Create transcription notes atomically

**Files:**
- Create: `src/infrastructure/storage/TranscriptionNoteWriter.ts`
- Modify: `src/ui/ApiTranscriptionModal.ts`
- Create: `tests/infrastructure/storage/TranscriptionNoteWriter.test.ts`

**Interfaces:**
- Consumes: complete Markdown body, requested path, and frontmatter metadata.
- Produces: `{ file: TFile; path: string }` only after body and metadata are durable.
- Preserves: `transcription:completed` and `transcription:ready-for-translation` payloads.

- [ ] **Step 1: Write failing writer tests**

```ts
it('creates a note with its complete body in one call', async () => {
  await writer.create({ requestedPath: 'out.md', content: '# body', frontmatter: metadata });
  expect(vault.create).toHaveBeenCalledWith('out.md', '# body');
  expect(vault.modify).not.toHaveBeenCalled();
});

it('allocates a collision-free path before creating', async () => {
  vault.getAbstractFileByPath.mockReturnValueOnce(existingFile).mockReturnValueOnce(null);
  const result = await writer.create({ requestedPath: 'out.md', content: '# body', frontmatter: metadata });
  expect(result.path).toBe('out-2.md');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tests/infrastructure/storage/TranscriptionNoteWriter.test.ts`
Expected: FAIL because the writer does not exist.

- [ ] **Step 3: Implement complete-body creation**

Use `normalizePath`, `vault.getAbstractFileByPath`, `vault.create(path, content)`, then `fileManager.processFrontMatter`. Do not use `Vault.modify`, arbitrary delays, or append fallbacks.

- [ ] **Step 4: Emit events only after writer success**

Refactor the modal so progress path assignment, workspace completion events, translation event, and opening the file occur after the writer returns. On writer failure, open the existing recovery modal with the complete Markdown body.

- [ ] **Step 5: Verify GREEN and guideline scan**

Run: `npm test -- --runInBand tests/infrastructure/storage/TranscriptionNoteWriter.test.ts`
Expected: PASS.

Run: `rg -n "vault\\.modify|delay\(50\)" src/ui/ApiTranscriptionModal.ts`
Expected: no matches in the save path.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/storage/TranscriptionNoteWriter.ts src/ui/ApiTranscriptionModal.ts tests/infrastructure/storage/TranscriptionNoteWriter.test.ts
git commit -m "fix: write transcription notes atomically"
```

### Task 5: Make plugin lifecycle unload-safe and use public APIs

**Files:**
- Modify: `src/main-api.ts`
- Modify: `src/ui/AudioFileSelectionModal.ts`
- Modify: `src/ui/TranscriptionView.ts`
- Modify: `src/ui/ApiTranscriptionModal.ts`
- Modify: `src/types/global.ts`
- Create: `tests/ui/AudioFileSelectionModal.test.ts`

**Interfaces:**
- Preserves: commands, view type, ribbon, context menu, and save-settings behavior.
- Produces: awaited load/unload and public `vault.getFiles()` based selection.

- [ ] **Step 1: Write a failing public-file-list test**

```ts
it('lists supported audio files through Vault.getFiles', () => {
  app.vault.getFiles.mockReturnValue([audioFile, markdownFile]);
  expect(collectAudioFiles(app.vault)).toEqual([audioFile]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tests/ui/AudioFileSelectionModal.test.ts`
Expected: FAIL because selection depends on an undocumented metadata-cache method.

- [ ] **Step 3: Await lifecycle and register the view during load**

Use `override async onload(): Promise<void>` and `override async onunload(): Promise<void>`. Register the view after state/transcriber construction during `onload`; keep cleanup, status bar, ribbon, and context menu setup inside `onLayoutReady`. Guard disposal of optional resources.

- [ ] **Step 4: Remove private plugin lookups**

Use injected `saveSettings`, `vault.getFiles()`, and a plugin-owned search/filter UI. Remove `getCachedFiles`, `internalPlugins`, and `app.plugins` compatibility types.

- [ ] **Step 5: Verify GREEN and scan**

Run: `npm test -- --runInBand tests/ui/AudioFileSelectionModal.test.ts`
Expected: PASS.

Run: `rg -n "getCachedFiles|internalPlugins|app\\.plugins" src`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add src/main-api.ts src/ui/AudioFileSelectionModal.ts src/ui/TranscriptionView.ts src/ui/ApiTranscriptionModal.ts src/types/global.ts tests/ui/AudioFileSelectionModal.test.ts
git commit -m "fix: use unload-safe public Obsidian APIs"
```

### Task 6: Add a stability-first audio request plan

**Files:**
- Create: `src/core/transcription/TranscriptionJobPlan.ts`
- Modify: `src/ApiTranscriber.ts`
- Modify: `src/config/openai/GPT4oTranscribeConfig.ts`
- Modify: `src/infrastructure/api/openai/GPT4oClient.ts`
- Create: `tests/core/transcription/TranscriptionJobPlan.test.ts`
- Create: `tests/config/openai/GPT4oTranscribeConfig.test.ts`

**Interfaces:**
- Produces: a pure plan choosing direct upload with `chunking_strategy: 'auto'` or existing client chunking.
- Preserves: local VAD and time-range paths; no streaming or external processes.

- [ ] **Step 1: Write failing plan tests**

```ts
it('uses direct server chunking for an in-limit GPT-4o file without trimming', () => {
  expect(createTranscriptionJobPlan(input)).toMatchObject({ mode: 'direct', chunkingStrategy: 'auto', concurrency: 1 });
});

it('keeps client processing for local VAD or time ranges', () => {
  expect(createTranscriptionJobPlan({ ...input, vadMode: 'local' }).mode).toBe('client');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand tests/core/transcription/TranscriptionJobPlan.test.ts`
Expected: FAIL because no plan exists.

- [ ] **Step 3: Implement a pure capability plan**

Use `TFile.stat.size`; never read the file merely to estimate size/cost. Direct upload is allowed only for GPT-4o transcription, no trim, server VAD, and provider size limit. All chunk concurrency defaults to one.

- [ ] **Step 4: Add the documented request field**

Extend only the GPT-4o transcription request payload:

```ts
chunking_strategy?: 'auto';
```

Do not claim hard cancellation of `requestUrl`; discard late results by job identity instead.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- --runInBand tests/core/transcription/TranscriptionJobPlan.test.ts tests/config/openai/GPT4oTranscribeConfig.test.ts`
Expected: PASS.

```bash
git add src/core/transcription/TranscriptionJobPlan.ts src/ApiTranscriber.ts src/config/openai/GPT4oTranscribeConfig.ts src/infrastructure/api/openai/GPT4oClient.ts tests/core/transcription/TranscriptionJobPlan.test.ts tests/config/openai/GPT4oTranscribeConfig.test.ts
git commit -m "feat: plan stable audio requests"
```

### Task 7: Reproducible tooling and final community review gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/setup-eslint-plugin.mjs` or remove it when no longer needed
- Modify: `manifest.json`
- Modify: `README.md` only if disclosure text changes

**Interfaces:**
- Produces: installable dependencies without a GitHub tarball and a deterministic release gate.

- [ ] **Step 1: Replace the remote lint dependency with an exact registry release**

Verify the selected package contains its distributable entry point before removing the setup script. Pin the package manager using `packageManager`.

- [ ] **Step 2: Improve review-facing metadata**

Make descriptions verb-led and sentence-cased. Keep network-use and funding disclosures accurate; do not add ads or telemetry.

- [ ] **Step 3: Run the complete verification gate**

Run: `npm run check`
Expected: lint, build, and all Jest suites pass.

Run: `./node_modules/.bin/eslint build/0.9.9/main.js build/main.js`
Expected: no findings.

Run: `npm test -- --runInBand --coverage`
Expected: report the measured coverage; raise thresholds only to values the suite actually sustains.

- [ ] **Step 4: Re-check the Obsidian October plugin self-critique checklist**

Document any justified remaining exceptions in the final handoff; do not broaden this task into unrelated UI redesign.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/setup-eslint-plugin.mjs manifest.json README.md
git commit -m "chore: make release validation reproducible"
```

