# Retire server VAD implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the user-facing server VAD mode and the quality-breaking `chunking_strategy=auto` request parameter while preserving automatic direct upload for eligible GPT-4o transcription files.

**Architecture:** VAD becomes a preprocessing-only choice with `disabled` and `local` values. Transport selection stays automatic: eligible no-preprocessing GPT-4o files use the existing direct route, while ranges, oversized files, unsupported formats, and local VAD use the existing client workflow. Local VAD initialization failure becomes no preprocessing and never enables an API chunking parameter.

**Tech Stack:** TypeScript, Obsidian API, Jest, ESLint, esbuild.

## Global constraints

- Do not change local VAD thresholds, speech reconstruction, chunk overlap, merge behavior, dictionary correction, post-processing, output format, pricing, or model selection.
- Do not implement the later prepared-single, canonical-limit, typed-error, or 413-fallback stages from the broader routing design.
- Ordinary GPT-4o Transcribe and GPT-4o Mini Transcribe requests must never contain `chunking_strategy`.
- Persisted `vadMode: 'server'` must normalize to `vadMode: 'disabled'` and be saved once.
- New installations default to `disabled`.
- Do not push or publish.
- Preserve unrelated user changes and do not touch existing untracked assets.

---

### Task 1: Remove the ordinary transcription chunking parameter

**Files:**
- Modify: `tests/config/openai/GPT4oTranscribeConfig.test.ts`
- Modify: `tests/infrastructure/api/openai/GPT4oClient.test.ts`
- Modify: `tests/application/TranscriptionController.test.ts`
- Modify: `tests/core/transcription/TranscriptionJobPlan.test.ts`
- Modify: `src/config/openai/GPT4oTranscribeConfig.ts`
- Modify: `src/core/transcription/TranscriptionTypes.ts`
- Modify: `src/core/transcription/TranscriptionJobPlan.ts`
- Modify: `src/application/workflows/TranscriptionWorkflow.ts`
- Modify: `src/application/services/GPT4oTranscriptionService.ts`
- Modify: `src/infrastructure/api/openai/GPT4oClient.ts`
- Modify: `src/application/TranscriptionController.ts`

**Interfaces:**
- Consumes: existing `TranscriptionOptions`, `WorkflowOptions`, `TranscriptionJobPlan`, and `GPT4oTranscribeParams`.
- Produces: the same interfaces without `chunkingStrategy`; `GPT4oClient.transcribeFile(data, fileName, mimeType, options)` has four arguments.

- [ ] **Step 1: Write failing request-regression tests**

Replace the server-chunking expectations with tests that inspect the multipart request and assert absence:

```ts
it('omits server chunking from direct uploads', async () => {
  // construct GPT4oClient and stub post as in the existing test
  await client.transcribeFile(
    new Uint8Array([1, 2, 3]).buffer,
    'meeting.mp3',
    'audio/mpeg',
    { language: 'auto' }
  );
  const formData = post.mock.calls[0]?.[1] as FormData;
  expect(formData.get('chunking_strategy')).toBeNull();
});
```

Add the same assertion to the encoded-chunk test. Change the controller direct-upload expectation so `transcribeFile` receives only four arguments. Change the planner expectation so plans never expose `chunkingStrategy`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --runTestsByPath \
  tests/config/openai/GPT4oTranscribeConfig.test.ts \
  tests/infrastructure/api/openai/GPT4oClient.test.ts \
  tests/application/TranscriptionController.test.ts \
  tests/core/transcription/TranscriptionJobPlan.test.ts
```

Expected: FAIL because current direct and client requests still serialize `chunking_strategy=auto`, the planner still exposes it, and the service still accepts a fifth argument.

- [ ] **Step 3: Remove the parameter from ordinary request contracts**

Delete `chunkingStrategy` and `chunking_strategy` from ordinary transcription types and builders:

```ts
export interface TranscriptionJobPlan {
  mode: 'direct' | 'client';
  concurrency: 1;
}
```

`buildGPT4oTranscribeRequest()` must build only supported ordinary fields. `WorkflowOptions` and `TranscriptionOptions` must no longer carry a chunking strategy. `GPT4oClient.executeTranscription()` must not append `chunking_strategy`.

- [ ] **Step 4: Remove controller and service propagation**

Use the four-argument direct call everywhere:

```ts
return await this.transcribeDirectFile(audioFile, audioBuffer, abortSignal);
```

Delete `shouldUseServerChunking()`, the `prepareWorkflowOptions()` assignment, the workflow copy, the service parameter, and the client parameter. Keep realtime API `server_vad` configuration unchanged because it is a separate API and feature.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the command from Step 2.

Expected: all four suites pass and multipart form data contains no `chunking_strategy`.

- [ ] **Step 6: Commit the emergency request fix**

```bash
git add src tests
git commit -m "fix(api): remove server transcription chunking"
```

---

### Task 2: Migrate settings and remove the server option

**Files:**
- Modify: `tests/infrastructure/storage/PluginStateRepository.test.ts`
- Modify: `tests/SettingsUiBuilder.test.ts`
- Modify: `src/ApiSettings.ts`
- Modify: `src/infrastructure/storage/PluginStateRepository.ts`
- Modify: `src/SettingsUiBuilder.ts`
- Modify: `src/i18n/locales.ts`
- Modify: `src/i18n/translations/en.ts`
- Modify: `src/i18n/translations/ja.ts`
- Modify: `src/i18n/translations/zh.ts`
- Modify: `src/i18n/translations/ko.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: persisted historical strings including `server`.
- Produces: new/default settings use `disabled`; normalizer maps historical `server` to `disabled`. The temporary public union retains `server` until Task 3 removes the last runtime references.

