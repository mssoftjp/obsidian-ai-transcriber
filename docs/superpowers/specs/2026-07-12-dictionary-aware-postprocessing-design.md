# Dictionary-aware safe post-processing specification

**Status:** Draft ready for implementation planning
**Created:** 2026-07-12
**Scope:** User dictionary correction and optional AI post-processing after transcription

## Summary

Users must be able to combine user dictionaries with optional AI post-processing without transcript truncation, unintended broad replacements, unnecessary network requests, or undisclosed dictionary transmission.

The feature keeps definite correction deterministic and local. Contextual correction is performed only as part of optional AI post-processing, using only the contextual dictionary guidance relevant to each text segment. It does not restore a separate whole-transcript AI dictionary-correction stage.

## Problem statement

The previous processing path contained two distinct AI text transformations after audio transcription:

1. dictionary-aware AI correction of the complete transcript; and
2. related-information-aware AI post-processing of the resulting transcript.

The first transformation had a bounded output that could return only the beginning of a long transcript. Removing that transformation prevents the known truncation failure, but also removes the intended ability for an AI model to interpret dictionary guidance.

The current candidate build applies contextual corrections locally against the complete transcript. In long recordings, a context keyword appearing once can therefore enable replacement in unrelated sections, while the interface does not make the dependency between contextual correction and AI post-processing clear.

## Goals

- Preserve the complete transcript under all dictionary and post-processing setting combinations.
- Keep definite dictionary corrections deterministic and local.
- Apply contextual dictionary corrections only when both the user dictionary and AI post-processing are enabled.
- Let optional AI post-processing interpret relevant contextual guidance without adding another text-transformation stage.
- Send the minimum dictionary data necessary for the current text segment.
- Preserve existing settings, stored dictionaries, output formats, and audio transcription behavior.
- Provide deterministic fallback when any AI post-processing segment is incomplete or fails.

## Non-goals

- Sending user dictionaries to the audio transcription model.
- Restoring the removed whole-transcript AI dictionary-correction request.
- Changing audio chunk duration, overlap, VAD, encoding, or merge behavior.
- Adding a new setting, model selector, runtime dependency, telemetry, or external service.
- Claiming full two-hour audio-file support. Long-audio decoding and waveform generation require a separate specification.
- Automatically modifying existing user dictionary data.

## Actors and data

### Actors

- **User:** Enables or disables dictionary correction and AI post-processing, manages dictionary entries, and optionally supplies related information.
- **Plugin:** Applies local definite correction, selects relevant contextual guidance, requests optional AI post-processing, validates results, and saves a complete transcript.
- **Text-processing provider:** Receives only the text segment and bounded guidance required when AI post-processing is enabled.

### Data entities

- **Definite correction:** One or more recognized variants mapped to one canonical spelling.
- **Contextual correction:** AI guidance containing variants, a canonical spelling, and optional context keywords; it is inactive when AI post-processing is disabled.
- **Related information:** User-supplied speakers, topics, keywords, and other contextual information for AI post-processing.
- **Post-processing segment:** A complete, ordered portion of the locally corrected transcript sent as one AI post-processing unit.
- **Contextual guidance:** A bounded list of contextual corrections selected as relevant to one post-processing segment.

## User scenarios and acceptance

### Scenario 1: Dictionary correction without AI post-processing

**Given** dictionary correction is enabled and AI post-processing is disabled
**When** transcription completes
**Then** definite corrections are applied locally
**And** contextual corrections are not applied
**And** no transcript text or contextual guidance is sent for text post-processing
**And** the complete locally corrected transcript is saved.

### Scenario 2: AI post-processing without dictionary correction

**Given** dictionary correction is disabled and AI post-processing is enabled
**When** transcription completes
**Then** the transcript and related information are post-processed
**And** no user dictionary entry is included as contextual guidance
**And** the complete validated result is saved.

### Scenario 3: Dictionary correction with AI post-processing

**Given** both features are enabled
**When** transcription completes
**Then** local definite correction runs first
**And** each AI post-processing segment receives only its relevant bounded contextual guidance
**And** no dictionary-specific AI request is made
**And** the complete validated result is saved.

### Scenario 4: Contextual correction while AI post-processing is disabled

**Given** the dictionary contains a contextual correction
**And** dictionary correction is enabled
**And** AI post-processing is disabled
**When** transcription completes
**Then** the contextual correction does not change the transcript
**And** the interface explains that only definite correction is currently active.

### Scenario 5: One AI segment fails or is incomplete

**Given** a transcript requires multiple post-processing segments
**And** one segment fails, ends incompletely, or violates integrity checks
**When** post-processing finishes
**Then** the locally corrected original of that segment is retained
**And** successful segments remain usable
**And** segment order and original separators are preserved
**And** no portion of the transcript is omitted.

