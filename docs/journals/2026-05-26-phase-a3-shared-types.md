# Phase A.3 Shared Types Complete

**Date**: 2026-05-26 17:40
**Severity**: Low
**Component**: `packages/shared-types` — Zod source-of-truth + JSON Schema codegen
**Status**: Resolved

## What Shipped

`@fortunel/shared-types` is now the cross-language schema source. 16 Zod schemas (envelope, problem, pagination, primitives + Scope enum, 5 resources with Create/Update/Minted variants) export both runtime validators and inferred TS types. `pnpm --filter @fortunel/shared-types codegen` emits 26 JSON Schema artifacts to `packages/shared-types/json-schema/`; `codegen:check` exits non-zero on drift and is wired into `ci-ts.yml`. Smoke test 7/7 green covering envelope shape, RFC 7807, pagination coercion, scope typo rejection, slug regex, and the Create/Read round-trip. Pydantic emit is intentionally deferred to Phase D per red-team revision — no `apps/bot` consumer exists yet.

**Time spent**: ~1.5h of 6h Phase A.3 budget. Under because the codegen pipeline is small (~110 LOC) and the Zod schemas mirror Drizzle shapes already built in Phase A.2.

## The Brutal Truth

The plan said output to `dist/json-schema/`. The root `.gitignore` excludes `dist/`. The drift check needs committed artifacts. Caught it at the first `git status` after codegen — files invisible. Moved output to `packages/shared-types/json-schema/` (committed derivative, not build artifact — `.js/.d.ts` would be build artifacts; JSON Schema is more like a generated source). 30-second decision, but worth flagging: plans that prescribe paths under `dist/` without checking the workspace's gitignore policy are a recurring papercut. Future plans should specify "committed under `packages/x/<dir>/`" not "under `dist/`" unless the consumer actually wants build-output behaviour.

The code-reviewer flagged two High items that were both real and would have burned Phase 4:

1. **`envelopeMetaSchema` vs `paginationMetaSchema` disagreement.** The envelope's meta had optional `cursor`/`has_more` with `.passthrough()`; pagination meta had required `cursor: nullable + has_more: boolean`. Phase 4 list handlers would have produced `{ cursor: null, has_more: false }` that validates against one schema and fails the other. Fix: collapse to `envelopeMetaSchema = paginationMetaSchema.partial().passthrough()` — one shape, two views.
2. **`envelope()` is runtime-only, no JSON Schema artifact.** Codegen walks named `*Schema` exports; `envelope(postSchema)` produces a fresh schema at call site. Phase 4 wiring `@hono/zod-openapi` will compose per-route response shapes inline — that's the intended path, but the README didn't say so. Documented in README so Phase 4 doesn't try to find a `postsListEnvelopeSchema` that was never going to exist.

Med findings landed cleaner: RFC 7807 §3.1 explicitly allows `"about:blank"` as a `type` URI (not URL) — relaxed `problemSchema.type` from `z.string().url()` to `z.string().min(1)`. `user.image` switched from raw `z.string().url().nullable()` to the shared `urlSchema.nullable()` (2048 max enforced consistently with `project.links`). Bounded `apiKeySchema.name` (1–120 chars) to match the Create variant so mocks can't synthesise unbounded names. Added `"sideEffects": false` so esbuild can tree-shake unused schemas out of the Workers bundle.

## Technical Details

- **Files created**: 12 — 4 foundation (`envelope`, `problem`, `pagination`, `primitives`), 5 resources, `index.ts` barrel, `codegen/zod-to-json-schema.ts`, smoke test.
- **JSON Schema output**: 26 files (one per named `*Schema` export, kebab-cased: `post.json`, `api-key-create.json`, `pagination-meta.json`, etc.).
- **Drift check**: regenerates to `.json-schema-check/` tempdir, byte-compares against `json-schema/`, prints diff list + exit 1 if any. Verified by hand: hand-edit `post.json` → exit 1 with `~ post.json (drift)`; restore → exit 0.
- **Defensive throw**: codegen errors if a `*Schema` export is not a `ZodType` (silent skip would let a plain-object `fooSchema` bypass drift detection).
- **CRLF guard**: added root `.gitattributes` with `text eol=lf` for `packages/shared-types/json-schema/*.json` + `packages/db/migrations/*.sql`. Without it, a Windows checkout with `core.autocrlf=true` produces phantom drift in CI.
- **Scope vocabulary (Phase 5 unblocker)**: `scopeSchema = z.enum([...])` codified the locked vocabulary from plan Open Q1. `Scope` TS type exported. Phase 5's `requireScope(scope: Scope)` will reject typos at compile time.
- **Forbidden Zod features verified absent**: no `.refine()`, `.transform()`, `.superRefine()`, `.brand()`, `.preprocess()`, or non-literal discriminated unions anywhere in `src/`. JSON Schema can represent the entire surface losslessly.

