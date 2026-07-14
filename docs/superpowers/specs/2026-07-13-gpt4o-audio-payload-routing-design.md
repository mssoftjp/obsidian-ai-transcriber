# GPT-4o audio payload routing and VAD semantics design

## Status

Revised design for user review. This document is the implementation contract only after approval. It does not authorize implementation, publication, or push.

## Problem statement

The current `server` VAD mode combines three independent decisions:

1. whether speech is removed locally;
2. whether the original file or client-created chunks are uploaded; and
3. whether `chunking_strategy=auto` is sent to OpenAI.

For a selected range, the current planner chooses the client path and creates approximately four- or five-minute chunks. The controller then adds `chunking_strategy=auto` to each already-split chunk when `vadMode === 'server'`. A live GPT-4o Mini Transcribe run produced multilingual hallucinations and severe proper-noun degradation, while a comparable run without that parameter produced acceptable raw text.

The immediate defect is applying server chunking to client-created chunks. The structural defect is that preprocessing, payload routing, and API request parameters are represented by one VAD setting.

## Current official API facts

- The transcription endpoint receives an audio file; it does not receive start and end offsets.
- The current official guide lists the normal transcription examples without `chunking_strategy`.
- The current API schema says that, when `chunking_strategy` is unset, audio is transcribed as one block.
- The current guide requires `chunking_strategy` only for `gpt-4o-transcribe-diarize` inputs longer than 30 seconds. This plugin does not support that model.
- The official documentation describes an upload limit of 25 MB. It does not define a separate 25-minute hard limit for ordinary GPT-4o Transcribe or GPT-4o Mini Transcribe.
- The supported input formats include FLAC, MP3, MP4, MPEG, MPGA, M4A, OGG, WAV, and WebM. The plugin may keep a narrower tested allowlist.

Therefore normal GPT-4o Transcribe and GPT-4o Mini Transcribe requests in this plugin do not send `chunking_strategy`.

## Confirmed local constraints

- A selected range must be decoded and trimmed before only that range can be sent.
- Browser `decodeAudioData()` decodes the source before the selected range can be retained.
- The client working representation is 16 kHz mono `Float32Array` PCM.
- Encoded WebM or WAV is never used as the source for later time-based splitting. All splitting uses PCM `subarray()` views.
- The existing Opus encoder targets 48 kbps variable bitrate.
- The existing WAV encoder produces 16 kHz mono 16-bit PCM.
- The current local VAD path decodes the source, reconstructs speech, encodes an intermediate WAV, and the audio pipeline decodes that WAV again. Refactoring local VAD to return PCM directly is a separate improvement.
- The current `AudioPipeline.process()` combines PCM preparation and payload creation. The new routing cannot be implemented safely until those stages are separated.
- `ApiClient` creates structured `ApiError` objects, but `GPT4oClient` currently converts them into string-only failed results. Structured error metadata must survive to the routing layer.

## Design axes

The implementation treats the following as independent axes.

### Axis A: preprocessing

- `none`: retain all audio, including quiet and short speech.
- `local-vad`: locally detect speech and reconstruct speech-only audio.

The persisted legacy value `server` is not a third preprocessing algorithm. It migrates to `none`.

### Axis B: payload route

- `original-direct`: upload the unchanged source file once.
- `prepared-single`: decode or trim once, encode the retained PCM once, and upload one prepared file.
- `client-chunks`: split retained PCM into bounded overlapping chunks, encode them, and upload them sequentially.

The route is chosen automatically. It is not a user-facing VAD selection.

### Axis C: API chunking parameter

- GPT-4o Transcribe: absent.
- GPT-4o Mini Transcribe: absent.
- A future diarization model may opt in through an explicit model capability. It is outside this design.

No route in this design infers API parameters from the VAD setting.

## Canonical limits and terminology

One capability source owns all arithmetic limits. The following values have different purposes and must not be reused interchangeably.

