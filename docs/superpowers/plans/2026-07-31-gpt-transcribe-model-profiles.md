# GPT Transcribe Model Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `gpt-transcribe` as the default recorded-audio model while preserving every valid saved model choice, and make one canonical model-profile registry drive persistence, request dialects, routing, processing, cleaning, pricing, and UI metadata.

**Architecture:** Introduce an immutable `TranscriptionModelProfiles` registry whose literal IDs derive the `TranscriptionModel` type. Existing processing and cleaning modules retain their detailed algorithms as semantic presets; profiles map each model to a preset and declare API workflow/capabilities. Every runtime path resolves a profile and fails closed for an unknown model. The existing GPT-4o-named service/client classes remain compatibility names, but accept every profile whose workflow is `openai-file`.

**Tech Stack:** TypeScript, Jest, Obsidian API, multipart `FormData`, ESLint, esbuild.

**Execution note:** This task is being executed inline with `superpowers:executing-plans`; multi-agent delegation is unavailable in the current session. Apply test-driven development for behavioral changes: observe the focused test fail for the intended reason, implement the minimum change, then observe it pass.

---

## Task 1: Establish the canonical model-profile contract

**Files:**

- Create: `src/config/TranscriptionModelProfiles.ts`
- Create: `tests/config/TranscriptionModelProfiles.test.ts`
- Modify: `src/ApiSettings.ts`
- Modify: `src/config/constants.ts`
- Modify: `src/config/ModelOptions.ts`
- Modify: `src/config/openai/index.ts`
- Modify: `tests/ObsidianAuditWarnings.test.ts`

- [ ] **Step 1: Add a failing profile contract test**

  Cover the exact ordered IDs:

  ```ts
  [
    'gpt-transcribe',
    'gpt-4o-transcribe',
    'gpt-4o-mini-transcribe',
    'whisper-1',
    'whisper-1-ts'
  ]
  ```

  Assert unique IDs, exactly one default (`gpt-transcribe`), positive USD pricing, and the full `gpt-transcribe` contract:

  ```ts
  expect(getTranscriptionModelProfile('gpt-transcribe')).toMatchObject({
    apiModel: 'gpt-transcribe',
    isDefault: true,
    workflow: 'openai-file',
    request: { languageField: 'languages' },
    processingPreset: 'recorded-accurate',
    cleaningPreset: 'recorded-accurate',
    pricing: { currency: 'USD', costPerMinute: 0.0045 },
    capabilities: {
      originalDirectUpload: true,
      timestamps: false
    }
  });
  ```

  Assert `isTranscriptionModel` rejects an unknown value and `getTranscriptionModelProfile` throws an error listing the available IDs.

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run:

  ```bash
  npm test -- --runTestsByPath tests/config/TranscriptionModelProfiles.test.ts --runInBand
  ```

  Expected: FAIL because the registry module does not yet exist.

- [ ] **Step 3: Implement the immutable registry**

  Define semantic unions for workflow, language field, processing preset, and cleaning preset. Define the profile array with `as const satisfies readonly ...[]`, derive:

  ```ts
  export type TranscriptionModel =
    (typeof TRANSCRIPTION_MODEL_PROFILES)[number]['id'];
  ```

  Export:

  ```ts
  TRANSCRIPTION_MODEL_PROFILES
  DEFAULT_TRANSCRIPTION_MODEL
  isTranscriptionModel(value: unknown)
  getTranscriptionModelProfile(model: string)
  ```

  Use a map for resolution. Do not return an arbitrary profile for an unknown value.

- [ ] **Step 4: Make existing model exports derive from the registry**

  Re-export the derived type from `ApiSettings.ts` and assign:

  ```ts
  model: DEFAULT_TRANSCRIPTION_MODEL
  ```

  Make `MODEL_OPTIONS` and any helper in `config/openai/index.ts` derive from the registry. Remove `MODEL_NAMES` if no non-duplicating use remains. Keep `ModelOptions.ts` as a compatibility adapter if its import surface is still used.

- [ ] **Step 5: Run the profile and source-contract tests**

  Run:

  ```bash
  npm test -- --runTestsByPath tests/config/TranscriptionModelProfiles.test.ts tests/ObsidianAuditWarnings.test.ts --runInBand
  ```

  Expected: PASS.

