# Code Review — Phase 1: Workspace bootstrap

Date: 2026-05-26
Reviewer: code-reviewer
Plan: `plans/20260526-1530-phase-a-backend-core/phase-01-workspace-bootstrap.md`

## Strengths

- **Single seam, single source of truth.** `@fortunel/config` exposes ESLint flat, three tsconfig flavors, Prettier, and a vitest base via a clean `exports` map; every workspace `extends`/re-exports rather than copies. Removing `packages/config` would surface immediately in 5 workspaces — wiring is real, not stubbed.
- **Strict TS preserved + slightly hardened.** All prior apps/api settings (`jsxImportSource: hono/jsx`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `noImplicitOverride`, workers types) reach apps/api through the `base → workers` extends chain. Two additions, both safe: `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`.
- **Runtime contracts intact.** apps/api keeps hono, @hono/zod-openapi, zod as runtime deps and wrangler as devDep. apps/bot (Python) untouched. Locked stack (TS + Hono + Cloudflare Workers + `@fortunel/config` seam) respected.

## Issues

### Medium

- **`turbo.json` lint inputs miss `eslint.config.js`** (`turbo.json:17`). Each workspace has an `eslint.config.js` re-export, but `inputs` only lists `*.config.{js,cjs,mjs}` (matches) and `tsconfig.json`. Actually this is covered by the glob. Re-checked: `*.config.js` matches `eslint.config.js`. Withdrawn — not an issue. (Kept for transparency: was my initial flag.)
- **`vitest.base.ts` exported but never consumed.** apps/api's `vitest run` resolves vitest's own defaults; no workspace imports `@fortunel/config/vitest`. Not breaking, but the seam is asymmetric: tsconfig/eslint/prettier all flow from the shared package, vitest doesn't. Add a thin `vitest.config.ts` per workspace that imports the base, OR remove `vitest.base.ts` until Phase 4 actually wires Miniflare. Right now it's dead code that the next reader has to reason about.

### Low

- **`shamefully-hoist=true` risk for Phase 2+.** Concrete failure mode: when Drizzle-Kit (Phase 2) and Better Auth (Phase 5) each pull a different `drizzle-orm` minor, the hoisted root may end up with whichever installed second, masking the version skew until a runtime import in apps/api picks up the "wrong" hoisted copy. Mitigation: pin `drizzle-orm` and `better-auth` versions explicitly in *every* workspace that imports them, and add a `pnpm overrides` block in root once those packages land. Document in `packages/config/README.md` so Phase 2 doesn't re-discover it.
- **Stub `export {}` files are inert but undocumented.** `apps/web/src/index.ts`, `apps/mcp-server/src/index.ts`, `packages/db/src/index.ts`, `packages/shared-types/src/index.ts` all contain only `export {}`. No conflict with future phases (the bare module marker keeps `tsc --noEmit` and vitest happy with `--passWithNoTests`). When Phase 2/B/C land, real exports just replace the placeholder. No action required; flagging so Phase 2 author doesn't add `// TODO` cruft on top.
- **No `apps/api/vitest.config.ts`.** Smoke test works because vitest auto-discovers, but inputs in `turbo.json:27` reference `vitest.config.ts` that doesn't exist — turbo cache will treat any change as new (cache miss harmless, just suboptimal). Either drop it from inputs or add a minimal config per workspace (would also resolve the previous bullet about vitest.base.ts).
- **`exports` map publishes `vitest.base.ts` as `.ts`.** `@fortunel/config/vitest` resolves to a raw `.ts` file. Works for consumers that have TS in their loader (vitest/tsx) but would break a plain `node --import` caller. Not a problem today (only vitest consumes it). Worth pinning later: ship a `.js` build or rename to make the contract explicit.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Every TS workspace imports from `@fortunel/config` | ✓ (5 workspaces verified) |
| `pnpm install` succeeds | ✓ (reported) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` exit 0 | ✓ (reported, 6/6 each) |
| Removing `packages/config` surfaces errors everywhere | ✓ (by construction — every workspace `extends` from it) |
| Each config file < 60 lines | ✓ (max: base.js at 38 lines) |
| Locked decisions intact | ✓ (TS + Hono + Workers + `@fortunel/config` seam) |
| No runtime contract regressions | ✓ (hono/@hono/zod-openapi/zod/wrangler all present, Python bot untouched) |

## Verdict

**ship**

Phase 1 is functionally complete, all acceptance criteria pass, no locked decisions violated. The Medium item (vitest seam) and Low items are debt to log, not blockers — fold them into Phase 4 (test infra) and Phase 2 (Drizzle landing) respectively.

## Score

**8 / 10**

Deductions: −1 for the asymmetric vitest seam (defined but unused, asymmetry will confuse next reader), −1 for not pre-empting the `shamefully-hoist` × Drizzle/Better-Auth version-skew risk in `packages/config/README.md`.
