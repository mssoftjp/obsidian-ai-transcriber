# Long-form transcription regression test

This test protects the highest-risk path: a long recording split into multiple local-VAD chunks, transcribed by a GPT-4o audio model, and merged without omissions or prompt contamination.

The committed assets contain synthetic text and local verification code only. Do not commit generated audio, API responses, plugin `data.json`, vault contents, or real user recordings.

## Generate the test audio

Requirements: macOS, `ffmpeg`, and `ffprobe`.

```bash
npm run test:long-form:generate
```

The default output is `/private/tmp/ai-transcriber-gpt4o-long-form.wav`. It is at least six minutes long, mono, 16 kHz PCM, and is intentionally written outside the repository.

## Obsidian test setup

- Use a disposable test vault.
- Install the locally built plugin and reload Obsidian.
- Set the model to GPT-4o Transcribe. Repeat with GPT-4o Mini Transcribe when that model changes.
- Set language to Japanese.
- Set voice activity detection to local.
- Disable post-processing and dictionary correction so that this test isolates chunking and merging.
- Keep debug mode off unless diagnosing a failure.
- Import only the synthetic WAV generated above.

These settings minimize API data: only the generated audio chunks, the configured language, and the bounded continuation context needed for merging are sent. Do not add vault notes, real names, API logs, or unrelated metadata to the prompt.

## Required checks

- [ ] The operation finishes with a completed status and no visible error.
- [ ] History reports at least two total chunks.
- [ ] Completed chunks equal total chunks.
- [ ] The output contains identifiers `1001` through `1020` in order.
- [ ] The output contains the final keyword `シリウス`.
- [ ] The output contains `これで合成音声を終了します。` (minor punctuation differences are acceptable).
- [ ] The output does not contain `【欠損:`.
- [ ] The output does not contain continuation-prompt instructions or other internal prompt text.
- [ ] No stale copy remains in the vault's `ai-transcriber-temp` folder.
- [ ] Retrying the same file does not reuse text from the previous run.

## Compressed chunk checks

Run these checks for time-range, local-VAD, and client-chunked GPT-4o/Whisper paths. The plugin must not require ffmpeg at runtime.

- [ ] When `AudioEncoder.isConfigSupported()` accepts mono Opus at the processed sample rate, every generated upload uses a `.webm` filename and `audio/webm` MIME type.
- [ ] Every WebM chunk is smaller than the corresponding 16-bit mono WAV estimate and remains below the provider file-size limit.
- [ ] Obsidian can decode a generated WebM chunk locally, with duration drift no greater than one 20 ms Opus frame.
- [ ] The long-form result still passes all identifier-order and final-keyword checks above.
- [ ] Only the selected time range is encoded and uploaded; the original full file is not attached to a range request.
- [ ] If WebCodecs, Opus support detection, encoding, or muxing fails before upload, the same operation completes through the WAV fallback.
- [ ] No temporary encoded chunk is written outside the vault or retained after the operation.

Repeat the capability and fallback checks on both macOS and Windows. Electron uses Chromium's codec implementation on both platforms, but each runtime must still be probed instead of assuming codec availability from the operating system. An unsupported runtime is acceptable only when the WAV fallback succeeds without changing the user workflow.

## Machine-check the result

Run the transcript-only check:

```bash
npm run test:long-form:verify -- /path/to/transcript.md
```

For a disposable vault, the plugin state can also be checked. The state file contains the API key, so pass its local path to the verifier but never copy or commit it:

```bash
npm run test:long-form:verify -- /path/to/transcript.md \
  --history /path/to/test-vault/.obsidian/plugins/ai-transcriber/data.json
```

The verifier reads only the matching history entry for its assertions and prints no settings or secrets. If the generated WAV was renamed, add `--input-name renamed.wav`.

## Local checks before committing related changes

```bash
npm run test:long-form:verifier
npm test -- --runInBand
npm run lint
npm run build
```

The automated suite includes the audio-only WebM muxer, WebCodecs capability/failure fallback, generated-chunk metadata propagation, and GPT-4o/Whisper multipart filename and MIME checks. The platform checks above remain real-app acceptance tests because Jest does not ship a browser media codec implementation.

This synthetic case complements unit tests; it does not prove that every accent, codec, noisy recording, API response, or duration is defect-free. When a new long-form defect is found, first add a focused unit regression and then extend this checklist or fixture only when the end-to-end acceptance condition changed.
