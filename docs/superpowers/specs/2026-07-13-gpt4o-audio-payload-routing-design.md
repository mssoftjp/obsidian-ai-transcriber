# GPT-4o audio payload routing and VAD semantics design

## Status

Approved direction. This document defines the implementation boundary; it does not authorize publication or push.

## Problem statement

The current `server` VAD mode mixes two independent concerns:

1. whether the client uploads one audio file or creates client-side chunks; and
2. whether `chunking_strategy=auto` is sent to the transcription API.

For a selected range, `TranscriptionJobPlan` always chooses the client path before the selected audio has been prepared. The client path creates approximately four-minute chunks, but `TranscriptionController.prepareWorkflowOptions()` still adds `chunking_strategy=auto` to every chunk when `vadMode === 'server'`. A live GPT-4o Mini Transcribe run produced multilingual hallucinations and severe proper-noun degradation, while a comparable run without the parameter produced acceptable raw text.

The immediate defect is the use of server chunking semantics on audio that the client has already divided. The broader design defect is that upload transport, local VAD, and API chunking semantics are represented by one setting.

## Confirmed constraints

- The transcription endpoint accepts audio files, not start/end offsets. A selected range must therefore be decoded and trimmed before it can be sent alone.
- Browser `decodeAudioData()` decodes the full source before the selected range can be retained.
- The retained working representation is 16 kHz mono `Float32Array` PCM.
- Encoded audio must never be the source of later time-based splitting. Splitting is performed on PCM views.
- The API upload limit is 25 MiB. Client planning uses a 90% payload target of 22.5 MiB.
- The existing Opus encoder targets 48 kbps variable bitrate. The existing WAV fallback is 16 kHz mono 16-bit PCM.
- `chunking_strategy` is accepted by the API schema, but the documented required use is for `gpt-4o-transcribe-diarize` on inputs longer than 30 seconds. The quality behavior for ordinary GPT-4o Transcribe and GPT-4o Mini Transcribe is not specified. This plugin must not depend on that unspecified behavior.
- Existing local VAD reconstruction remains out of scope.

## Goals

- Stop the transcription-quality regression immediately.
- Keep decoding to at most once for any client-prepared path.
- Avoid producing a full WAV or WebM that is known in advance to require splitting.
- Avoid decoding an encoded WebM merely to split it.
- Preserve the original file direct-upload optimization when no transformation is required.
- Make upload routing independent from VAD selection.
- Keep fallback bounded to one transition and avoid retry loops.
- Preserve cancellation and media-budget enforcement.

## Non-goals

- Adding `gpt-4o-transcribe-diarize` support.
- Changing local VAD thresholds or speech reconstruction.
- Changing GPT-4o and GPT-4o Mini chunk-duration configuration.
- Changing dictionary correction, AI post-processing, transcription merging, or model pricing.
- Publishing or pushing a release.

## Decision

Use duration-and-codec planning before encoding, with retained PCM as the one fallback substrate.

The system does not first create a full encoded file to discover whether it is too large. Encoder capability and duration determine the planned payload shape. Actual encoded byte length is checked afterward as a safety assertion. If a single upload fails with a fallback-eligible size or format response, the retained PCM is divided and encoded as client chunks without another decode.

## Processing modes

### Local VAD

The existing local VAD path is unchanged. It may reconstruct speech-only PCM and then uses client chunking. No request created from client chunks receives `chunking_strategy`.

### No local preprocessing

The current persisted values `server` and `disabled` both map to no local preprocessing during the transition. They must not change API transcription semantics.

After settings migration, the public setting has two choices:

- No preprocessing
- Local VAD

Upload routing is automatic and is not presented as a VAD mode.

## State machine

### S0: Static source decision

Inputs: model, local preprocessing mode, source extension, source byte length, and whether a range is selected.

- If no range is selected, local VAD is off, the extension is supported, and the source is at or below 22.5 MiB, attempt original-file direct upload.
- Otherwise continue to S1.

Original-file direct upload sends no `chunking_strategy` for GPT-4o Transcribe or GPT-4o Mini Transcribe.

### S1: Decode and retain selected PCM

- Decode the source once.
- Retain only the selected range.
- Convert it to 16 kHz mono `Float32Array` PCM.
- Apply existing media-work-budget checks.
- Record the exact retained duration.

The PCM remains alive until a single upload succeeds or client chunks have been produced. It is not copied for chunk boundaries; chunks use `subarray()` views.