- [ ] **Step 6: Commit the registry slice**

  ```bash
  git add src/config/TranscriptionModelProfiles.ts src/ApiSettings.ts src/config/constants.ts src/config/ModelOptions.ts src/config/openai/index.ts tests/config/TranscriptionModelProfiles.test.ts tests/ObsidianAuditWarnings.test.ts
  git commit -m "feat: centralize transcription model profiles"
  ```

## Task 2: Connect persistence, processing, cleaning, and pricing

**Files:**

- Modify: `src/infrastructure/storage/PluginStateRepository.ts`
- Modify: `src/config/ModelProcessingConfig.ts`
- Modify: `src/config/ModelCleaningConfig.ts`
- Modify: `tests/infrastructure/storage/PluginStateRepository.test.ts`
- Modify: `tests/config/ModelCleaningConfig.test.ts`
- Create or modify: `tests/config/ModelProcessingConfig.test.ts`

- [ ] **Step 1: Add failing persistence tests**

  Add cases proving:

  - `gpt-transcribe` saves and reloads unchanged.
  - Each pre-existing model reloads unchanged.
  - Missing or unknown stored model normalizes to `gpt-transcribe`.
  - Valid stored `gpt-4o-transcribe` is not migrated.

- [ ] **Step 2: Add failing preset-resolution tests**

  Assert `gpt-transcribe` and `gpt-4o-transcribe` share current high-accuracy processing values but retain their own identity and prices. Assert Mini retains the economy values, Whisper modes retain current values, and unknown models throw.

  For cleaning, assert `gpt-transcribe` resolves the current high-accuracy strategy with:

  ```ts
  {
    modelId: 'gpt-transcribe',
    modelName: 'GPT Transcribe'
  }
  ```

  Assert the previous unknown-to-Mini fallback is gone.

- [ ] **Step 3: Run the focused tests and verify intended failures**

  Run:

  ```bash
  npm test -- --runTestsByPath tests/infrastructure/storage/PluginStateRepository.test.ts tests/config/ModelProcessingConfig.test.ts tests/config/ModelCleaningConfig.test.ts --runInBand
  ```

  Expected: FAIL on the new default/profile/preset expectations.

- [ ] **Step 4: Replace persistence allowlists with the profile type guard**

  Normalize only at the storage boundary:

  ```ts
  isTranscriptionModel(stored.model)
    ? stored.model
    : DEFAULT_TRANSCRIPTION_MODEL
  ```

  Do not add runtime fallback behavior to services or controllers.

- [ ] **Step 5: Convert processing configuration to semantic presets**

  Keep the existing threshold values unchanged. Store only preset definitions in `ModelProcessingConfig`; resolve the selected profile, select its `processingPreset`, and combine the profile identity/pricing into the returned config. Preserve the public `getModelConfig(model).pricing` interface and cache by model ID.

- [ ] **Step 6: Convert cleaning configuration to semantic presets**

  Move the existing high-accuracy, economy, and Whisper strategies behind preset IDs. Resolve `profile.cleaningPreset`, clone the preset, then apply the selected profile’s `modelId` and display name. Preserve existing debug overlays by preset and reject unknown IDs.

- [ ] **Step 7: Re-run the focused tests**

  Run the Step 3 command.

  Expected: PASS with unchanged legacy threshold assertions.

- [ ] **Step 8: Commit the configuration slice**

  ```bash
  git add src/infrastructure/storage/PluginStateRepository.ts src/config/ModelProcessingConfig.ts src/config/ModelCleaningConfig.ts tests/infrastructure/storage/PluginStateRepository.test.ts tests/config/ModelProcessingConfig.test.ts tests/config/ModelCleaningConfig.test.ts
  git commit -m "refactor: resolve transcription presets from profiles"
  ```

## Task 3: Implement the GPT Transcribe request dialect

**Files:**

- Modify: `src/config/openai/GPT4oTranscribeConfig.ts`
- Modify: `src/infrastructure/api/openai/GPT4oClient.ts`
- Modify: `tests/config/openai/GPT4oTranscribeConfig.test.ts`
- Modify: `tests/infrastructure/api/openai/GPT4oClient.test.ts`

