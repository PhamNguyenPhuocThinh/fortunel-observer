# @fortunel/shared-types

Cross-language schemas. Zod is the source of truth; everything else is generated.

## Pipeline

```
Zod schemas (src/*.ts)
   │
   ├─ exported as TS types       → consumed by apps/api (Phase 4+) and apps/web (Phase B)
   │
   └─ codegen → JSON Schema       (zod-to-json-schema, committed under ./json-schema/)
                  │
                  └─ Phase D codegen → Pydantic v2 models in apps/bot/src/bot/_generated/
                                      (datamodel-code-generator)
```

## Commands

```bash
pnpm --filter @fortunel/shared-types codegen        # regenerate ./json-schema/*.json
pnpm --filter @fortunel/shared-types codegen:check  # exit non-zero if drift
```

CI runs `codegen:check`. Forget to regenerate after editing a Zod schema → CI fails.

## Phase A scope

- Envelope (`{ data, meta, errors }`)
- RFC 7807 problem-details
- Cursor pagination (`PaginationQuery`, `PaginationMeta`)
- Primitives (`uuid`, `slug`, `email`, `url`, `iso-date-time`, `user-role`, `Scope`)
- Resources: `user`, `api-key` (+ `Create`, `Minted`), `project` (+ `Create`/`Update`), `post` (+ `Create`/`Update`), `contact-message` (+ `Create`)

Pydantic emit is wired in **Phase D** when `apps/bot` materialises. To wire then: run `datamodel-code-generator --input json-schema/ --output ../../apps/bot/src/bot/_generated/`, pin the version, add a `codegen:python` script + CI drift check.

## Envelope composition

`envelope(payloadSchema)` is a runtime helper — it does NOT emit a JSON Schema artifact (codegen only walks named `*Schema` exports). For documented list endpoints, compose the response shape at the route level via `@hono/zod-openapi` using the helper plus `paginationMetaSchema` so OpenAPI gets the full shape inline. Resource schemas remain the source of truth; the envelope is the wire wrapper.

## Zod ↔ JSON Schema gotchas

Avoid these Zod features in resource schemas — JSON Schema has no equivalent and codegen will degrade:

- `.refine()` / `.superRefine()` — push to handler validation
- `.transform()` — handler-side projection
- Discriminated unions with non-literal discriminators

Keep resource schemas as plain `z.object({...})` with primitive / enum / array / record fields.

## Why not OpenAPI as source of truth?

OpenAPI is the **output** (served at `/openapi.json` via `@hono/zod-openapi`). Treating it as source forces a single-language workflow. Zod gives us TS types + JSON Schema + OpenAPI + Pydantic from one definition.

## Field naming

`snake_case` across the wire for parity with the future Python bot consumer. TS code calling these schemas adopts the wire shape directly — no camelCase mapping layer.
