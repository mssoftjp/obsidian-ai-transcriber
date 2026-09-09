# Contributing

Thank you for helping improve AI Transcriber.

## Development setup

1. Install exact dependencies with `npm ci`.
2. Run `npm run build` during development.
3. Run `npm run test:community` while changing metadata, disclosures, packaging, or workflows.
4. Run `npm run check:community` before a pull request.
5. Run `npm run audit:dependencies` with network access before a pull request or release.

`npm run check:community` is intentionally network-independent. A network error during `npm run audit:dependencies` is not a clean audit. Use `npm run audit:production` only when you need the narrower shipped-dependency view.

`npm run check:community` is the canonical local and CI scan. It loads the pinned `eslint-plugin-obsidianmd@0.4.1`, runs source lint, the strict build, metadata and release verification, generated-artifact lint through `npm run lint:artifacts`, test type-checking, compatibility and deployment tests, and the full coverage suite. `npm run build:release` invokes this same gate. The Community release bundle contains exactly `main.js`, `manifest.json`, and `styles.css`; do not include `fvad.wasm`.

## Hosted review preview

The published Obsidian lint plugin is the local and CI policy gate, but it does not reproduce Obsidian's unpublished hosted analyzer. Before creating a version tag or GitHub release:

1. Push the exact candidate commit to GitHub.
2. Run an Obsidian Developer Dashboard preview scan for that branch, tag, or commit.
3. Record the candidate commit and preview result in the pull request or release handoff.
4. Treat every new warning as a release blocker until it is fixed or documented as an intentional disclosure.

Do not use a previous release's scorecard as evidence for a new candidate. Obsidian documents the local lint and hosted preview options in [The future of Obsidian plugins](https://obsidian.md/blog/future-of-plugins/).

`npm ci` applies the committed compatibility patch that lets the official
`brace-expansion@5.0.9` implementation serve both modern and legacy lint/test
callers, and installation fails if the patch cannot be applied. Do not remove
the override, patch, or `test:dependency-compat`
independently; remove them together only after `npm ls brace-expansion --all`
shows that every supported tool accepts the patched API directly.

If your local `.env` sets `OBSIDIAN_PLUGINS_DIR`, the build may also copy files into your Obsidian vault. For CI or validation-only builds, unset that variable or run with `OBSIDIAN_PLUGINS_DIR=`.

## Pull requests

- Keep changes focused and describe the user-visible behavior being changed.
- Do not include generated `main.js` in the repository root.
- Do not commit personal vault data, API keys, logs, or real user transcripts.
- Document any new network use, external file access, or persistent data written by the plugin.
- Avoid adding dependencies unless they are necessary for the shipped plugin.

## Tests

Tests in `tests/` and `test/` are published with the source and run in CI. The test suite uses synthetic data only. Do not add real audio transcripts, user notes, API keys, or private vault paths to tests or fixtures.

## Security and privacy

This plugin processes user-selected audio/video and sends transcription requests to OpenAI when the user runs transcription. Please keep privacy-sensitive behavior explicit in the README and prefer local, user-initiated actions over background work.