- [ ] **Step 1: Add failing request-builder tests**

  Cover:

  ```ts
  buildGPT4oTranscribeRequest({
    model: 'gpt-transcribe',
    language: 'ja'
  })
  ```

  It must produce `languages: ['ja']`, must not have `language`, and must retain `temperature: 0`. With `language: 'auto'`, neither field exists. Existing GPT-4o models must continue to produce singular `language`.

  Add type/runtime coverage that unknown and Whisper-workflow models are rejected before networking.

- [ ] **Step 2: Add a failing multipart serialization test**

  Mock `fetch`, submit a GPT Transcribe request, inspect `FormData`, and assert:

  ```ts
  formData.getAll('languages[]') // ['ja']
  formData.has('languages')      // false
  formData.has('language')       // false
  ```

  Retain tests for prompt, previous chunk context, response format, and streaming/logprobs behavior.

- [ ] **Step 3: Run both focused suites and verify intended failures**

  ```bash
  npm test -- --runTestsByPath tests/config/openai/GPT4oTranscribeConfig.test.ts tests/infrastructure/api/openai/GPT4oClient.test.ts --runInBand
  ```

  Expected: FAIL because GPT Transcribe is unsupported and arrays are not serialized as repeated bracketed fields.

- [ ] **Step 4: Make the request builder profile-aware**

  Accept every profile with workflow `openai-file`. Resolve the profile and generate exactly one dialect:

  - `languageField === 'languages'`: `languages?: string[]`
  - `languageField === 'language'`: `language?: string`
  - `auto`: omit both

  Do not add `reasoning_effort`, `keywords`, `chunking_strategy`, or an instruction prompt. Preserve the custom prompt and bounded previous-context behavior.

- [ ] **Step 5: Serialize repeated language fields**

  In `GPT4oClient`, append each language with:

  ```ts
  formData.append('languages[]', language);
  ```

  Keep unrelated array serialization behavior unchanged. Derive the client’s supported model set and display/pricing metadata from profiles. Extend the response type to accept optional detected `languages`, without changing note output.

- [ ] **Step 6: Re-run both focused suites**

  Run the Step 3 command.

  Expected: PASS.

- [ ] **Step 7: Commit the request slice**

  ```bash
  git add src/config/openai/GPT4oTranscribeConfig.ts src/infrastructure/api/openai/GPT4oClient.ts tests/config/openai/GPT4oTranscribeConfig.test.ts tests/infrastructure/api/openai/GPT4oClient.test.ts
  git commit -m "feat: add GPT Transcribe request dialect"
  ```

## Task 4: Make execution routing profile-driven

**Files:**

- Modify: `src/application/TranscriptionController.ts`
- Modify: `src/core/transcription/TranscriptionJobPlan.ts`
- Modify: `src/application/services/GPT4oTranscriptionService.ts`
- Modify: `src/ApiTranscriber.ts`
- Modify: `tests/application/TranscriptionController.test.ts`
- Modify: `tests/core/transcription/TranscriptionJobPlan.test.ts`
- Modify: `tests/ApiTranscriber.test.ts`

- [ ] **Step 1: Add failing controller routing tests**

  Test both the normal workflow and eligible original-file direct-upload path. In each, `gpt-transcribe` must reach the GPT service unchanged. Add a defensive case proving an unknown non-Whisper string throws and is never converted to `gpt-4o-mini-transcribe`.

- [ ] **Step 2: Add failing job-plan capability tests**

  Assert GPT Transcribe supports original direct upload when all existing file constraints pass, while time-range selection, local VAD, size overflow, and unsupported extension still select the existing client-processing path. Preserve all four legacy model cases.

- [ ] **Step 3: Add failing facade metadata/pricing tests**

  Assert the facade reports GPT Transcribe’s provider/display name and `$0.0045/min`, not the Mini or GPT-4o value.

- [ ] **Step 4: Run the focused routing tests and verify intended failures**

  ```bash
  npm test -- --runTestsByPath tests/application/TranscriptionController.test.ts tests/core/transcription/TranscriptionJobPlan.test.ts tests/ApiTranscriber.test.ts --runInBand
  ```

  Expected: FAIL on model substitution, direct-upload capability, or pricing.

- [ ] **Step 5: Route by profile workflow and capabilities**

  Resolve the profile once at each boundary. Switch on `profile.workflow`, and pass `profile.apiModel` unchanged into the matching service. Replace direct model-ID lists with `profile.capabilities.originalDirectUpload`. Use an exhaustive workflow switch and fail before HTTP on inconsistency.