| Name | Value | Meaning |
|---|---:|---|
| `documentedUploadLimit` | 25 MB | Human-readable external API limit; not used directly for allocation arithmetic |
| `maxUploadPayloadBytes` | 23,000,000 bytes | Conservative plugin limit for the encoded file itself, not the complete multipart request body |
| `maxSingleRequestDurationSeconds` | 1,500 seconds | Plugin policy for original and prepared single-file requests; not claimed as an API hard limit |
| `webmOverheadAllowanceBytes` | 512,000 bytes | Fixed allowance added after the Opus VBR multiplier |
| `clientChunkTargetSeconds` | 300 seconds for GPT-4o and GPT-4o Mini | Shared quality and latency target for client chunks; not an API limit |
| `maxClientProcessDurationSeconds` | 7,200 seconds | Existing absolute client-processing duration ceiling; memory checks may reject earlier |

The tested original-direct extension allowlist remains explicit: `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, and `webm`. Other API-supported formats may be added only after plugin-level tests.

The existing 20 MB service limit, 25 MiB planner limit, 25-minute service value, and 30-minute configuration value must not remain as competing sources. Validation, planning, and logging read the canonical capability object.

GPT-4o and GPT-4o Mini use the same 300-second client chunk target. Only the target duration is unified; model-specific pricing, prompts, and merge thresholds remain unchanged. `clientChunkTargetSeconds` is never treated as a server limit.

## Goals

- Remove the quality-risking `chunking_strategy=auto` behavior from ordinary GPT-4o and GPT-4o Mini requests.
- Make every routing condition explicit and independently testable.
- Preserve unchanged-file direct upload when no client transformation is required.
- Allow a selected range that fits safely to be uploaded as one prepared payload.
- Avoid creating a full WAV or WebM when planning already proves it must be split.
- Preserve structured API errors so fallback decisions do not depend on message text.
- Keep fallback monotonic and finite, with each fallback edge traversed at most once.
- Preserve cancellation and media-work-budget enforcement.

## Non-goals

- Adding `gpt-4o-transcribe-diarize`.
- Changing local VAD thresholds or speech reconstruction.
- Refactoring local VAD to return PCM directly.
- Changing dictionary correction, AI post-processing, merging, note output, or pricing.
- Publishing or pushing a release.

## Alternatives considered

### A. Remove `chunking_strategy` only

This is the smallest emergency fix and must be the first implementation commit. It stops the observed quality regression but leaves selected ranges unnecessarily divided and leaves transport coupled to VAD terminology.

### B. Encode a full file, inspect its bytes, then split if necessary

Rejected. A WAV can be known to exceed the upload limit before encoding, and an encoded WebM is the wrong substrate for time-based splitting. This also increases peak memory and can cause an extra decode.

### C. Separate preparation, payload planning, and upload

Selected. The client prepares PCM only when transformation is necessary, chooses a route from explicit duration and codec conditions, and retains PCM for bounded monotonic fallback. This is more code than option A but gives deterministic behavior and testable boundaries.

## High-level flow

```text
source file
  |
  |-- no transformation + known duration <= 1,500 seconds
  |   + tested format + exact bytes <= 23,000,000
  |      -> original-direct
  |
  `-- otherwise
         -> prepare retained PCM
              |
              |-- single-payload conditions pass
              |      -> prepared-single
              |
              `-- conditions fail
                     -> client-chunks
