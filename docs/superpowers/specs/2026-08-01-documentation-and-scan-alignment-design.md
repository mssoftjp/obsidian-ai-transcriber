# Documentation and scan alignment design

## Goal

Bring the public documentation, contributor guidance, and deterministic review checks for AI Transcriber 0.11.1 into agreement with the shipped implementation. Prevent the same class of stale or semantically false documentation from passing the local and CI review gates again, then use the Obsidian Developer Dashboard against the exact pushed candidate commit before integrating it into `main`.

## Evidence and root cause

The current documentation verifier primarily proves that selected English README phrases and metadata fields exist. Presence checks cannot establish that a disclosure is still true, that the Japanese README provides equivalent information, or that troubleshooting guidance still corresponds to a supported feature.

That gap allowed several implementation changes to outlive their documentation:

- `PluginStateRepository` persists settings, dictionaries, and bounded transcription history in segmented plugin data, while both README languages claim that the plugin permanently stores nothing beyond transcribed text.
- The English README describes local WebCodecs preprocessing and selected-range upload, but the Japanese privacy section omits the equivalent disclosure.
- Troubleshooting still refers to recording, microphone permission, and an audio-format setting even though the plugin now transcribes selected files and exposes no recording workflow or audio-format setting.
- Contributor instructions describe an outdated repository layout, indentation convention, lint package name, and release treatment of `fvad.wasm`.
- Local checks and the hosted Developer Dashboard serve different purposes, but the exact-commit hosted result is not something a local regex-based verifier can reproduce.

The previous automated review therefore missed the findings because it checked syntax and phrase presence rather than a small set of explicit semantic invariants. The fix is to encode stable, review-relevant invariants without pretending that local tooling is equivalent to Obsidian's unpublished hosted analyzer.

## Scope

- Correct false or incomplete implementation and privacy statements in the English and Japanese README outside the screenshot section.
- Remove troubleshooting for unsupported recording and audio-format workflows.
- Align contributor and release guidance with the repository's actual layout, commands, lint dependency, coding style, and three-file Community release bundle.
- Clarify the status of 0.11.1 release documentation and historical execution plans without rewriting their historical decisions.
- Extend the deterministic documentation verifier and its tests so the identified semantic regressions fail locally and in CI.
- Route local and CI review through canonical package scripts rather than duplicating partially different command lines.
- Run the complete local release gate and the Developer Dashboard preview for the exact pushed candidate commit.
- Fast-forward the verified candidate into `main`, push it, and delete the local and remote feature branch.

## Non-goals

- Changing, regenerating, editing, annotating, or otherwise touching screenshot files or the README screenshot section and its surrounding descriptions.
- Launching Obsidian, installing the candidate into a vault, or creating a disposable test vault for screenshots.
- Changing transcription, storage, networking, model selection, VAD, or user-interface behavior.
- Generating README files from a new schema or introducing a general documentation framework.
- Claiming that local checks reproduce the Obsidian Developer Dashboard.
- Creating a tag, GitHub release, or Community Plugins submission.

## Design

### 1. README truth and language parity

Update only the affected prose outside the screenshot section.

The privacy text will distinguish the following facts:

- audio is sent to the user-selected transcription provider only when required for transcription;
- local preprocessing may use WebCodecs and a WAV fallback;
- when a time range is selected, only that selected segment is uploaded;
- plugin data persists settings, dictionaries, resumable task state, and a bounded history containing operational metadata and a short transcript preview;
- completed full transcription content is written to the selected vault output rather than retained as an additional full copy in plugin data.

The Japanese section will carry the same operational meaning as the English section. The wording need not be sentence-for-sentence identical, but both languages must disclose the same storage, preprocessing, and upload boundaries.

Remove the recording-failure, microphone-permission, and configurable-audio-format troubleshooting entries. Keep file-transcription troubleshooting that still maps to the current UI and implementation.

### 2. Contributor and release guidance

Update `AGENTS.md` and applicable contributor/release documents to describe the current repository:

- this checkout is the package root; it does not contain another package-level `public/` directory;
- TypeScript source follows the existing tab-indented style;
- the pinned Obsidian lint package is `eslint-plugin-obsidianmd`;
- `npm run build:release` runs the Community release checks and produces the exact release bundle;
- the Community release bundle contains `main.js`, `manifest.json`, and `styles.css` only;
- optional local VAD assets are user-selected and are not silently added to the Community bundle;
- generated-artifact linting uses the canonical package script;
- the hosted Developer Dashboard preview is a post-push gate for the exact candidate commit.

