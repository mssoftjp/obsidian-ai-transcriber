# Transcription Model Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every transcription model's principal benefit immediately understandable in all four supported UI languages.

**Architecture:** Keep the existing structured three-row model comparison UI unchanged. Update only the translation values consumed by `SettingsUIBuilder.createModelDescription()` and lock the four locales with a focused Jest regression test.

**Tech Stack:** TypeScript, Obsidian DOM helpers, Jest, ESLint, esbuild.

## Global Constraints

- Keep model IDs, dropdown options, pricing, API calls, and transcription behavior unchanged.
- Keep the existing three-row list layout unchanged.
- Japanese copy is fixed as: `タイムスタンプ出力を選択可能`, `最高精度`, `Whisperより高精度・低コスト`.
- Update English, Chinese, and Korean with equivalent meanings.
- Do not modify or restore the deleted `src/assets/supportImages.ts` file.

---

### Task 1: Update and verify model descriptions

**Files:**
- Modify: `tests/SettingsUiBuilder.test.ts`
- Modify: `src/i18n/translations/en.ts`
- Modify: `src/i18n/translations/ja.ts`
- Modify: `src/i18n/translations/zh.ts`
- Modify: `src/i18n/translations/ko.ts`

**Interfaces:**
- Consumes: `SettingsUIBuilder.createModelDescription()` and translation keys `whisperDesc`, `gpt4oDesc`, `gpt4oMiniDesc`.
- Produces: Localized model-comparison list text; no new API or exported type.

- [x] **Step 1: Write the failing test**

Update the existing list expectation in `tests/SettingsUiBuilder.test.ts` to:

```ts
expect(list?.children.map(child => child.textContent)).toEqual([
	'Whisper-1: Optional timestamp output',
	'GPT-4o transcribe: Highest accuracy',
	'GPT-4o mini transcribe: Whisper upgrade: higher accuracy at low cost'
]);
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --runInBand --runTestsByPath tests/SettingsUiBuilder.test.ts
```

Expected: FAIL because the current English descriptions still say `Supports timestamped output`, `High accuracy`, and `Low cost`.

- [x] **Step 3: Apply the minimal translation changes**

Set the description values as follows:

```ts
// en.ts
whisperDesc: 'Optional timestamp output',
gpt4oDesc: 'Highest accuracy',
gpt4oMiniDesc: 'Whisper upgrade: higher accuracy at low cost',

// ja.ts
whisperDesc: 'タイムスタンプ出力を選択可能',
gpt4oDesc: '最高精度',
gpt4oMiniDesc: 'Whisperより高精度・低コスト',

// zh.ts
whisperDesc: '可选择时间戳输出',
gpt4oDesc: '最高精度',
gpt4oMiniDesc: '比 Whisper 更高精度、成本更低',

// ko.ts
whisperDesc: '타임스탬프 출력 선택 가능',
gpt4oDesc: '최고 정확도',
gpt4oMiniDesc: 'Whisper보다 높은 정확도·저비용',
```

- [x] **Step 4: Verify GREEN and the complete project**

Run:

```bash
npm test -- --runInBand --runTestsByPath tests/SettingsUiBuilder.test.ts
npm run lint
npm run build
npm test -- --runInBand
npx eslint build/0.10.0/main.js build/0.10.0/release/main.js --no-ignore
git diff --check
```

Expected: focused test passes; 45 test suites and 177 tests pass; lint, build, generated-output lint, and whitespace check exit successfully.

- [ ] **Step 5: Commit and install the verified build**

```bash
git add tests/SettingsUiBuilder.test.ts src/i18n/translations/en.ts src/i18n/translations/ja.ts src/i18n/translations/zh.ts src/i18n/translations/ko.ts docs/superpowers/plans/2026-07-13-transcription-model-description.md
git commit -m "fix(settings): clarify transcription model benefits"
```

Copy `build/0.10.0/release/main.js`, `manifest.json`, and `styles.css` to the configured Obsidian plugin directory. Preserve `fvad.wasm`, then compare each installed file with its build source using `cmp`.