```

Local VAD is a separate preprocessing branch. Until it returns PCM directly, it keeps its legacy reconstruct-and-redecode flow and always enters client chunking. It never sends `chunking_strategy`.

## Source-level decision table

Resolve the effective preprocessing mode before running the source-level planner. If local VAD was requested, its availability must be known at this point; the planner must not guess that availability and revise the meaning of the route later. Pass the duration already measured by the transcription modal as optional source metadata. The source-level planner then runs before transcription-pipeline decoding.

| Condition | Result |
|---|---|
| Model is not GPT-4o Transcribe or GPT-4o Mini Transcribe | Use the existing model-specific workflow; this design does not apply |
| Local VAD is requested and available | Run the existing local VAD preprocessing branch, then client chunking |
| Local VAD is requested but unavailable | Notify once, set effective preprocessing to `none`, and continue through this table |
| Any time range is selected | Prepare PCM; original direct upload is forbidden |
| No range, preprocessing is `none`, duration is known and `<= maxSingleRequestDurationSeconds`, extension is in the tested direct allowlist, and exact source bytes are `<= maxUploadPayloadBytes` | `original-direct` |
| No range, but source duration is unknown or exceeds `maxSingleRequestDurationSeconds` | Prepare PCM |
| No range, but extension is not in the tested direct allowlist | Prepare PCM |
| No range, but exact source bytes are `> maxUploadPayloadBytes` | Prepare PCM |

The source buffer is read once by the transcription pipeline. The modal supplies known duration rather than asking the direct route to decode merely to discover it. Non-modal callers that cannot supply duration take the prepare-PCM route.

## Processing states

### R0: original-direct

Preconditions:

- no selected range;
- effective preprocessing is `none`;
- known source duration is positive and at or below `maxSingleRequestDurationSeconds`;
- source extension is in the tested direct allowlist; and
- exact source bytes are at or below `maxUploadPayloadBytes`.

Behavior:

- Upload the unchanged source file.
- Do not send `chunking_strategy`.
- Perform no additional transcription-pipeline decode.

Transitions:

- Success -> finish.
- HTTP 413 -> transition once to P0.
- Any other API error -> fail without route fallback.
- Cancellation -> stop immediately.

### P0: prepare retained PCM

Behavior:

1. Decode the source once.
2. Validate the selected range against decoded duration.
3. Retain the full audio or selected range.
4. Convert it to 16 kHz mono `Float32Array` PCM.
5. Apply media-work-budget checks before large retained allocations.
6. Record exact retained sample count and duration.

Output:

```ts
interface PreparedAudio {
  pcmData: Float32Array;
  sampleRate: 16000;
  channels: 1;
  durationSeconds: number;
}
```

This decode-once guarantee applies only to the `none` preprocessing path. The existing local VAD branch is explicitly excluded.

After preparation, run P1.

### P1: choose prepared payload shape

First determine whether WebCodecs Opus is supported for the target sample rate.

#### If Opus is supported

Use a conservative estimate:

```text
estimatedBytes = durationSeconds * 6,000 * 1.20 + 512,000
```

Choose `prepared-single` only when both conditions hold:

- `durationSeconds <= maxSingleRequestDurationSeconds`; and
- `estimatedBytes <= maxUploadPayloadBytes`.

Otherwise choose `client-chunks` without first encoding the full PCM.

#### If Opus is unavailable

WAV bytes are exact:

```text
wavBytes = 44 + pcmSampleCount * 2
```

Choose `prepared-single` only when both conditions hold:

- `durationSeconds <= maxSingleRequestDurationSeconds`; and
- `wavBytes <= maxUploadPayloadBytes`.

Otherwise choose `client-chunks` without creating a full WAV.

At the 23,000,000-byte plugin limit, a 16 kHz mono 16-bit WAV holds approximately 718 seconds. An 18-minute selected range therefore uses one WebM when Opus is available and client chunks when only WAV is available.

### P2: prepared-single

Behavior:

- Encode all retained PCM with the planned codec.
- In the Opus-planned state, an Opus failure does not silently encode a full WAV.
- Verify the actual encoded byte length before upload.
- Upload without `chunking_strategy`.
- Retain PCM until the request succeeds or transitions to P3.

Local encoding transitions:

| Condition | Result |
|---|---|
| Opus succeeds and actual bytes `<= maxUploadPayloadBytes` | Upload WebM |
| Opus succeeds but actual bytes exceed the limit | Discard WebM and transition once to P3 |
| Opus fails and exact WAV size fits both single-payload conditions | Encode one WAV, then upload |
| Opus fails and WAV cannot fit | Transition to P3 without creating a full WAV |
| WAV encoding fails | Fail; do not retry another route |
| Cancellation at any point | Stop; do not try WAV or chunks |

API transitions:

| Condition | Result |
|---|---|
| Success | Release PCM and finish |
| HTTP 413 | Transition once to P3 |
| HTTP 400 | Fail; do not infer size or format from message text |
| HTTP 401/403 | Fail as authentication/authorization error |
| HTTP 408/429/5xx or local timeout | Use only the existing request retry policy; do not change payload route |
| Cancellation | Stop immediately |
| Any other error | Fail without route fallback |

### P3: client-chunks

Behavior:

- Calculate boundaries from `PreparedAudio` and the canonical client chunk configuration.
- Use PCM `subarray()` views; do not copy the full retained range for each boundary.
- Encode each chunk once, preferring WebM/Opus and allowing the existing WAV fallback.
- Validate every actual chunk against `maxUploadPayloadBytes` before sending.
- Send chunks sequentially without `chunking_strategy`.
- Preserve existing overlaps, continuation context, merger behavior, partial-result policy, and progress reporting.
- Preserve the existing bounded chunk-array workflow and release its encoded chunks during workflow cleanup.
- Release retained PCM after the workflow completes or fails.

Because the configured client chunk targets are far below both the 48 kbps Opus and 16 kHz WAV byte limits, an oversized encoded client chunk is an invariant failure. It is not recursively split after encoding. The planner or canonical configuration must be fixed instead.

There is no transition from P3 back to P2 and no repeated fallback loop.

## Fallback matrix

| Current route | Trigger | Next route | Maximum occurrences |
|---|---|---|---:|
| `original-direct` | HTTP 413 | prepare PCM, then re-plan | 1 |
| `prepared-single` WebM | local Opus failure | one WAV if it fits; otherwise chunks | 1 |
| `prepared-single` | actual encoded bytes over limit | client chunks | 1 |
| `prepared-single` | HTTP 413 | client chunks | 1 |
| any route | HTTP 400 | none; terminal | 0 |
| any route | auth, quota, rate limit, timeout, server error | none; normal error/retry policy only | 0 |
| `client-chunks` | any request failure | none; existing partial/error policy | 0 |
| any route | cancellation | none; cancelled | 0 |

Automatic fallback never depends on an English or localized error message.

## Component boundaries

### `PreprocessingModeResolver`

Resolves the requested setting to an effective mode before source routing:

- `disabled` -> `none`;
- legacy `server` -> `none`;
- available local VAD -> `local-vad`; and
- unavailable local VAD -> one notice, then `none`.

The source planner receives only the effective mode and never checks WASM availability itself.

### Transcription source metadata

The transcription modal passes its already-measured duration through `APITranscriber` and `TranscriptionController`:

```ts
interface TranscriptionSourceMetadata {
  durationSeconds?: number;
}
```

Only finite positive duration is accepted as known. Missing or invalid duration is treated as unknown and cannot qualify for original direct upload.

### `TranscriptionJobPlan`

Owns only the pre-decode source decision:

- model applicability;
- effective preprocessing mode;
- selected-range presence;
- optional known source duration;
- tested source extension; and
- exact source bytes.

It returns `original-direct`, `prepare-pcm`, or `legacy-local-vad`. It does not contain `chunkingStrategy`.

### `AudioPipeline.prepareAudio()`

Owns decoding, range validation, trimming, mono conversion, resampling, cancellation checks, and media-work-budget checks. It returns `PreparedAudio` and does not encode or create chunks.

### `TranscriptionPayloadPlanner`

Owns codec capability inspection, byte estimation, the prepared-single duration policy, and selection of `prepared-single` or `client-chunks`. It performs no encoding.

### `TranscriptionPayloadEncoder`

Owns explicit encoding policies:

```ts
type AudioEncodingPolicy =
  | { mode: 'opus-only' }
  | { mode: 'wav-only' }
  | { mode: 'prefer-opus-with-wav-fallback' };