- [ ] **Step 1: Write failing migration and UI tests**

Add a repository migration test:

```ts
it('migrates legacy server VAD to disabled and persists the repair', async () => {
  const seedRepository = new PluginStateRepository(createPlugin(null));
  const state = await seedRepository.initialize();
  state.settings.data.vadMode = 'server' as never;
  const plugin = createPlugin(state);
  const repository = new PluginStateRepository(plugin);

  await repository.initialize();

  expect(repository.getSettings().vadMode).toBe('disabled');
  expect(plugin.saveData).toHaveBeenCalledTimes(1);
});
```

Update settings tests to expect exactly two descriptions in this order:

```ts
[
  'Off: Accuracy first. Processes the full audio, including quiet voices and short utterances.',
  'Local: May reduce costs for audio with long silences. Quiet voices and short utterances may be lost, reducing accuracy.'
]
```

Assert `DEFAULT_API_SETTINGS.vadMode === 'disabled'`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --runTestsByPath \
  tests/infrastructure/storage/PluginStateRepository.test.ts \
  tests/SettingsUiBuilder.test.ts
```

Expected: FAIL because the legacy value is retained, the server option remains visible, and the default remains server.

- [ ] **Step 3: Implement the settings migration**

Change the default:

```ts
vadMode: 'disabled',
```

Normalize storage explicitly:

```ts
const vadMode = vadValue === 'local'
  ? 'local'
  : 'disabled';
```

Because `isValidStoredSettings()` compares raw and normalized values, historical `server` automatically triggers one persisted repair.

Keep `server` in the `VADMode` union during this task so this commit remains type-correct while Task 3 replaces the remaining planner and fallback references. It is no longer emitted by defaults, storage, or UI.

- [ ] **Step 4: Remove server from settings UI and translations**

Use:

```ts
const VAD_MODE_ORDER: readonly VADMode[] = ['disabled', 'local'];
```

Update `isValidVadMode()` accordingly. Remove `server` keys from `TranslationKeys` and all four translations. Keep the already-approved disabled and local copy unchanged.

- [ ] **Step 5: Update README behavior descriptions**

Replace server-VAD claims in both English and Japanese sections with these facts:

- Default is no silence removal.
- Eligible GPT-4o files may be uploaded directly as an automatic transport optimization.
- Local VAD is optional and may reduce uploaded audio/cost when silence is substantial.
- Missing `fvad.wasm` falls back to no silence removal.
- Ordinary GPT-4o and Mini requests do not request server-side chunking.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the command from Step 2.

Expected: both suites pass; the dropdown and comparison list contain only disabled and local.

- [ ] **Step 7: Commit settings retirement**

```bash
git add src tests README.md
git commit -m "fix(settings): retire server VAD mode"
```

---

### Task 3: Preserve automatic direct upload and no-processing fallback

**Files:**
- Modify: `tests/core/transcription/TranscriptionJobPlan.test.ts`
- Modify: `tests/application/TranscriptionController.test.ts`
- Modify: `tests/vad/VadPreprocessor.test.ts`
- Modify: `src/core/transcription/TranscriptionJobPlan.ts`
- Modify: `src/application/TranscriptionController.ts`
- Modify: `src/vad/VadPreprocessor.ts`
- Modify: `src/ApiSettings.ts`
- Modify: `src/core/chunking/ChunkingTypes.ts`
- Modify: `src/i18n/locales.ts`
- Modify: `src/i18n/translations/en.ts`
- Modify: `src/i18n/translations/ja.ts`
- Modify: `src/i18n/translations/zh.ts`
- Modify: `src/i18n/translations/ko.ts`

**Interfaces:**
- Consumes: `VADMode`, existing 25 MiB direct-upload guard, supported direct extensions, time-range flags, and `VADPreprocessor` initialization result.
- Produces: `VADFallbackMode = 'none' | 'disabled'`; direct upload depends on model, no preprocessing, range, size, and extension—not a server VAD selection.

- [ ] **Step 1: Write failing planner and controller tests**

Set the planner base input to `vadMode: 'disabled'` and expect eligible GPT-4o files to use direct upload. Retain client expectations for local VAD, selected ranges, oversized files, Whisper, and unsupported extensions.

Update the controller direct test:

```ts
settings.vadMode = 'disabled';
expect(directTranscription).toHaveBeenCalledWith(
  audioBody,
  'meeting.mp3',
  'audio/mpeg',
  expect.objectContaining({ language: 'auto' })
);
```

- [ ] **Step 2: Write a failing local-fallback test**

Test `VADPreprocessor` initialization with a missing-WASM failure and assert:

```ts
expect(preprocessor.getFallbackMode()).toBe('disabled');
```

The notice translation must state that processing continues without silence removal, not that server VAD is used.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- --runTestsByPath \
  tests/core/transcription/TranscriptionJobPlan.test.ts \
  tests/application/TranscriptionController.test.ts \
  tests/vad/VadPreprocessor.test.ts
```