### S2: Payload planning

Determine Opus support before encoding.

#### Opus-capable path

Estimated payload bytes:

```text
durationSeconds * 6,000 * 1.2 + containerOverhead
```

The 1.2 multiplier covers VBR variation. Container overhead is conservatively included in the final byte-length assertion. At the current 48 kbps target, the configured 25-minute working duration remains well below 22.5 MiB.

- If retained duration is within the configured model duration bound and the conservative estimate is within 22.5 MiB, plan one WebM/Opus payload.
- Otherwise plan client chunks directly from PCM.

#### WAV-only path

Exact payload bytes:

```text
44 + durationSeconds * 16,000 * 2
```

- If the exact size is within 22.5 MiB and duration is within the configured model bound, plan one WAV payload.
- Otherwise plan client chunks directly from PCM.

At 22.5 MiB, a 16 kHz mono 16-bit WAV holds approximately 737 seconds. A longer range must never be encoded as one WAV merely to discover that it is too large.

### S3: Single prepared-payload encoding and upload

- Encode the full retained PCM once using the planned codec.
- In this state, Opus encoding failure must not silently create a full WAV. It returns a typed failure to the planner.
- Verify actual encoded bytes are within the 22.5 MiB target.
- Upload the prepared payload without `chunking_strategy`.
- Keep the PCM until the request succeeds.

Transitions:

- Success: release PCM and finish.
- Opus unsupported or Opus encoding failure: re-plan for WAV using S2. If a single WAV cannot fit, go directly to S4 without creating it.
- Actual encoded size over target: discard the encoded payload and go to S4.
- HTTP 413, or a narrowly classified 400 caused by payload size, duration, or format: go to S4 once.
- Authentication, quota, rate-limit, cancellation, or unrelated validation error: fail normally; do not fall back.

### S4: Client chunk encoding and upload

- Use the existing chunk-boundary service on retained PCM.
- Use PCM `subarray()` views; do not copy the full range for each chunk.
- Encode each chunk once using WebM/Opus when supported, otherwise WAV.
- Verify every encoded chunk against the upload limit and retained-output budget.
- Send chunks sequentially without `chunking_strategy`.
- Use the existing overlap merger.
- Release PCM and encoded chunks during normal workflow cleanup.

There is no fallback from S4 to S3 and no repeated fallback loop.

## Original direct-upload failure

The original source buffer is already loaded for the request. If the original direct upload receives an eligible 400/413 response, transition once to S1 and prepare PCM. The original file is decoded once; no filesystem read is repeated.

Other API failures remain terminal.

## Encoder API changes

The current `encodePcmForTranscription()` silently falls back from Opus to WAV. Preserve that behavior for bounded client chunks, but do not use it for single prepared payloads.

Introduce explicit capabilities and policy:

```ts
interface AudioEncodingCapabilities {
  opusSupported: boolean;
  opusBitrate: number;
}

type AudioEncodingPolicy =
  | { mode: 'prefer-opus-with-wav-fallback' }
  | { mode: 'opus-only' }
  | { mode: 'wav-only' };
```

The single-payload path uses `opus-only` or `wav-only`. The existing client-chunk path uses `prefer-opus-with-wav-fallback`.

Encoding failure must identify the attempted codec and preserve cancellation errors.

## Planner boundaries

Split planning into two stages:

1. `TranscriptionJobPlan`: source-level decision only, including zero-decode original direct upload.
2. `TranscriptionPayloadPlan`: decision after PCM duration and encoder capabilities are known.

Neither planner derives API request parameters from the persisted VAD mode. `chunking_strategy` is model-gated and absent for the currently supported GPT-4o Transcribe and GPT-4o Mini Transcribe models.

## Settings migration and UI

### Immediate behavior

- Stop attaching `chunking_strategy` to client chunks.
- Stop attaching it to ordinary GPT-4o/mini direct uploads once direct fallback is in place.
- Treat persisted `server` as no local preprocessing.

### Migration

- On load, migrate `vadMode: 'server'` to `vadMode: 'disabled'`.
- Remove `server` from new-setting choices.
- Default new installations to no preprocessing.
- Describe no preprocessing as retaining quiet and short speech and allowing automatic upload routing.
- Keep the local VAD warning that quiet or short speech may be lost.

Do not describe ordinary direct upload as server VAD.

## Error handling