## What We Tried

1. First pass put output under `dist/json-schema/` per the plan. `git status` showed no new files → realised root `.gitignore` swallowed them. Pivoted to `packages/shared-types/json-schema/` and documented the deviation in the phase plan.
2. Initial smoke test asserted `problemSchema` rejects `"not-a-url"`. After relaxing `type` to `z.string().min(1)` (RFC 7807), that assertion became wrong — broke the test. Rewrote: now asserts `about:blank` passes and empty string / out-of-range status fail.
3. Considered exporting pre-baked envelope schemas (`postsListEnvelopeSchema = envelope(z.array(postSchema))`) per reviewer H1 option (b). Rejected — adds boilerplate for every list endpoint, duplicates the OpenAPI route definition. Option (a) documented in README is the lighter path.

## Root Cause Analysis

Two findings — the `dist/` path collision and the `envelopeMeta`/`paginationMeta` divergence — share a root: **Phase A.3 was specced as an isolated package, but it lives downstream of A.2 (Drizzle shapes) and upstream of A.4 (route handlers). Specs written without simulating both directions miss interface bugs.** Lesson: when planning a "shared" package, walk one consumer up and one consumer down to catch shape mismatches before they ship.

## Lessons Learned

- **Walk the gitignore before committing to a path.** "Dist" is the universal build-output gitignore target; committed derivatives need a different dir. Cheap mistake when caught at codegen; expensive when caught at CI.
- **Meta-shape unification is free at greenfield.** Forcing `envelopeMeta = paginationMeta.partial().passthrough()` is one line now; reconciling two divergent meta shapes after Phase 4 ships would be a migration.
- **RFC reading > intuition** for protocol surfaces. `z.string().url()` felt right for `problem.type`; RFC 7807 §3.1 explicitly allows `about:blank`. Read the spec, not the docs.
- **Add CRLF guards to monorepos with committed text artifacts.** TypeScript projects rarely care; codegen output + SQL migrations do. `.gitattributes` is 4 lines of insurance against a phantom-CI-failure class.

## Carry-forwards into Phase A.4 / A.5

- **Phase 4 (API foundation)**: wire `@hono/zod-openapi` with per-route envelope composition: `envelope(z.array(postSchema))` inline in the route definition. Do NOT introduce a `postsListEnvelopeSchema` constant — keep schema surface lean. `problemSchema` is the response-body shape; `problemEnvelopeSchema` is the wire-format wrapper (`{ data: null, errors: [Problem, ...] }`).
- **Phase 5 (auth surface)**: `import { scopeSchema, type Scope } from '@fortunel/shared-types'` — typecheck `requireScope(s: Scope)` against this enum. Vocabulary is locked; do not extend without updating plan Open Q1.
- **Phase 6 (CRUD)**: every Create/Update endpoint maps to its `*CreateSchema`/`*UpdateSchema` — already shaped with proper bounds (kebab-case slugs, max lengths, scope-array min:1). Handlers receive validated input straight from `zValidator`.
- **Phase 7 (CI deploy)**: drift check is in `ci-ts.yml` after `pnpm test`. If migration time matters, move it earlier (cheap, runs in seconds). Don't gate deploy on it — it's a guardrail, not a deployment dependency.
- **Phase D (bot)**: one-line Pydantic wiring per README — `datamodel-code-generator --input packages/shared-types/json-schema/ --output apps/bot/src/bot/_generated/`. Pin the generator version; add `codegen:python` script + CI drift check at that time.

## Plan Sync-Back

- `phase-03-shared-types.md` status: `pending` → `completed`; all 6 success criteria checked.
- `plan.md`: Phase 3 row marked ✅.
- No upstream phase needed a note this round — Phase 4/5/6 already reference shared-types correctly.