Expected: FAIL because direct upload still depends on server mode and fallback still reports `server_vad`.

- [ ] **Step 4: Decouple the direct route from server VAD**

Use no preprocessing as the direct-route precondition:

```ts
const canUploadDirectly = isGPT4o
  && input.vadMode === 'disabled'
  && !hasTimeRange
  && input.fileSizeBytes <= DIRECT_UPLOAD_LIMIT_BYTES
  && DIRECT_UPLOAD_EXTENSIONS.has(extension);
```

Return only `{ mode, concurrency: 1 }`.

- [ ] **Step 5: Convert local failure to no processing**

Introduce:

```ts
export type VADFallbackMode = 'none' | 'disabled';
```

Use `disabled` when `fvad.wasm` is missing. Disable the VAD config, show one `vadDisabledFallback` notice, and return the original buffer for an untrimmed request or a trimmed WAV for a requested range. In `TranscriptionController`, rename `serverSideVADFallback` to `noVADFallback`, select `WebAudioChunkingService` for disabled/fallback operation, and never derive an API request parameter from this flag.

Delete the unused `ChunkingConfig.useServerVAD` property.

After the last runtime comparison with `server` is gone, narrow the public type:

```ts
export type VADMode = 'local' | 'disabled';
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the command from Step 3.

Expected: all three suites pass; disabled direct upload stays active and missing local WASM continues without silence removal.

- [ ] **Step 7: Commit routing and fallback behavior**

```bash
git add src tests
git commit -m "fix(vad): use automatic no-processing fallback"
```

---

### Task 4: Full verification and installed-plugin replacement

**Files:**
- Verify: all changed source, tests, README, and generated release files.
- Replace after verification only: installed plugin `main.js`, `manifest.json`, `styles.css`, and `fvad.wasm` when present in the release build.

**Interfaces:**
- Consumes: successful Tasks 1–3 and the repository release build command.
- Produces: verified local build; no publish and no push.

- [ ] **Step 1: Search for retired ordinary-server semantics**

Run:

```bash
rg -n "chunkingStrategy|chunking_strategy|vadMode.*server|serverSideVADFallback|vadServerFallback" src tests README.md
```

Expected: no ordinary transcription or settings matches. `server_vad` may remain only in the unrelated realtime API configuration.

- [ ] **Step 2: Run the full repository checks**

Run:

```bash
npm test
npm run lint
npm run build
npm run lint -- --ext .ts,.js build/
```

Expected: every command exits 0 with no test failures or lint errors.

- [ ] **Step 3: Build release artifacts**

Run:

```bash
npm run build:release
```

Expected: the versioned build contains `main.js`, `manifest.json`, `styles.css`, and bundled `fvad.wasm` according to the existing release script.

- [ ] **Step 4: Re-check Obsidian policy constraints**

Re-open:

```text
obsidian-developer-docs/en/Developer policies.md
obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md
```

Confirm that the change adds no telemetry, updater, remote asset, unsafe DOM insertion, default hotkey, unnamespaced CSS, or undisclosed network destination.

- [ ] **Step 5: Replace the installed plugin build**

Copy only the verified release files into the existing vault plugin directory. Do not copy source maps, test fixtures, temporary API results, or credentials. Reload the plugin and confirm the settings dropdown shows only no processing and local VAD.

- [ ] **Step 6: Manual regression test**

Use the previously failing `上落合2丁目 11.m4a` range with no silence removal and GPT-4o Mini. Confirm console request metadata contains no `chunking_strategy`, no multilingual corruption appears, and no duplicate API request is emitted. Do not run another paid request unless the user starts or explicitly authorizes it.

- [ ] **Step 7: Report the final state**

Report changed files, commit hashes, verification command results, installed-plugin replacement status, and any manual test still awaiting the user. Do not push or publish.