```

The prepared-single route uses `opus-only` or `wav-only`. Client chunks use `prefer-opus-with-wav-fallback`.

### `GPT4oClient` and failure results

Owns request serialization. Ordinary GPT-4o and GPT-4o Mini request types do not expose `chunkingStrategy`.

To preserve the existing partial-result behavior for client chunks, non-cancellation request failures remain `TranscriptionResult` values with `success: false`. Add structured metadata alongside the existing user-facing `error` string:

```ts
interface TranscriptionFailure {
  kind: 'http' | 'timeout' | 'network' | 'unknown';
  status?: number;
  code?: string;
  details?: unknown;
  message: string;
}

interface TranscriptionResult {
  // existing fields remain
  failure?: TranscriptionFailure;
}
```

Cancellation is the exception: `RequestCancelledError` or an aborted signal is rethrown immediately so the workflow unwinds instead of becoming a failed chunk. The direct routing layer checks `result.failure.kind` and `result.failure.status`; it never parses `error` or `failure.message` to choose a route.

## Local VAD compatibility

Local VAD is intentionally isolated from the new decode-once claim.

The transcription modal currently decodes audio once for waveform and duration display. That UI-owned decode is not reused by the transcription pipeline, so the decode-once statement in this design means at most one additional source decode inside the no-preprocessing transcription pipeline. Reusing the waveform `AudioBuffer` would require a separate ownership and lifetime design and is outside this change.

Current local VAD flow:

```text
source -> decode -> speech reconstruction -> intermediate WAV
       -> decode again -> client boundary selection -> chunk encoding -> upload