Historical specifications and plans remain historical records. Where a document could reasonably be mistaken for a current unfinished checklist, add a concise status note rather than rewriting or checking off steps without contemporaneous evidence.

The 0.11.1 release note will summarize the final user-visible and review-hardening state. Hosted scan evidence will be reported in the release handoff after the immutable candidate commit is scanned; the committed release note will not contain a self-invalidating claim that its own commit SHA was scanned before it existed.

### 3. Semantic documentation verifier

Extend the existing Community metadata verifier instead of introducing a second competing documentation checker. Keep checks deterministic and independent of network access.

The verifier will enforce stable invariants:

- both README languages disclose plugin-data persistence rather than claiming no permanent storage;
- both languages disclose local preprocessing and selected-range upload;
- known obsolete recording, microphone-permission, and audio-format-setting guidance is absent;
- the lint package named by contributor guidance matches the locally pinned package;
- contributor guidance names the canonical generated-artifact lint command and the exact Community release bundle;
- release metadata and release documentation remain aligned on version 0.11.1.

Tests will use temporary fixture repositories or fixture text rather than modifying the real README. Each newly enforced invariant must first have a focused failing test that demonstrates the previous blind spot, followed by the smallest verifier change that makes it pass. Error messages will identify the document, language, and violated invariant so failures are actionable.

The verifier will not OCR screenshots, embed volatile lists of model names, or attempt broad natural-language equivalence. Those checks would be brittle and would not reliably prove semantic correctness.

### 4. Canonical scan configuration

Use package scripts as the single source of truth for deterministic review commands. CI and contributor guidance will invoke the same scripts used locally for:

- source linting with zero warnings;
- strict TypeScript build;
- generated JavaScript linting;
- Jest tests and repository coverage thresholds;
- Community metadata and source-contract checks;
- release-bundle verification;
- dependency and repository-hygiene checks already required by the project.

If CI currently expands one of these into a different raw command, replace the duplication with the canonical script. Do not relax strict TypeScript or lint rules to obtain a green result. Scanner-facing dependencies remain pinned in `package.json` and `package-lock.json`; any discovered mismatch is corrected in both files together.

The hosted Developer Dashboard remains a separate gate because its analyzer is not published and requires an authenticated GitHub candidate. A local pass is necessary but not sufficient evidence of hosted acceptance.

### 5. Candidate integration

Implementation occurs on `codex/docs-scan-0.11.1`. After all deterministic checks pass:

1. Commit the complete candidate and push the feature branch.
2. Confirm the remote feature-branch SHA exactly matches local `HEAD`.
3. Run the Obsidian Developer Dashboard preview against that exact SHA.
4. If the preview reports an actionable warning, fix it on the feature branch, repeat all affected local checks, push the new SHA, and rerun the preview.
5. Once the exact SHA is accepted, switch to `main`, fetch the remote state, and require that local `main` has not diverged.
6. Integrate with `git merge --ff-only` so the scanned commit itself becomes `main` rather than creating an unscanned merge commit.
7. Push `main`, verify local and remote `main` resolve to the scanned SHA, then delete the remote and local feature branch.

Unrelated worktree changes, remote divergence, an unavailable hosted preview, or a hosted result tied to a different SHA blocks integration. No history rewrite or destructive cleanup is used to work around those conditions.

## Verification

The change is complete only when fresh evidence shows:

- focused verifier regression tests demonstrate the former blind spots and pass with the fix;
- the complete Jest suite passes;
- source linting exits with zero warnings;
- the strict TypeScript build succeeds;
- generated release JavaScript passes the canonical artifact lint command;
- Community metadata and source-contract checks pass;
- the release build contains exactly `main.js`, `manifest.json`, and `styles.css`;
- first-party Markdown links resolve;
- dependency and repository-hygiene gates required by the package pass;
- `git diff --check` is clean and the committed file set excludes all screenshot files and the README screenshot section;
- the pushed feature branch matches local `HEAD`;
- the Developer Dashboard result belongs to that exact commit and has no unresolved actionable warning;
- fast-forwarded local and remote `main` match the scanned commit;
- the feature branch no longer exists locally or on the remote.
