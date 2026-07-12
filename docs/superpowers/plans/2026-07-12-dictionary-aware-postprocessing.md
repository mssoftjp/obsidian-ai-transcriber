# Dictionary-Aware Post-Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply fixed dictionary corrections without an API call, apply contextual corrections only through the existing optional AI post-processing request, and clearly disclose the resulting cost behavior.

**Architecture:** Keep `DictionaryCorrector` as the deterministic fixed-replacement stage. Add a pure contextual-guidance selector that filters and caps entries per post-processing segment, then include that guidance in the existing GPT-5 mini post-processing prompt. Replace lossy text segmentation with a separator-preserving helper so every failed or rejected segment can fall back to its complete source text.

**Tech Stack:** TypeScript, Jest, Obsidian API, existing OpenAI chat-completions client, repository i18n system.

## Global Constraints

- Existing settings keys and stored dictionary shapes remain unchanged.
- No dictionary-specific API request is added.
- Fixed corrections never include contextual entries.
- Contextual corrections are inactive unless both dictionary correction and AI post-processing are enabled.
- Guidance is limited to 20 entries and 2,000 characters per segment.
- Audio transcription, VAD, chunking, overlap, encoding, and merge behavior remain unchanged.
- Existing untracked `src/assets/` is not modified.
- No push or release is performed.

---

### Task 1: Contextual Guidance Selection

**Files:**
- Create: `src/application/services/ContextualDictionaryGuidance.ts`
- Test: `tests/application/services/ContextualDictionaryGuidance.test.ts`

**Interfaces:**
- Consumes: `ContextualCorrection[]` and one source text segment.
- Produces: `selectContextualGuidance(entries, segment, limits?): ContextualGuidanceEntry[]` and `formatContextualGuidance(entries): string`.

- [ ] **Step 1: Write failing tests** for relevance by variant, canonical spelling, and context keyword; stable priority ordering; the 20-entry cap; and the 2,000-character cap.
- [ ] **Step 2: Run** `npm test -- --runInBand --runTestsByPath tests/application/services/ContextualDictionaryGuidance.test.ts` and verify the missing-module failure.
- [ ] **Step 3: Implement the pure selector and formatter** without mutating stored entries. The formatted guidance must state the recognized variants, canonical spelling, and optional context keywords, and must tell the model not to insert absent terms.
- [ ] **Step 4: Re-run the focused test** and verify all cases pass.

### Task 2: Fixed-Only Local Correction

**Files:**
- Modify: `src/application/TranscriptionController.ts`
- Modify: `tests/application/TranscriptionController.test.ts`
- Modify: `tests/core/transcription/DictionaryCorrector.test.ts`

**Interfaces:**
- `createDictionaryCorrector()` continues returning `DictionaryCorrector` but loads only `definiteCorrections`.
- Stored contextual entries remain untouched and are consumed later by post-processing.

- [ ] **Step 1: Add a failing controller test** proving dictionary-only transcription replaces a fixed variant but leaves a contextual variant unchanged.
- [ ] **Step 2: Run the focused controller test** and verify it fails because contextual rules are still loaded locally.
- [ ] **Step 3: Remove contextual entries from the controller conversion path** and rename comments/tests so `DictionaryCorrector` documents fixed deterministic replacement only.
- [ ] **Step 4: Run the controller and corrector suites** and verify they pass.

### Task 3: Exact Segmentation and Per-Segment AI Guidance

**Files:**
- Create: `src/application/services/PostProcessingSegments.ts`
- Create: `tests/application/services/PostProcessingSegments.test.ts`
- Modify: `src/application/services/PostProcessingService.ts`
- Create: `tests/application/services/PostProcessingService.test.ts`

**Interfaces:**
- Produces: `segmentTranscriptionPreservingSeparators(text, maxChars): string[]` where `segments.join('') === text`.
- `PostProcessingService.processTranscription(transcription, metaInfo, contextualCorrections?, signal?)` selects guidance separately for every segment.

