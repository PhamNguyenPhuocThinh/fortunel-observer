---
phase: 3
title: "Shared types — Zod source of truth + codegen"
status: completed
priority: P1
effort: "6h"
dependencies: [1]
completed: 2026-05-26
---

# Phase 3: Shared types

## Overview

`packages/shared-types` becomes the cross-language schema source. Zod definitions for the response envelope, RFC 7807 problem, cursor pagination, and every resource. Codegen emits JSON Schema artifacts only in Phase A; Pydantic generation lands when `apps/bot` actually exists (Phase D).

**Red-team revision:** the Pydantic step is deferred. `apps/bot` is empty stub in Phase A — generating Pydantic models with no consumer is YAGNI and adds a Python toolchain dependency to TS-only CI. Build the JSON Schema pipeline now (the part TS can validate), wire Pydantic emit in Phase D against real bot imports.

## Requirements

- Functional: every API request/response shape defined as a Zod schema exported from here
- Functional: `pnpm shared-types:codegen` emits `dist/json-schema/*.json` for every resource
- Functional: `pnpm shared-types:codegen --check` exits non-zero if generated JSON Schema drifts from source
- Non-functional: Pydantic emit is documented in this phase but implemented in Phase D — keep the pipeline shape so adding the Python step is a one-line change

## Architecture

```
packages/shared-types/
├── src/
│   ├── envelope.ts             # Envelope<T> = { data: T, meta?, errors: null }
│   ├── problem.ts              # RFC 7807 shape with extension fields allowed
│   ├── pagination.ts           # Cursor + meta { cursor: string|null, has_more: boolean }
│   ├── primitives.ts           # OwnerId, Slug, Email, Url branded types
│   ├── resources/
│   │   ├── user.ts
│   │   ├── api-key.ts
│   │   ├── project.ts
│   │   ├── post.ts
│   │   └── contact-message.ts
│   └── index.ts                # re-exports all
├── codegen/
│   ├── zod-to-json-schema.ts   # entry, writes ./dist/json-schema/*.json
│   └── json-schema-to-pydantic.sh  # uses datamodel-code-generator
└── package.json
```

## Codegen pipeline

```
Zod schema (src/resources/post.ts)
  │
  ├─ zod-to-json-schema → ./dist/json-schema/post.json
  │
  └─ datamodel-code-generator → ../../apps/bot/src/bot/_generated/post.py
                                                   (Pydantic v2 BaseModel)
```

`--check` mode: regenerate to a temp dir and `diff` against committed `_generated/`. Fail if differs.

## Related Code Files

**Create:** all files listed in tree above.

**Modify:**
- `packages/shared-types/package.json` — deps: `zod`, `zod-to-json-schema`; scripts: `codegen`, `codegen:check`
- `.github/workflows/ci-ts.yml` — add a `pnpm --filter @fortunel/shared-types codegen:check` step
- `apps/api` and `apps/web` will import from here in Phase 4+

## Implementation Steps

1. Install: `pnpm --filter @fortunel/shared-types add zod zod-to-json-schema`
2. Define envelope + problem + pagination first (smallest, most reusable)
3. Define resource schemas mirroring DB tables but with API-facing field names (snake_case → still snake_case for consistency with Python; document in code-standards)
4. Write the codegen script as TS, run via `tsx`
5. Wire CI drift check on JSON Schema output (TS-only, no Python in Phase A CI)
6. Document the Phase D follow-up in `packages/shared-types/README.md`: "Run `datamodel-code-generator` against `dist/json-schema/*.json` to emit Pydantic; wired in Phase D when `apps/bot` exists."

## Success Criteria

- [x] All Phase A resource schemas exported from `@fortunel/shared-types`
- [x] `pnpm --filter @fortunel/shared-types codegen` produces clean JSON Schema files under `json-schema/` *(moved from `dist/json-schema/`: root `.gitignore` excludes `dist/`, but the drift check requires committed artifacts)*
- [x] `pnpm --filter @fortunel/shared-types codegen:check` exits 0 with no diff
- [x] Drift check verified by hand: editing a committed JSON Schema → exit 1; revert → exit 0
- [x] CI step `Shared-types JSON Schema drift check` added to `.github/workflows/ci-ts.yml`
- [x] `packages/shared-types/README.md` documents the Phase D Pydantic follow-up + envelope composition + forbidden Zod features

## Implementation notes (2026-05-26)

- **Output path:** `packages/shared-types/json-schema/` (not `dist/json-schema/`). Root `.gitignore` excludes `dist/`; committed drift detection requires a tracked path.
- **Scope enum unblocker for Phase 5:** `scopeSchema` + `Scope` type exported from `primitives.ts` with the locked vocabulary (`posts|projects|contact|signals:read|write`, `*:*`). `requireScope(s: Scope)` will typecheck at the Phase 5 call site.
- **Envelope composition (Phase 4 prep):** `envelope(payloadSchema)` is a runtime helper; it deliberately does NOT emit a standalone JSON Schema artifact. Route handlers compose the wire shape via `@hono/zod-openapi` so OpenAPI gets the full per-route shape inline. Documented in README.
- **Meta-shape unification:** `envelopeMetaSchema = paginationMetaSchema.partial().passthrough()` so the envelope meta and list-response meta cannot drift apart.
- **RFC 7807 relaxation:** `problemSchema.type` is `z.string().min(1)` (not `.url()`) so the default `about:blank` URI validates. Documented in `problem.ts`.
- **Bundle hygiene for Workers:** `"sideEffects": false` set in `package.json` so esbuild can tree-shake unused schemas out of the Worker bundle.
- **Windows CRLF trap:** added `.gitattributes` with `text eol=lf` for `packages/shared-types/json-schema/*.json` and `packages/db/migrations/*.sql` so `core.autocrlf=true` checkouts don't produce phantom drift in CI.
- **Drift-detection hardening:** codegen throws if a `*Schema` export is not a `ZodType` (silent skip would let plain-object exports bypass drift detection).
- **Pydantic emit (Phase D):** documented as a one-line `datamodel-code-generator --input json-schema/ --output ../../apps/bot/src/bot/_generated/` follow-up when `apps/bot` materialises. Not wired now (YAGNI — no consumer).

## Code review carry-forwards

- Review (DONE_WITH_CONCERNS) flagged 2 High + 5 Medium + 3 Low — all applied except L1 (verified `moduleResolution: Bundler` in `@fortunel/config/tsconfig/base.json`, no action needed).

## Risk Assessment

- **Risk:** Zod ↔ JSON Schema gaps (Zod features without JSON Schema equivalents: refinements, transforms, unions of literals). **Mitigation:** keep resource schemas to plain object shapes; push validation logic to handler layer. Document forbidden Zod features in `docs/code-standards.md`.
- **Risk:** Pydantic v2 codegen tool churn. **Mitigation:** pin `datamodel-code-generator` version; commit the lockfile.
- **Risk:** Naming convention mismatch (camelCase vs snake_case). **Mitigation:** lock snake_case across TS + Python for API field names; document; add lint rule to catch camelCase keys in handler responses.