### Scenario 6: Two-hour-equivalent transcript text

**Given** a synthetic Japanese transcript of at least 40,000 characters containing ordered markers at the beginning, at every segment boundary, and at the end
**When** dictionary correction and AI post-processing are applied
**Then** processing uses at least three ordered segments
**And** every marker remains present exactly once and in order
**And** the final tail remains present
**And** the result never falls back to a partial prefix.

## Functional requirements

### Settings and processing order

- **FR-001:** Dictionary correction and AI post-processing MUST remain independently selectable.
- **FR-002:** The processing order MUST be audio transcription, local definite correction, optional AI post-processing with contextual guidance, integrity validation, and save.
- **FR-003:** Enabling AI post-processing MUST NOT implicitly enable dictionary correction.
- **FR-004:** Enabling dictionary correction alone MUST NOT cause an additional network request containing transcript text.
- **FR-005:** Existing persisted settings and dictionaries MUST remain compatible without migration or user action.

### Local definite correction

- **FR-006:** Definite corrections MUST be applied locally and deterministically to all matching occurrences in the selected language dictionary.
- **FR-007:** Contextual corrections MUST NOT be applied by the local definite-correction stage, including contextual entries with no context keywords.
- **FR-008:** Contextual corrections MUST remain inactive whenever dictionary correction or AI post-processing is disabled.
- **FR-009:** Existing contextual dictionary entries MUST remain stored and editable even when they are inactive for the current job.
- **FR-010:** Cancellation during local correction MUST stop processing without saving a new completed result.

### Contextual guidance for AI post-processing

- **FR-011:** Contextual guidance MUST be generated only when both dictionary correction and AI post-processing are enabled.
- **FR-012:** Guidance for a segment MUST contain only contextual entries whose configured variant, canonical spelling, or context keyword occurs in that segment before or after local definite correction.
- **FR-013:** Guidance MUST be ordered by user priority from highest to lowest, with stable dictionary order used for equal priority.
- **FR-014:** Guidance MUST contain at most 20 entries and at most 2,000 characters per segment.
- **FR-015:** The complete user dictionary MUST NOT be transmitted when only a subset is relevant.
- **FR-016:** Guidance MUST identify canonical spellings and context keywords as correction assistance and MUST NOT instruct the AI to invent absent terms.
- **FR-017:** Contextual guidance MUST be included in the existing post-processing request for that segment; no separate dictionary-specific AI request is permitted.
- **FR-018:** Contextual guidance MUST NOT be added to audio transcription requests under this specification.

### Long-text segmentation and integrity

- **FR-019:** Long transcripts MUST be divided into ordered post-processing segments before any AI text request exceeds the configured safe segment size.
- **FR-020:** Segment boundaries MUST preserve the exact separator that existed in the locally corrected transcript.
- **FR-021:** Recombining unmodified segments MUST reproduce the locally corrected transcript exactly.
- **FR-022:** Each AI result MUST be accepted only when the provider reports normal completion and the result passes the configured integrity checks.
- **FR-023:** A rejected or failed segment MUST fall back to its complete locally corrected source segment.
- **FR-024:** Failure of one segment MUST NOT discard, duplicate, or reorder any other segment.
- **FR-025:** Logs MUST identify segment count, segment index, input length, output length, fallback status, and contextual-guidance count without logging transcript content, dictionary content, related information, or API credentials.

### Disclosure and user expectations

- **FR-026:** User-facing settings text MUST distinguish local dictionary correction from network-based AI post-processing.
- **FR-027:** Documentation MUST disclose that, when both features are enabled, relevant contextual dictionary guidance may be sent with AI post-processing text.
- **FR-028:** Documentation MUST state that dictionary correction without AI post-processing applies definite corrections locally and leaves contextual corrections inactive.
- **FR-029:** Cost estimates MUST treat AI post-processing as the only optional text-processing request path.
- **FR-030:** The dictionary setting description MUST state: `固定補正はAPIを使わないため、追加料金はかかりません。文脈補正はAI後処理がオンの場合のみ適用され、AI後処理の料金がかかります。`
- **FR-031:** The AI post-processing description MUST state: `AIで文字起こしを読みやすく整えます。文字起こしとは別にAPI利用料金がかかります。`
- **FR-032:** The dictionary manager MUST label its sections `固定補正` and `AI文脈補正` and explain the execution and transmission behavior of each.
- **FR-033:** When dictionary correction is enabled and AI post-processing is disabled, the interface MUST show: `現在は固定補正のみ有効です。追加料金はかかりません。文脈補正を使うにはAI後処理をオンにしてください。`
- **FR-034:** User-facing interface text MUST NOT include the redundant sentence `辞書補正専用の追加API呼び出しは行いません。`