- [ ] **Step 1: Add failing pure tests** for short text, newline boundaries, punctuation boundaries, forced splitting, blank lines, and byte-for-byte recombination.
- [ ] **Step 2: Add a failing service test** using a mocked client to prove each segment receives only relevant guidance and a failed segment retains its original source text.
- [ ] **Step 3: Add the 40,000-character ordered-marker test** and verify at least three segments retain every marker exactly once and in order.
- [ ] **Step 4: Run the new tests** and verify their expected failures.
- [ ] **Step 5: Implement exact segmentation** and integrate per-segment guidance, bounded audit logging, cancellation checks, and source-segment fallback.
- [ ] **Step 6: Re-run the focused service and segmentation tests** and verify they pass.

### Task 4: Prompt and Client Integration

**Files:**
- Modify: `src/config/openai/PostProcessingConfig.ts`
- Modify: `src/infrastructure/api/openai/PostProcessingClient.ts`
- Modify: `tests/config/openai/PostProcessingConfig.test.ts`
- Modify: `tests/infrastructure/api/openai/PostProcessingClient.test.ts`

**Interfaces:**
- `buildPostProcessingRequest(..., contextualGuidance?: string)` adds one bounded guidance section to the existing request.
- `PostProcessingClient.processTranscription(..., contextualGuidance?, signal?)` makes exactly one post-processing call per segment.

- [ ] **Step 1: Add failing request tests** proving guidance appears when supplied, is absent when empty, and does not create another request payload.
- [ ] **Step 2: Run the focused config/client tests** and verify they fail on the missing argument/section.
- [ ] **Step 3: Extend the prompt builder and client signature** while preserving completion-token calculation and integrity validation.
- [ ] **Step 4: Re-run the focused tests** and verify they pass.

### Task 5: Dialog, Dictionary Manager, and Documentation

**Files:**
- Modify: `src/ui/ApiTranscriptionModal.ts`
- Modify: `src/ui/DictionaryManagementModal.ts`
- Modify: `src/i18n/locales.ts`
- Modify: `src/i18n/translations/ja.ts`
- Modify: `src/i18n/translations/en.ts`
- Modify: `src/i18n/translations/zh.ts`
- Modify: `src/i18n/translations/ko.ts`
- Modify: `README.md`
- Test: `tests/ui/ApiTranscriptionModal.cleanup.test.ts`

**Interfaces:**
- The modal passes a snapshot of contextual entries only when both toggles are enabled.
- The dictionary description changes immediately when either toggle changes.

- [ ] **Step 1: Add failing UI/i18n assertions** for the concise Japanese copy and the dictionary-on/AI-off state description.
- [ ] **Step 2: Run the focused UI test** and verify the missing copy/state behavior.
- [ ] **Step 3: Implement the dynamic description and contextual-entry snapshot**, add concise equivalent translations, and add section descriptions in the dictionary manager.
- [ ] **Step 4: Update README disclosures** to distinguish fixed no-API correction from contextual guidance sent only with AI post-processing.
- [ ] **Step 5: Re-run the focused UI test** and verify it passes.

### Task 6: Full Verification and Commit

**Files:**
- Verify all modified source, tests, docs, and generated `build/**` output.

- [ ] **Step 1: Run** `npm test -- --runInBand` and verify zero failed suites.
- [ ] **Step 2: Run** `npm run lint` and verify zero errors or warnings.
- [ ] **Step 3: Run** `npm run build` and verify TypeScript and bundling complete successfully.
- [ ] **Step 4: Run generated-output lint** using the repository ESLint configuration against `build/**/*.js` and record any justified generated-only exclusions.
- [ ] **Step 5: Run** `git diff --check`, inspect `git diff --stat`, and confirm no VAD, audio API, model, version, manifest, or `src/assets/` changes.
- [ ] **Step 6: Re-check** `obsidian-developer-docs/en/Obsidian October plugin self-critique checklist.md` for the changed UI, network disclosure, and mobile-safe code.
- [ ] **Step 7: Commit the implementation** with a focused imperative message. Do not push or publish.
