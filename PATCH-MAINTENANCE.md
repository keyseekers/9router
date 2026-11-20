# AgentRouter Bahasa patch maintenance

This fork tracks `decolua/9router` and carries one local compatibility patch for AgentRouter.

## Current upstream baseline

- Version: `0.5.119`
- Commit: `1855aa44473e88feac9d3f131b9c0c5fc9706b68`
- Branch: `decolua/9router:master`

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
   npx vitest run tests/unit/agentrouter-compatibility.test.js
   npx eslint open-sse/config/agentRouter.js open-sse/services/agentRouter.js open-sse/executors/base.js open-sse/executors/default.js tests/unit/agentrouter-compatibility.test.js
   npm run build
   ```

7. Confirm `/api/health` succeeds and `/api/version` reports no update.
8. Push `master` and create/update a `patched-v<version>` tag.

Never commit API keys, the 9Router SQLite database, `.env` files, `node_modules`, or generated `.next` builds.
