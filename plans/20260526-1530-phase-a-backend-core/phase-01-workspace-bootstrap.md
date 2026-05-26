---
phase: 1
title: "Workspace bootstrap"
status: completed
priority: P1
effort: "6h"
completed_on: 2026-05-26
dependencies: []
---

# Phase 1: Workspace bootstrap

## Overview

Fill `packages/config` with real shared configs and wire turbo + pnpm scripts so `pnpm lint`, `pnpm typecheck`, `pnpm test` actually run something on every workspace. Currently they `echo` placeholders.

## Requirements

- Functional: every workspace can import from `@fortunel/config` for ESLint, tsconfig, prettier
- Functional: `pnpm install` on a fresh clone resolves the workspace graph without errors
- Non-functional: lint/typecheck/test all run in <30s on a clean machine

## Architecture

```
packages/config/
├── eslint/base.js              # ESLint flat config, TS + import order + no-floating-promises
├── eslint/workers.js           # extends base, adds Cloudflare Workers globals
├── tsconfig/base.json          # strict, ES2022, isolatedModules, noUncheckedIndexedAccess
├── tsconfig/workers.json       # extends base, Workers types
├── tsconfig/node.json          # extends base, Node 22 types
├── prettier.config.js          # 2-space, single quotes, no trailing semicolons in TS
└── vitest.base.ts              # shared vitest config (env vars, setup files)
```

Each workspace's `tsconfig.json` extends from `@fortunel/config/tsconfig/<flavor>` so changes ripple.

## Related Code Files

**Create:**
- `packages/config/eslint/base.js`
- `packages/config/eslint/workers.js`
- `packages/config/tsconfig/base.json`
- `packages/config/tsconfig/workers.json`
- `packages/config/tsconfig/node.json`
- `packages/config/prettier.config.js`
- `packages/config/vitest.base.ts`
- `eslint.config.js` at repo root (flat config consuming `@fortunel/config/eslint/base`)
- `.prettierrc.cjs` at repo root re-exporting `@fortunel/config/prettier`

**Modify:**
- `apps/api/tsconfig.json` — already exists, switch to extending shared base
- `apps/api/package.json` — replace echo scripts with real lint/typecheck/test
- `packages/{db,shared-types}/package.json` — same
- `turbo.json` — verify task pipeline outputs/inputs cover new files

**Delete:** none.

## Implementation Steps

1. Add `@fortunel/config` dependency to each workspace's `package.json` (`"workspace:*"`)
2. Write the shared configs above. Keep each file under 60 lines.
3. Replace stub `package.json` scripts in `apps/api`, `apps/web`, `apps/mcp-server`, `packages/db`, `packages/shared-types` with real commands:
   - `lint`: `eslint . --max-warnings 0`
   - `typecheck`: `tsc --noEmit`
   - `test`: `vitest run` (or `echo no-tests` for empty workspaces until Phase 6)
4. Wire `turbo.json` cache inputs: include `*.config.js`, `tsconfig.json`, `src/**`.
5. Add a minimal smoke test in `apps/api/src/__tests__/smoke.test.ts` so `pnpm test` has something to run.
6. Set up Husky + lint-staged (light): pre-commit runs `eslint --fix` on staged TS files. Skip if it adds friction.

## Success Criteria

- [x] `pnpm install` succeeds on a fresh clone (no lockfile drift) — verified 2026-05-26
- [x] `pnpm lint` runs ESLint across all TS workspaces, exits 0 — verified 2026-05-26 (6/6 green)
- [x] `pnpm typecheck` runs `tsc --noEmit` per workspace, exits 0 — verified 2026-05-26 (6/6 green)
- [x] `pnpm test` runs Vitest, the smoke test passes — verified 2026-05-26 (`apps/api/src/__tests__/smoke.test.ts`, 2 assertions)
- [ ] CI workflow `ci-ts.yml` is green on a no-op commit — deferred to Phase 7 verification
- [x] Removing `packages/config` is enough to surface an error in every other workspace — proven by re-exports in 5 workspaces (tsconfig extends, eslint re-export, prettier re-export)

## Implementation Notes (2026-05-26)

- Hoisting strategy: `.npmrc` with `shamefully-hoist=true` keeps tools (eslint, typescript-eslint, vitest, prettier, etc.) at the root and accessible to every workspace. Tools declared in root `devDependencies`; workspaces declare only `@fortunel/config` to enforce the seam.
- `packages/config/vitest.base.ts` exists but is not exported yet — Phase 4 will wire it when the API gets real tests.
- Stub `src/index.ts` files added to `apps/{web,mcp-server}` and `packages/{db,shared-types}` so `tsc --noEmit` runs on real (empty) input. Will be replaced by real exports in their respective phases.
- Code review: 8/10 ship. Report: `reports/code-review-phase-01.md`.
- Husky/lint-staged: skipped per plan's "optional" guidance (Windows quirks); revisit if needed.

## Risk Assessment

- **Risk:** ESLint flat config + workspace imports occasionally bite when a workspace doesn't list `@fortunel/config` in deps. **Mitigation:** verify with `pnpm why @fortunel/config` per workspace.
- **Risk:** Vitest + Workers env (Miniflare) is finicky. **Mitigation:** Phase 1 only needs Node-mode Vitest; the Workers-mode runner lands in Phase 4 when there's real Workers code to test.
- **Risk:** Husky on Windows occasionally requires manual `core.hooksPath` config. **Mitigation:** make Husky optional; document in README.
