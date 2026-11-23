# AgentRouter Bahasa patch maintenance

This fork tracks `decolua/9router` and carries one local compatibility patch for AgentRouter.

## Current upstream baseline

- Version: `0.5.123`
- Commit: `5ae63d22847e07042e235b40e1d926b65e509013`
- Branch: `decolua/9router:master`
- Fork: `https://github.com/keyseekers/9router`

The machine-readable copy is `.github/upstream-baseline.json`. The scheduled `check-upstream.yml` workflow compares that commit with upstream every day and opens one issue when upstream advances.

## Patch behavior

For exact `agentrouter.org` hosts, the patch:

1. Adds `originator: codex_cli_rs` unless the operator supplied an Originator header.
2. Adds an idempotent English compatibility block before the first user turn.
3. Preserves the original user text and role.
4. Supports OpenAI Responses, Chat Completions, and Anthropic message bodies.
5. Does not affect lookalike hosts or other providers.

## Patch files

- `open-sse/config/agentRouter.js`
- `open-sse/services/agentRouter.js`
- `open-sse/executors/base.js`
- `open-sse/executors/default.js`
- `tests/unit/agentrouter-compatibility.test.js`
- `docs/AGENTROUTER-COMPATIBILITY.md`

The root `package.json` version is kept synchronized with the packaged CLI version so the local dashboard does not report a false update.

## Update procedure

1. Fetch `decolua/9router:master` and compare it with the baseline commit.
2. Merge or rebase upstream into this fork's `master` branch.
3. Resolve conflicts without dropping the patch behavior above.
4. If upstream implements equivalent behavior, prefer the upstream implementation and adjust/remove the duplicate local code.
5. Update `.github/upstream-baseline.json` to the new upstream version and commit.
6. Run:

   ```text
   cd tests
   npx vitest run unit/agentrouter-compatibility.test.js
   cd ..
   npx eslint open-sse/config/agentRouter.js open-sse/services/agentRouter.js open-sse/executors/base.js open-sse/executors/default.js tests/unit/agentrouter-compatibility.test.js
   npm run build
   ```

7. Confirm `/api/health` succeeds and `/api/version` reports no update.
8. Push `master` and create/update a `patched-v<version>` tag.

Never commit API keys, the 9Router SQLite database, `.env` files, `node_modules`, or generated `.next` builds.

Keep `reaAllowEnabled` disabled unless the operator deliberately requests it. It is an upstream prompt-rewriting feature, not a dependency of the AgentRouter patch.

## v0.5.123 verification (2026-11-23)

Verified on Windows with Node 22.23.4; all test and build data was isolated from the running instance.

- **PASS**: 14 AgentRouter tests, included in 52 focused executor tests; 254 security/fallback/translator tests; 9 native Node NVIDIA tests.
- **PASS**: ESLint, production build, compiled patch marker, and isolated `/api/health` and `/api/version` checks. Unauthenticated management routes and an invalid inference API key returned HTTP 401.
- **PASS**: alias baseline; no advisories returned for 221 installed production packages; no credential-like additions found by pattern scans of the update diff and upstream commit history.
- **FAIL, also reproduced on clean upstream**: 7 header snapshots in the 37-file upstream test run (652 passed, 7 failed), and the QwenCloud provider-baseline transport mismatch. The fork does not alter these expectations or provider definitions.
- **NOT TESTED**: live AgentRouter acceptance, live Codex account fallback, Linux/Docker runtime, and a complete application security audit.
- **N/A**: production database migration and backup restore; this update only changes the fork, not the deployed home server or its database.
