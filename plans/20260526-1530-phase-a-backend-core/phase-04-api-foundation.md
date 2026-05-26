---
phase: 4
title: "API foundation — Hono OpenAPI on Workers"
status: pending
priority: P1
effort: "10h"
dependencies: [2, 3]
---

# Phase 4: API foundation

## Overview

`apps/api` skeleton: a single root `OpenAPIHono` app, structured JSON logging, RFC 7807 error envelope middleware, CORS, KV rate limit, `/healthz`, `/openapi.json`, `/docs` (Scalar). No business routes yet — those land in Phase 6.

## Requirements

- Functional: `GET /healthz` returns `200 { ok: true, commit }`
- Functional: `GET /openapi.json` returns valid OpenAPI 3.1
- Functional: `GET /docs` renders Scalar UI pointed at `/openapi.json`
- Functional: any error returns `application/problem+json` with RFC 7807 fields
- Functional: rate limit returns 429 with `Retry-After` after 100 req/min/key
- Non-functional: cold start <100ms; bundle <100KB gzipped

## Architecture

Per researcher recommendation: **single root `OpenAPIHono`** + resource route factories. Avoids the chaining type-inference bug in `@hono/zod-openapi`.

```
apps/api/src/
├── index.ts                    # root app, mounts middleware + routes, fetch handler
├── lib/
│   ├── logger.ts               # pino-style JSON logger writing to console (Workers Tail captures)
│   ├── env.ts                  # Zod-validated env (DATABASE_URL, KV bindings, secrets)
│   └── context.ts              # Hono Variables typing (user, logger, db)
├── middleware/
│   ├── request-id.ts           # generates / propagates X-Request-Id
│   ├── error-envelope.ts       # app.onError → application/problem+json
│   ├── cors.ts                 # whitelist from env
│   └── rate-limit.ts           # KV rolling window, 100 req/min/key
├── routes/
│   ├── health.ts
│   ├── openapi.ts              # emits OpenAPI 3.1 doc
│   └── docs.ts                 # Scalar mount
└── __tests__/
    ├── health.test.ts
    └── openapi.test.ts         # snapshot test on the emitted document
```

## Pinned versions (per researcher)

- `hono@^4.11.0`
- `@hono/zod-openapi@0.16.0` (NOT ^0.18 — type-inference regression)
- `@scalar/hono-api-reference@^0.12.0`
- `zod@^3.23.0`
- `wrangler@^4.18.0`
- `@cloudflare/workers-types@latest`

## Related Code Files

**Create:** all files listed above.

**Modify:**
- `apps/api/package.json` — **pin `@hono/zod-openapi` to `0.16.0`** (current draft has `^0.18.0`; this is the bug-fix per research)
- `apps/api/wrangler.toml` — uncomment KV namespace bindings: `RATE_LIMIT` and `SESSION_CACHE` (IDs filled after `wrangler kv:namespace create`)
- `apps/api/tsconfig.json` — extend from `@fortunel/config/tsconfig/workers.json` (set up in Phase 1)

## Implementation Steps

1. Install Phase-4 deps; update `apps/api/package.json` per pinned versions above
2. Create KV namespaces: `wrangler kv:namespace create RATE_LIMIT` (and `--preview`) for dev/staging/prod. Paste IDs into `wrangler.toml`.
3. Write `env.ts` first — Zod validates the env at boot; fail fast if a binding is missing
4. Implement logger (just `console.log(JSON.stringify(...))` with level filter)
5. Implement error envelope: `app.onError((err, c) => { ... return c.json(problem, status, { 'Content-Type': 'application/problem+json' }) })`. `type` URI uses **path style**: `https://api.fortunel.dev/errors/{resource}/{slug}` (e.g. `/errors/posts/not-found`). Validation Session 1 decision — eventually resolves to a public error catalog page on the docs site.
6. Implement rate limit using KV `getWithMetadata` + atomic write of `{ count, windowStart }`. Reject when count > limit. Sliding window NOT fixed window.
7. Wire health route and Scalar docs route. `/docs` and `/openapi.json` are **public on prod** (Validation Session 1) — no auth middleware on these two paths. Apply auth middleware only to `/v1/*`.

<!-- Updated: Validation Session 1 - /docs public, error type URI = path style -->

8. Wire OpenAPI emitter — `app.doc31('/openapi.json', { ... })` per `@hono/zod-openapi` 0.16 API
9. Write OpenAPI tests:
   - Validity test: run emitted doc through `openapi-spec-validator` (or `@redocly/openapi-core` validate) — fails CI if doc is not valid OpenAPI 3.1
   - Snapshot test: optional, save `tests/__snapshots__/openapi.json` for human-readable diff review
9b. Rate-limit concurrent-request test: fire 50 parallel requests at a single key with limit=10; assert at least 40 return 429. Documents the KV race-condition looseness rather than hiding it.
10. Run `wrangler dev` locally; smoke `/healthz`, `/openapi.json`, `/docs`

## Success Criteria

- [ ] `wrangler dev` boots without binding errors
- [ ] `curl localhost:8787/healthz` → `200 { ok: true, commit: '<sha>' }`
- [ ] `curl localhost:8787/openapi.json` → valid OpenAPI 3.1 (pass through `openapi-spec-validator`)
- [ ] Open `http://localhost:8787/docs` in browser → Scalar UI renders
- [ ] Forcing an error path returns `Content-Type: application/problem+json`
- [ ] Hammering an endpoint 110 times in a minute returns 429 on the 101st request with `Retry-After` set
- [ ] OpenAPI snapshot test green

## Risk Assessment

- **Risk:** `@hono/zod-openapi` 0.16 has a stable API for `app.doc31()` but minor versions break it. **Mitigation:** exact pin (no caret) until Phase A ships.
- **Risk:** KV rate-limit race condition (two requests read same counter, both increment). **Mitigation:** acceptable for V1 (100 req/min is loose); document the looseness; tighten with Durable Objects in Phase D if abused.
- **Risk:** Scalar bundle size pulls in CDN assets — slow first load. **Mitigation:** Scalar UI is CDN-served (not bundled per researcher). Verify.
- **Risk:** Cold start regression as deps grow. **Mitigation:** wire a cold-start measurement in CI smoke later (Phase 7).
