# Obsidian Community scorecard quality gates design

## Goal

Preserve AI Transcriber's current **Health: Excellent / Review: Passed** Community Plugins status while adding GPT Transcribe support. Catch known Obsidian policy, code-quality, metadata, release-packaging, and production-dependency regressions before a tag is released.

The implementation should reproduce the public and official checks that can be run locally. Obsidian's complete server-side safety scanner is not public, so the goal is prevention of known regressions rather than claiming exact equivalence with the hosted scorecard.

## Current state

- The public Community Plugins page reports Health Excellent and Review Passed for version 0.10.1.
- `eslint-plugin-obsidianmd` is Obsidian's official guideline checker. The repository already pins the current release, `0.4.1`, and uses `recommendedWithLocalesEn`.
- The source lint currently passes, but the `lint` script only names `src/**/*.ts`.
- Running `eslint .` currently reaches tests without a test TypeScript project and fails before it can serve as a repository-level gate.
- `tsconfig.test.json` intends to include tests but inherits the production config's test exclusion. A read-only TypeScript program check with the exclusion corrected included 170 files and produced zero diagnostics.
- Jest currently passes 51 suites and 247 tests.
- Tag releases run the existing `check` script, but ordinary pushes and pull requests have no quality workflow.
- The production dependency audit currently reports zero vulnerabilities. The full development tree reports two high-severity findings with non-breaking fixes advertised by npm.

## Scope

The work covers:

- official Obsidian lint enforcement with warnings treated as failures;
- explicit type-checking of production and test TypeScript;
- Community metadata and disclosure contract tests;
- deterministic verification of Community release artifacts;
- push and pull-request CI on the Node.js versions used by Obsidian's current sample plugin;
- production dependency auditing before release;
- safe, non-breaking lockfile remediation of current development-only advisories;
- reuse of the same deterministic gate by the release workflow.

## Non-goals

- Reproducing or reverse-engineering Obsidian's private hosted scanner.
- Adding a new runtime dependency.
- Introducing an unofficial Obsidian runtime test harness solely for scorecard optimization.
- Running paid OpenAI requests in CI.
- Adding real-vault or GUI end-to-end tests in this change.
- Broad dependency modernization unrelated to a current audit finding or official compatibility requirement.
- Changing GPT Transcribe behavior, persisted settings, user-facing defaults, or API request semantics.
- Publishing a release, submitting to Community Plugins, or pushing the branch.

## Design

### 1. Official lint gate

Keep `eslint-plugin-obsidianmd` pinned exactly to `0.4.1`, matching the current official release and the lockfile used by CI.

Change the primary lint command to lint the repository inputs that have supported configurations, with `--max-warnings=0`. The flat config will explicitly ignore generated coverage, Jest tests, test-only configuration, documentation, and build tooling where the official plugin's typed source rules are not appropriate. Production TypeScript, English locale modules, and `package.json` remain covered.

Tests are excluded from the Obsidian source-rule pass because test doubles and fixtures are not shipped to Obsidian. They receive a separate TypeScript gate instead of weakening production rules or adding broad rule suppressions.

Generated JavaScript remains a separate post-build lint target. Its configuration disables TypeScript and Obsidian source-only rules but retains applicable base JavaScript checks.

### 2. TypeScript gates

Keep the existing strict production type-check in `npm run build`.

Correct `tsconfig.test.json` so its top-level exclusions do not inherit the production exclusion of `tests/**/*`. Add a deterministic `typecheck:test` command using:

```text
tsc --project tsconfig.test.json --noEmit
```

This validates tests and mocks independently of Jest's transform behavior. It also prevents future test files from silently falling outside the declared TypeScript project.

### 3. Community metadata contract tests

Add a focused Jest suite under `tests/` that reads repository files and verifies stable, review-relevant contracts without contacting the network.

The suite will verify:

- `manifest.json`, `package.json`, and the current `versions.json` key use the same semantic version;
- the current `versions.json` value equals `manifest.minAppVersion`;
- required manifest fields have the expected types;
- the plugin ID is `ai-transcriber`, contains no `obsidian`, and uses the established lowercase identifier;
- the description is no more than 250 characters, starts with an action-oriented phrase, ends with a period, and avoids known submission boilerplate;
- `isDesktopOnly` remains `true`, because the plugin uses Electron and desktop file access;
- `fundingUrl` remains a support link and is not used for another purpose;
- the README discloses the OpenAI account/API-key requirement, paid API use, OpenAI network destination and transmitted data, external-file handling, local storage behavior, and absence of telemetry;
- the lockfile is present.

The test will assert durable disclosure concepts rather than exact paragraphs so normal documentation editing does not create unnecessary brittleness.

The official linter remains authoritative for syntax-aware Obsidian rules. These tests cover cross-file relationships and disclosures that the source linter cannot fully establish.

### 4. Community release verifier

