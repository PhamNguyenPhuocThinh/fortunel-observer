# @fortunel/shared-types

Cross-language schemas. Zod is the source of truth; everything else is generated.

## Pipeline

```
Zod schemas (src/*.ts)
   │
   ├─ exported as TS types       → consumed by apps/api, apps/web, apps/mcp-server
   │
   └─ codegen → JSON Schema       (zod-to-json-schema)
                  │
                  └─ codegen → Pydantic v2 models
                                  → written to apps/bot/src/bot/_generated/
```

Run `pnpm --filter @fortunel/shared-types codegen` after changing a schema. CI fails if the generated Pydantic is out of date.

## Phase A scope

Schemas for: `User`, `ApiKey`, `Project`, `Post`, `ContactMessage`, plus the response envelope (`{ data, meta, errors }`) and the RFC 7807 problem-details shape.

## Why not OpenAPI as source of truth?

OpenAPI is the **output** (served at `/openapi.json` via `@hono/zod-openapi`). Treating it as source forces a single-language workflow. Zod gives us TS types + JSON Schema + OpenAPI + Pydantic from one definition.
