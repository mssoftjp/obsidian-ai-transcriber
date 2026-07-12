# VAD Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show clear, user-focused trade-offs for all three VAD modes without changing audio behavior or the server default.

**Architecture:** Replace the inline server/local summary with a structured three-item comparison list. Keep the existing local-WASM missing-file guidance, remove the now-duplicated selected-local cost note, and protect the copy and default with focused Jest tests.

**Tech Stack:** TypeScript, Obsidian DOM helpers, CSS, Jest, ESLint, esbuild.

## Global Constraints

- Keep `DEFAULT_API_SETTINGS.vadMode` equal to `server`.
- Do not modify server direct upload, local VAD, disabled-mode audio processing, chunking, pricing, or network behavior.
- Preserve the `fvad.wasm` missing-file guidance and file picker.
- Use plugin-prefixed CSS class names.
- Apply equivalent copy in English, Japanese, Chinese, and Korean.

---

### Task 1: Render and verify the three VAD descriptions

**Files:**
- Modify: `tests/SettingsUiBuilder.test.ts`
- Modify: `src/SettingsUiBuilder.ts`
- Modify: `src/i18n/locales.ts`
- Modify: `src/i18n/translations/en.ts`
- Modify: `src/i18n/translations/ja.ts`
- Modify: `src/i18n/translations/zh.ts`
- Modify: `src/i18n/translations/ko.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `settings.vadMode.options`, localized VAD descriptions, and `DEFAULT_API_SETTINGS.vadMode`.
- Produces: `SettingsUIBuilder.createVADDescription()` output containing `.ai-transcriber-vad-comparison > ul > li` with three entries.

- [x] **Step 1: Write failing DOM, locale, and default tests**

Add tests that require:

```ts
[
	'Off: Accuracy first. Processes the full audio, including quiet voices and short utterances.',
	'Server: Faster processing with lower device load.',
	'Local: May reduce costs for audio with long silences. Quiet voices and short utterances may be lost, reducing accuracy.'
]
```

Also require the approved Japanese, Chinese, and Korean descriptions, verify the list contains all three modes, and assert:

```ts
expect(DEFAULT_API_SETTINGS.vadMode).toBe('server');
```

- [x] **Step 2: Run the focused test and verify RED**

```bash
npm test -- --runInBand --runTestsByPath tests/SettingsUiBuilder.test.ts
```

Expected: FAIL because the current DOM has no VAD comparison list and the translations still contain short summaries.

- [x] **Step 3: Implement the minimal UI and translation changes**

- Replace the `summaries` translation group with `descriptions` containing `server`, `local`, and `disabled`.
- Remove the redundant `localNote` translation key.
- Render the modes and dropdown options from one shared order: server, disabled, local.
- Keep the missing-WASM note and link after the comparison list.
- Add namespaced CSS for `.ai-transcriber-vad-comparison` using the existing model-comparison spacing and list styling.

- [x] **Step 4: Verify GREEN and the project**

```bash
npm test -- --runInBand --runTestsByPath tests/SettingsUiBuilder.test.ts
npm run lint
npm run build
npm test -- --runInBand
npx eslint build/0.10.0/main.js build/0.10.0/release/main.js --no-ignore
git diff --check
```

Expected: focused and full tests pass; lint, build, generated-output lint, and whitespace checks exit successfully.

- [ ] **Step 5: Commit and install**

```bash
git add docs/superpowers/plans/2026-07-13-vad-description.md tests/SettingsUiBuilder.test.ts src/SettingsUiBuilder.ts src/i18n/locales.ts src/i18n/translations/en.ts src/i18n/translations/ja.ts src/i18n/translations/zh.ts src/i18n/translations/ko.ts styles.css
git commit -m "fix(settings): clarify VAD mode tradeoffs"
```

Copy the verified `build/0.10.0/release/main.js`, `manifest.json`, and `styles.css` into the configured Obsidian plugin directory. Preserve `fvad.wasm` and compare installed files with their build sources using `cmp`.