```

Required behavior in this implementation:

- keep speech detection, padding, and reconstruction unchanged;
- keep client chunk boundaries and overlap behavior unchanged;
- remove `chunking_strategy` from all resulting requests;
- rename `serverSideVADFallback` semantics to an effective no-preprocessing fallback;
- if local VAD is unavailable, notify the user once and route as preprocessing `none`;
- do not claim that this path decodes only once.

A later design may make local VAD return `PreparedAudio` directly and remove the intermediate WAV and second decode.

## Settings migration and UI semantics

- On load, normalize persisted `vadMode: 'server'` to `vadMode: 'disabled'`.
- New settings expose only no preprocessing and local VAD.
- New installations default to no preprocessing.
- No preprocessing is described as retaining quiet and short speech while upload routing is automatic.
- Local VAD is described as potentially reducing uploaded audio and cost when silence is substantial, with the warning that quiet or short speech may be lost.
- Do not describe original direct upload or automatic routing as server VAD.
- Remove `server` from the dropdown and translations after migration coverage exists.

## Cancellation, memory, and lifetime

- Check cancellation before decoding, immediately after `decodeAudioData()` resolves, during cooperative conversion and encoding, before each upload, and before each fallback transition.
- `decodeAudioData()` itself cannot be cancelled.
- Selected PCM uses `durationSeconds * 16,000 * 4` bytes. At 25 minutes this is approximately 91.6 MiB.
- Existing `MediaWorkBudget` checks remain mandatory and separate from API payload limits.
- Chunk boundary arrays are views, not full-range copies.
- The source buffer and prepared PCM are released as soon as the current state no longer needs them.
- P2 retains PCM only because it is the substrate for the one allowed downgrade to P3.
- P3 retains only the existing budget-bounded chunk array and releases it during workflow cleanup. Streaming chunk generation is outside this design.

## Implementation sequence

Each item is a separate reviewable commit. No implementation starts until this revised design is approved and an implementation plan is written.

1. **Emergency request fix**
   - Remove `chunking_strategy` from both client and direct ordinary GPT-4o/mini requests.
   - Remove it from ordinary request types and add serialization regression tests.

2. **Error and capability contracts**
   - Preserve typed request failures through `GPT4oClient` and the service boundary.
   - Introduce the canonical limits object and remove competing 20/25/30-minute arithmetic sources.
   - Set the GPT-4o and GPT-4o Mini client chunk target to the shared 300-second value.
   - Add error-classification and capability tests.

3. **Preparation and payload stage separation**
   - Split `AudioPipeline.process()` into preparation and payload creation responsibilities.
   - Add `PreparedAudio`, codec capability inspection, and explicit encoding policies.
   - Keep local VAD behavior isolated and unchanged.

4. **Automatic routing and bounded fallback**
   - Implement the source-level decision table.
   - Implement prepared-single planning and bounded 413 fallback.
   - Preserve client chunk merging and sequential upload behavior.

5. **Settings migration and UI**
   - Migrate `server` to `disabled`.
   - Remove the server option and update descriptions, translations, README, and screenshots as required.

## Test strategy

### Source planner tests

- No range, no local VAD, known duration at or below 1,500 seconds, tested extension, and exact bytes at or below 23,000,000 -> original direct.
- Unknown duration -> prepare PCM.
- Known duration over 1,500 seconds -> prepare PCM even when source bytes fit.
- Exact bytes at 23,000,001 -> prepare PCM.
- Any selected range -> prepare PCM.
- Unsupported direct extension -> prepare PCM.
- Local VAD available -> legacy local VAD path.
- Local VAD unavailable -> notify and use no-preprocessing routing.
- Legacy `server` resolves to no preprocessing before planning.

### Payload planner tests

- Opus-capable 18-minute range -> one WebM.
- WAV-only 18-minute range -> client chunks without full WAV creation.
- WAV-only retained audio at the exact calculated byte boundary -> one WAV.
- One sample over the WAV boundary -> client chunks.
- Retained duration over 1,500 seconds -> client chunks even when Opus size fits.
- Planner performs no encoding.

### Encoder tests

- `opus-only` failure does not create WAV.
- A failed Opus single payload creates one WAV only when exact WAV conditions pass.
- Client chunk policy retains WAV fallback.
- Actual-size assertion rejects an oversized prepared payload.
- Cancellation prevents codec fallback.

### Request and error tests

- GPT-4o and GPT-4o Mini direct requests omit `chunking_strategy`.
- GPT-4o and GPT-4o Mini client requests omit `chunking_strategy`.
- `ApiError` status, code, and details survive the GPT-4o client/service boundary in `TranscriptionResult.failure`.
- Cancellation is rethrown and is not converted into a failure result.
- HTTP 413 is fallback-eligible.
- HTTP 400 is terminal regardless of message contents.
- Authentication, rate-limit, timeout, server, network, and cancellation errors do not change routes.

### Workflow tests

- Original direct success performs zero additional transcription-pipeline decodes and one upload.
- A two-hour input never uses a single-file request; it enters client preparation and chunking, subject to the existing media-work budget.
- Original direct 413 performs one decode, re-plans, and never retries original direct.
- Prepared-single success performs one source decode and one successful encode.
- Prepared-single 413 uses retained PCM and client chunks without a second decode.
- Prepared-single unrelated failure does not fall back.
- Client chunks preserve existing boundaries, overlap, context, order, and merging.
- GPT-4o and GPT-4o Mini both plan around the 300-second target while retaining their existing model-specific merge rules.
- Client-chunk failure never retries as a larger payload.
- Local VAD reconstruction regression tests remain unchanged and do not assert one decode.
- Media-budget failures occur before oversized retained allocations.

### Settings tests

- Persisted `server` normalizes to `disabled`.
- New settings expose only no preprocessing and local VAD.
- Default is no preprocessing.
- Local VAD unavailable uses effective no preprocessing and emits one notice.

### Verification

- Run focused planner, encoder, controller, request, workflow, VAD, and settings tests.
- Run `npm test`, `npm run lint`, and `npm run build`.
- Lint generated JavaScript after build.
- Re-check the Obsidian October plugin self-critique checklist.
- Manually verify a quiet-speech sample and the previously failing selected range with minimal API cost.

## Invariants

The implementation is correct only if all of the following remain true:

1. Ordinary GPT-4o and GPT-4o Mini requests never contain `chunking_strategy`.
2. A selected range is never original-direct.
3. A single-file request is never planned when known or retained duration exceeds 1,500 seconds.
4. Encoded audio is never decoded merely to split it.
5. Known-oversized WAV is never created as one full payload.
6. Automatic API fallback is triggered only by HTTP 413.
7. No fallback decision parses an error message.
8. No route transition returns to an earlier route.
9. The no-preprocessing transcription pipeline decodes the source at most once.
10. The local VAD path is excluded from the decode-once claim until separately refactored.
11. API payload limits, client chunk targets, and media-work budgets remain distinct values.
12. VAD selection does not determine transport or API request parameters.

## Rollout and compatibility

- Preserve saved data by normalizing the legacy `server` value rather than rejecting it.
- Preserve output format, frontmatter, dictionary behavior, post-processing, and model pricing.
- Do not push or publish as part of implementation.
- Replace the installed plugin build and perform live Obsidian validation only after automated verification.

## Approval gate

Implementation planning begins only after the user reviews and approves this revised document. Implementation begins only after the resulting plan is also reviewed.