## Approved interface copy

### Transcription dialog

**AI後処理を有効化**

> AIで文字起こしを読みやすく整えます。文字起こしとは別にAPI利用料金がかかります。

**ユーザー辞書を適用**

> 固定補正はAPIを使わないため、追加料金はかかりません。文脈補正はAI後処理がオンの場合のみ適用され、AI後処理の料金がかかります。

When dictionary correction is enabled and AI post-processing is disabled, show this persistent state explanation below the dictionary control:

> 現在は固定補正のみ有効です。追加料金はかかりません。文脈補正を使うにはAI後処理をオンにしてください。

### Dictionary manager

**固定補正**

> 一致する表記を自動置換します。APIを使わないため、追加料金はかかりません。

**AI文脈補正**

> AI後処理がオンの場合のみ、登録したキーワードと前後の内容を使って補正します。AI後処理の料金がかかります。

## Failure behavior

- If local definite correction fails unexpectedly, the uncorrected transcription remains available and the failure is reported without invoking an AI fallback for that stage.
- If related-information reduction fails, locally parsed related information is used.
- If one AI segment fails or is incomplete, that segment uses its locally corrected source.
- If all AI segments fail, the complete locally corrected transcript is saved and the UI reports that AI post-processing fell back.
- Cancellation does not convert an in-progress result into a completed result.

## Privacy and security requirements

- Dictionary correction without AI post-processing sends no dictionary or transcript text beyond the audio transcription request.
- AI post-processing sends only the current transcript segment, user-approved related information, and bounded relevant contextual guidance.
- No transcript, dictionary entry, related information, or API response body is written to console logs.
- No new telemetry, remote configuration, or third-party network destination is introduced.
- Network disclosure remains accurate in both English and Japanese documentation.

## Compatibility requirements

- Existing dictionary storage shape and setting keys remain unchanged.
- Existing output formats and note metadata remain unchanged.
- Existing audio transcription model, VAD, chunking, overlap, encoding, and merging behavior remain unchanged.
- The feature remains compatible with the currently declared Obsidian desktop support boundary.

## Edge cases

- Multiple variants map to the same canonical spelling.
- A contextual variant appears repeatedly in one segment with different surrounding meanings.
- A contextual entry has no context keywords but its configured variant appears in the segment.
- Equal-priority entries exceed the guidance cap.
- One entry contains non-Latin text, punctuation, or regex-significant characters.
- A transcript contains no newline for more than one segment length.
- Segment boundaries occur next to blank lines, spaces, or mixed-language punctuation.
- AI output is long enough to pass a length-ratio check but omits an internal section.
- The user cancels between segment requests.
- Dictionary settings change after a transcription job starts; the active job continues with its initial snapshot.

## Success criteria

- **SC-001:** All four dictionary/AI setting combinations produce the expected network-request behavior in automated tests.
- **SC-002:** A 40,000-character synthetic Japanese transcript retains 100% of ordered boundary markers and its final marker across at least three post-processing segments.
- **SC-003:** Recombining untouched segments is byte-for-byte equivalent to the locally corrected source text.
- **SC-004:** Every simulated incomplete, short, failed, or cancelled AI segment preserves the complete locally corrected text that is allowed by the cancellation state.
- **SC-005:** With dictionary correction enabled and AI post-processing disabled, definite corrections are applied and contextual corrections produce zero changes.
- **SC-006:** No post-processing request contains more than 20 contextual entries or 2,000 contextual-guidance characters.
- **SC-007:** Dictionary-only operation produces zero optional text-processing API calls.
- **SC-008:** Existing transcription, storage, VAD, and merge regression suites remain passing.
- **SC-009:** English and Japanese documentation accurately describe what is processed locally and what may be sent when AI post-processing is enabled.

## Assumptions

- The existing AI post-processing model and safe-output validation remain available.
- A 40,000-character Japanese transcript is a conservative text-level proxy for the observed output volume of an approximately two-hour recording; it is not proof of two-hour audio ingestion support.
- The current dictionary priority field is sufficient for deterministic guidance selection.
- AI post-processing remains opt-in and disabled by default.

## Separate follow-up specification required

Full two-hour audio support MUST be specified separately. That work needs to address duration discovery, waveform generation, encoded-file limits, decoded working-set limits, time-range selection, and incremental decoding without coupling those changes to dictionary semantics.

The follow-up specification should begin with this user outcome: opening the transcription dialog and starting an eligible long recording must not decode or retain the complete recording as uncompressed audio merely to display duration or a waveform.