Add a small dependency-free Node.js verifier invoked only after a production build. It will fail closed with actionable messages.

For the current manifest version, it will verify:

- `build/<version>/release/` exists;
- the release directory contains exactly `main.js`, `manifest.json`, and `styles.css`;
- all three files are regular, non-empty files;
- the built manifest is byte-for-byte identical to the repository manifest;
- `main.js` has no source-map reference and no adjacent `.map` release artifact;
- optional `fvad.wasm`, archives, logs, environment files, and other build outputs are not present in the Community release directory.

The versioned build directory may still contain internal verification outputs and the optional local-install archive. Only the dedicated `release/` directory is the Community upload boundary.

The release workflow will upload from the verified `release/` directory. This makes the verified directory, rather than a duplicated hand-maintained file list, the packaging boundary.

### 5. Command composition

Keep deterministic local checks separate from network-dependent auditing.

The intended command structure is:

```text
lint                  official source/repository lint, warnings forbidden
lint:artifacts        generated JavaScript lint after build
typecheck:test        strict test-project type-check
test:community        focused metadata/disclosure Jest suite
verify:community      post-build release-directory verifier
audit:production      npm audit --omit=dev --audit-level=high
check                 lint, production build, artifact verification/lint,
                      test type-check, and full Jest coverage
check:community       deterministic local check plus focused Community tests
```

`build:release` will reuse `check:community`. It will not introduce a second, weaker release-only validation path.

### 6. Continuous integration

Add a quality workflow for pushes and pull requests.

Following Obsidian's current sample-plugin workflow, run the deterministic quality gate on Node.js 20, 22, and 24 using `npm ci`. Matrix jobs validate compatibility but do not publish artifacts.

Run the production dependency audit once on a supported Node.js version rather than repeating the network request for every matrix entry. The audit fails on high or critical production findings.

The tag release workflow will:

1. install with `npm ci`;
2. verify that the tag exactly matches `manifest.version`;
3. run `build:release`, which includes the Community gate;
4. run the production dependency audit;
5. confirm the verified release directory;
6. upload only its three files;
7. attest those exact files.

No workflow pushes source changes or rewrites the lockfile.

### 7. Dependency policy

Do not add a runtime package for validation. Use Node.js, Jest, TypeScript, ESLint, and the already-installed official Obsidian ESLint plugin.

Attempt the current npm advisory remediation using the normal non-breaking lockfile update path. Accept it only if:

- `package.json` ranges do not require broad or breaking changes;
- the production audit remains clean;
- the full audit no longer reports the two current high-severity findings, or any remaining finding is documented as an upstream development-only blocker;
- all quality gates pass afterward.

Do not use `npm audit fix --force`.

## Error handling and failure messages

All new validators fail closed and report:

- the contract that failed;
- the observed value or missing path;
- the expected relationship;
- whether the failure applies to metadata, disclosure, packaging, or dependencies.

They must not silently repair manifests, rewrite documentation, delete artifacts, or modify the lockfile. Remediation remains an explicit development action.

Network failure during `npm audit` is distinct from a clean audit and must fail the CI audit job. Deterministic local checks remain usable without network access.

## Test strategy

Use test-driven development for each new contract:

1. Add a failing metadata/disclosure assertion against a controlled fixture or current missing relationship.
2. Add the smallest validator or configuration change that makes it pass.
3. Add release-verifier fixture tests for missing, extra, empty, mismatched, and source-mapped artifacts.
4. Add success coverage for the exact three-file Community release.
5. Run focused suites after each change.
6. Run the full repository gate before completion.

No test sends audio, API keys, prompts, or transcript content to OpenAI.

## Acceptance criteria

- The official Obsidian lint configuration runs at version 0.4.1 with zero errors and zero warnings.
- Production and test TypeScript projects both type-check.
- All existing and new Jest suites pass with coverage thresholds satisfied.
- Community metadata and README disclosure contracts pass.
- A production build produces an exact, verified three-file Community release directory.
- Generated JavaScript lint passes.
- Production `npm audit` reports zero high or critical vulnerabilities.
- Development advisory remediation is non-breaking, or any upstream-only remainder is explicitly reported.
- Quality CI covers Node.js 20, 22, and 24.
- The tag release workflow reuses the same Community gate and uploads only verified files.
- `git diff --check` passes and the worktree contains no unrelated edits.
- The Obsidian October plugin self-critique checklist is re-checked before completion.
- No release is published and no branch is pushed.

## Official references

- [Obsidian Plugin security](https://obsidian.md/help/Extending%2BObsidian/Plugin%2Bsecurity)
- [Obsidian Developer policies](https://docs.obsidian.md/Developer+policies)
- [Submission requirements for plugins](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Official eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)
- [Official sample-plugin lint workflow](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/.github/workflows/lint.yml)
- [Official sample-plugin release workflow](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/.github/workflows/release.yml)
