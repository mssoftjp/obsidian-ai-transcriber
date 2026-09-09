# Media duration and decoding regression checks

`npm run test:media` runs the production time-range UI and audio decoders in Chromium, using generated synthetic media. Obsidian host methods are substituted in the browser harness; `HTMLMediaElement`, Web Audio, Canvas and the embedded WMA worker are real. The test never sends audio to a transcription API.

## Setup

Install Node dependencies with `npm ci`, install `ffmpeg`/`ffprobe`, then run:

```sh
npx playwright install chromium
npm run test:media
```

Linux CI uses `npx playwright install --with-deps chromium`. Both the Quality workflow and the Release workflow run this suite. The Release workflow runs it before creating or uploading a GitHub release.

Fixtures are generated under ignored `tmp/media-browser/`. Only fixture recipes and test code are published. Large MP4/MOV fixtures contain a valid ISO BMFF `free` box, so size can cross the preview limit without storing a large binary in Git. Expected durations come independently from `ffprobe`, including container/encoder padding.

## Coverage

- MP4, MOV, WebM and MKV duration display, default end time, enabling range inputs and editing the start time.
- MP4/MOV above the 16 MiB waveform threshold: duration still works, and `Vault.readBinary` is not called for waveform generation.
- 13-minute and over-two-hour container metadata; displaying duration does not require decoding the whole file.
- Metadata success despite waveform codec failure, and the original audio-decode fallback when metadata loading fails.
- Closing the modal while metadata loads, invalid duration values, metadata errors and timeouts.
- Production WebAudioEngine and VAD AudioConverter: MP4/MOV/WebM and WMA v1/v2 return only the selected second, resampled to 16 kHz, with non-silent PCM.
- Controller tests separately protect range-preserving upload decisions, cancellation/budget failure boundaries and WAV identity after VAD.

## Reproduce the original regression

These commands replace only the modal module with the exact tracked baseline during the test build, without editing the working tree:

```sh
MEDIA_BASELINE_REF=0.11.1 npm run test:media -- --grep large.mp4
MEDIA_BASELINE_REF=HEAD npm run test:media -- --grep large.mp4
```

At release commit `f7ba011`, the first command passed and the second failed: the same valid 17 MiB MP4 reported 3 seconds in 0.11.1 and 0/Unknown in 0.11.3. `HEAD` means the checked-out commit, so after the fix is committed it is no longer the failing baseline.

## Native Obsidian check

Before release, use a disposable vault with the candidate plugin build. From the file explorer, right-click the synthetic MP4/MOV and choose “Transcribe with AI”. Confirm duration, enable range selection, inspect end-time fields, then cancel. Include a video above 16 MiB and a 13-minute video. Verify the actual `Vault.getResourcePath` path works; a browser harness cannot substitute for this integration check. Do not use a real API key or start a paid transcription for this duration-only check.