- [ ] **Step 6: Resolve service/facade metadata from profiles**

  Remove binary GPT-4o/Mini price and display-name conditionals. Continue to use existing class names and interfaces; only their model resolution changes.

- [ ] **Step 7: Re-run the focused routing tests**

  Run the Step 4 command.

  Expected: PASS.

- [ ] **Step 8: Commit the routing slice**

  ```bash
  git add src/application/TranscriptionController.ts src/core/transcription/TranscriptionJobPlan.ts src/application/services/GPT4oTranscriptionService.ts src/ApiTranscriber.ts tests/application/TranscriptionController.test.ts tests/core/transcription/TranscriptionJobPlan.test.ts tests/ApiTranscriber.test.ts
  git commit -m "refactor: route transcription through model profiles"
  ```

## Task 5: Drive the UI and translations from profiles

**Files:**

- Modify: `src/SettingsUiBuilder.ts`
- Modify: `src/ui/ApiTranscriptionModal.ts`
- Modify: `src/ApiSettingsTab.ts`
- Modify: `src/i18n/locales.ts`
- Modify: `src/i18n/translations/en.ts`
- Modify: `src/i18n/translations/ja.ts`
- Modify: `src/i18n/translations/zh.ts`
- Modify: `src/i18n/translations/ko.ts`
- Modify: `tests/SettingsUiBuilder.test.ts`
- Modify: `tests/ApiSettingsTab.test.ts`
- Modify or create: `tests/i18n/Translations.test.ts`

- [ ] **Step 1: Add failing UI contract tests**

  Assert the settings and modal dropdown order has five entries, GPT Transcribe is first and marked recommended/default, and the comparison section contains four rows (Whisper timestamp modes share one comparison row). Assert no hard-coded two-model price branch remains in the cost view.

- [ ] **Step 2: Add failing translation tests**

  Check every profile’s dropdown/provider keys resolve in all four locales and comparison text matches the approved table:

  - Japanese: `録音済み音声向けの推奨モデル`
  - English: `Recommended for recorded speech`
  - Chinese: `录制语音的推荐模型`
  - Korean: `녹음된 음성에 권장되는 모델`

  Include the approved descriptions for GPT-4o, Mini, and Whisper. Ensure the Chinese Whisper label no longer embeds a price.

- [ ] **Step 3: Run the focused UI/i18n tests and verify intended failures**

  ```bash
  npm test -- --runTestsByPath tests/SettingsUiBuilder.test.ts tests/ApiSettingsTab.test.ts tests/i18n/Translations.test.ts --runInBand
  ```

  Expected: FAIL because GPT Transcribe and its translation keys are absent.

- [ ] **Step 4: Render model controls from profiles**

  Iterate the ordered registry for dropdowns. Iterate profiles with a non-null comparison descriptor for comparison rows. Resolve provider, labels, and pricing from the same profile. Do not introduce per-component model switches.

- [ ] **Step 5: Add localized strings and settings aliases**

  Add typed translation keys for labels, provider names, and comparison descriptions in all four locale modules. Add GPT Transcribe to the relevant settings-search aliases. Keep UI text sentence case.

- [ ] **Step 6: Re-run focused UI/i18n tests**

  Run the Step 3 command.

  Expected: PASS.

- [ ] **Step 7: Commit the UI slice**

  ```bash
  git add src/SettingsUiBuilder.ts src/ui/ApiTranscriptionModal.ts src/ApiSettingsTab.ts src/i18n/locales.ts src/i18n/translations/en.ts src/i18n/translations/ja.ts src/i18n/translations/zh.ts src/i18n/translations/ko.ts tests/SettingsUiBuilder.test.ts tests/ApiSettingsTab.test.ts tests/i18n/Translations.test.ts
  git commit -m "feat: expose GPT Transcribe in model UI"
  ```

## Task 6: Update user-facing documentation and metadata

**Files:**

- Modify: `README.md`
- Modify: `README_ja.md`
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `docs/testing/long-form-transcription-checklist.md`
- Modify: `src/config/config.ts`

- [ ] **Step 1: Update model guidance**

  Document:

  - GPT Transcribe is the default and recommended recorded-audio model.
  - GPT-4o Mini Transcribe is the explicit lower-cost GPT option.
  - There is no GPT Transcribe Mini or effort setting.
  - Whisper remains the timestamp path.
  - Existing saved valid selections remain unchanged.

  Keep the existing OpenAI network/API-key disclosure intact.