- Cancellation is checked before and during cooperative conversion and encoding work.
- `decodeAudioData()` itself cannot be cancelled; check immediately after it resolves.
- Only payload-shape errors may trigger the single fallback transition.
- A client-chunk request failure is handled by the existing partial/error policy and never retries as one full payload.
- Typed planner and encoder errors must not be converted into an unrelated generic audio-decoding error.

## Memory and work bounds

- Selected PCM size: `durationSeconds * 16,000 * 4` bytes.
- At 25 minutes this is approximately 91.6 MiB.
- The source buffer, decoded `AudioBuffer`, selected PCM, encoder packets, and final payload can overlap temporarily. Existing `MediaWorkBudget` checks remain mandatory.
- Chunk boundaries use views, so chunk planning adds no full-range PCM copy.
- The Opus encoder currently retains encoded packets and then creates a final WebM copy. This remains within the prepared-payload budget but must be included in projected peak memory.
- Release references as soon as their state transition no longer needs them.

## Implementation sequence

Each item is a separate reviewable commit.

1. **Emergency quality fix**
   - Remove `chunking_strategy` from client-chunk requests.
   - Add request-parameter regression tests.

2. **Direct request semantics**
   - Decouple original-file direct upload from `vadMode === 'server'`.
   - Remove `chunking_strategy` from ordinary GPT-4o/mini direct requests.
   - Add one-step fallback from eligible direct-upload failures.

3. **Prepared payload planning**
   - Add encoding capability and size-estimation APIs.
   - Add `TranscriptionPayloadPlan`.
   - Support a selected range as one prepared payload when it fits.
   - Keep PCM for the bounded fallback transition.

4. **Settings migration and UI**
   - Migrate `server` to `disabled`.
   - Remove the server-VAD choice and update descriptions and documentation.

## Test strategy

### Planner unit tests

- Untrimmed supported source under target uses original direct upload.
- Untrimmed source over target enters PCM preparation.
- Any selected range enters PCM preparation, not original direct upload.
- Opus-capable 18-minute range plans one WebM payload.
- WAV-only 18-minute range plans client chunks without first producing a full WAV.
- WAV-only range below the calculated threshold plans one WAV.
- Duration over the configured model bound plans client chunks even when Opus size fits.

### Encoder unit tests

- Capability is checked before full encoding.
- `opus-only` failure does not create WAV.
- Client-chunk policy still falls back to WAV.
- Actual-size assertion rejects an oversized prepared payload.
- Abort propagates without WAV fallback.

### Request tests

- GPT-4o and GPT-4o Mini client requests omit `chunking_strategy`.
- GPT-4o and GPT-4o Mini direct requests omit `chunking_strategy`.
- A future diarize model may add it only through an explicit model gate.

### Workflow tests

- Prepared single upload succeeds with one decode and one encode.
- Prepared upload 413 falls back once to PCM chunks without another decode.
- Prepared upload unrelated 400 does not fall back.
- Opus encoding failure re-plans before WAV creation.
- Client chunks preserve existing boundaries, overlaps, sequential order, and merger behavior.
- Cancellation at decode completion, encoding, upload, and fallback is respected.
- Media-budget violations fail before allocating an oversized payload.

### Settings tests

- Persisted `server` migrates to `disabled`.
- New settings expose only no preprocessing and local VAD.
- Existing local VAD settings remain unchanged.

### Verification

- Run focused planner, encoder, controller, request, workflow, and settings tests.
- Run `npm test`, `npm run lint`, and `npm run build`.
- Lint generated output after build.
- Re-check the Obsidian October plugin self-critique checklist.
- Manually verify a short quiet-speech sample and the previously failing selected range with minimal API cost.

## Rollout and compatibility

- Preserve saved data by migrating the existing `server` value rather than rejecting it.
- Do not change note output format, frontmatter, dictionary behavior, or post-processing.
- Do not push or publish as part of implementation.
- Plugin-folder replacement and live Obsidian validation happen only after automated verification.

## Open questions resolved by this design

- A full WAV is never created when its size formula already requires client chunks.
- An encoded WebM is never decoded merely to split it.
- PCM remains the only fallback substrate.
- Normal execution encodes every retained sample once; only a failed single upload can cause a second encoding pass.
- Direct upload and server VAD are separate concepts.
- Ordinary GPT-4o/mini requests do not use unspecified server chunking behavior.
