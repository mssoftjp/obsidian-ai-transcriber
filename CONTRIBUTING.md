# Contributing

Thank you for helping improve AI Transcriber.

## Development setup

1. Install dependencies with `npm install`.
2. Run `npm run build` to type-check and build the plugin.
3. Run `npm run lint` before opening a pull request.
4. Run `npm test` when changing transcription, storage, VAD, or UI behavior.

If your local `.env` sets `OBSIDIAN_PLUGINS_DIR`, the build may also copy files into your Obsidian vault. For CI or validation-only builds, unset that variable or run with `OBSIDIAN_PLUGINS_DIR=`.

## Pull requests

- Keep changes focused and describe the user-visible behavior being changed.
- Do not include generated `main.js` in the repository root.
- Do not commit personal vault data, API keys, logs, or real user transcripts.
- Document any new network use, external file access, or persistent data written by the plugin.
- Avoid adding dependencies unless they are necessary for the shipped plugin.

## Tests

The local test suite uses synthetic data only. Do not add real audio transcripts, user notes, API keys, or private vault paths to tests or fixtures.

## Security and privacy

This plugin processes user-selected audio/video and sends transcription requests to OpenAI when the user runs transcription. Please keep privacy-sensitive behavior explicit in the README and prefer local, user-initiated actions over background work.