- [ ] **Step 2: Generalize package metadata**

  Replace descriptions that imply only Whisper/GPT-4o are available with concise general OpenAI transcription wording. Do not change versions or release assets.

- [ ] **Step 3: Extend the long-form verification checklist**

  Add GPT Transcribe to applicable cases and add explicit checks for `languages[]` versus singular `language`. Do not claim a paid live-audio acceptance test was performed.

- [ ] **Step 4: Refresh configuration comments**

  Update comments that present a closed model list so they point to the profile registry. Avoid unrelated documentation rewrites.

- [ ] **Step 5: Inspect the documentation diff**

  ```bash
  git diff --check
  git diff -- README.md README_ja.md manifest.json package.json docs/testing/long-form-transcription-checklist.md src/config/config.ts
  ```

  Expected: no whitespace errors, version changes, or release-output changes.

- [ ] **Step 6: Commit the documentation slice**

  ```bash
  git add README.md README_ja.md manifest.json package.json docs/testing/long-form-transcription-checklist.md src/config/config.ts
  git commit -m "docs: document GPT Transcribe model choices"
  ```

## Task 7: Exhaustive audit and verification

**Files:**

- Modify only files required to fix issues exposed by this audit.

- [ ] **Step 1: Classify every remaining model literal**

  Run:

  ```bash
  rg -n "gpt-transcribe|gpt-4o-transcribe|gpt-4o-mini-transcribe|whisper-1|GPT-4o Transcribe|GPT-4o Mini Transcribe|Whisper-1" src tests README.md README_ja.md manifest.json package.json docs
  ```

  Confirm that remaining literals are one of:

  - the canonical profile registry;
  - test expectations;
  - API-fixed `whisper-1`;
  - separate Realtime or post-processing model contracts;
  - historical/compatibility class and fixture names;
  - explanatory documentation.

  Remove any remaining independent selectable-model allowlist, pricing table, display-name switch, or non-test fallback.

- [ ] **Step 2: Verify no unsupported feature slipped in**

  Search the implementation diff for `reasoning_effort`, `keywords`, `chunking_strategy`, `gpt-live-transcribe`, release version changes, and output assets. Any occurrence must be pre-existing documentation/context or removed.

- [ ] **Step 3: Run focused model-path tests**

  ```bash
  npm test -- --runTestsByPath tests/config/TranscriptionModelProfiles.test.ts tests/infrastructure/storage/PluginStateRepository.test.ts tests/config/ModelProcessingConfig.test.ts tests/config/ModelCleaningConfig.test.ts tests/config/openai/GPT4oTranscribeConfig.test.ts tests/infrastructure/api/openai/GPT4oClient.test.ts tests/application/TranscriptionController.test.ts tests/core/transcription/TranscriptionJobPlan.test.ts tests/ApiTranscriber.test.ts tests/SettingsUiBuilder.test.ts tests/ApiSettingsTab.test.ts tests/i18n/Translations.test.ts --runInBand
  ```

  Expected: PASS.

- [ ] **Step 4: Run repository-wide static and unit verification**

  ```bash
  npm run lint
  npm run build
  npm test -- --runInBand
  npm run lint -- --ext .ts,.js build/
  ```

  Expected: all commands exit 0. Treat warnings and generated-output lint failures as findings, not as successful verification.

- [ ] **Step 5: Re-check Obsidian policy constraints**

  Re-read `obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md` against the final diff. Confirm there are no default hotkeys, unprefixed DOM/CSS additions, unsafe HTML, console-level violations, mobile-only regressions, secret handling changes, or undisclosed network behavior.

- [ ] **Step 6: Inspect final repository state**

  ```bash
  git diff --check
  git status --short
  git log --oneline --decorate -8
  ```

  Confirm only scoped commits/files exist and no generated temporary artifacts are untracked.

- [ ] **Step 7: Commit any audit-only corrections**

  If Step 1–6 required corrections, stage only their explicit paths and commit:

  ```bash
  git commit -m "fix: complete GPT Transcribe profile integration"
  ```

  If no correction is needed, do not create an empty commit.

- [ ] **Step 8: Run final verification again after the last commit**

  Repeat Step 4 after the final source state. Record the fresh command results for handoff. Do not push.
