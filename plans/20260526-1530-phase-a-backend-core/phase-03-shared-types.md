---
phase: 3
title: "Shared types — Zod source of truth + codegen"
status: pending
priority: P1
effort: "6h"
dependencies: [1]
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

- [ ] All Phase A resource schemas exported from `@fortunel/shared-types`
- [ ] `pnpm shared-types:codegen` produces clean JSON Schema files under `dist/json-schema/`
- [ ] `pnpm shared-types:codegen --check` exits 0 with no diff
- [ ] Modifying `src/resources/post.ts` and running codegen produces a non-empty diff → confirms wiring
- [ ] CI fails when JSON Schema drift is committed without regen
- [ ] `packages/shared-types/README.md` documents the Phase D Pydantic follow-up

## Risk Assessment

- **Risk:** Zod ↔ JSON Schema gaps (Zod features without JSON Schema equivalents: refinements, transforms, unions of literals). **Mitigation:** keep resource schemas to plain object shapes; push validation logic to handler layer. Document forbidden Zod features in `docs/code-standards.md`.
- **Risk:** Pydantic v2 codegen tool churn. **Mitigation:** pin `datamodel-code-generator` version; commit the lockfile.
- **Risk:** Naming convention mismatch (camelCase vs snake_case). **Mitigation:** lock snake_case across TS + Python for API field names; document; add lint rule to catch camelCase keys in handler responses.
