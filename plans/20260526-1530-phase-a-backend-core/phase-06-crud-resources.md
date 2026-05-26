---
phase: 6
title: "Repository pattern + CRUD resources"
status: completed
completed: 2026-05-26
priority: P1
effort: "10h"
dependencies: [5]
---

# Phase 6: Repository pattern + CRUD resources

## Overview

Implement the real product surface: Projects, Posts, ContactMessages — all tenant-scoped via the repository pattern. Route handlers never touch Drizzle directly; repos own all queries and bake `owner_id` filtering into every operation.

> **Red-team revisions:**
> 1. `POST /v1/contact` is unauthenticated → spam pipe. Add IP-keyed KV rate-limit (5 req/hour/IP) AND Cloudflare Turnstile widget verification on this endpoint specifically. Without this, the inbox gets nuked day one.
> 2. **YAGNI on query features.** Single-tenant V1 has one user — `?fields=`, `?sort=`, filter operator suffixes are dead weight. Ship list + cursor pagination only. Defer the rest to V2 with a tracked TODO. Removes ~30% of the work in this phase.

## Requirements

- Functional: full CRUD for Projects (`/v1/projects`)
- Functional: full CRUD for Posts (`/v1/posts`)
- Functional: write-only for ContactMessages (`POST /v1/contact`) + admin list (`GET /v1/contact` requires `contact:read`)
- Functional: list endpoints use cursor pagination only in V1 (`?fields=`, `?sort=`, filter ops deferred to V2 — see Overview revisions)
- Functional: `POST /v1/contact` requires valid Turnstile token + is rate-limited by IP (5/hour) independent of the API-key rate limit
- Functional: each resource enforces `owner_id` on every query — even GET by id 404s if owner_id doesn't match
- Functional: every endpoint described in OpenAPI with `description`, `example`, error responses
- Non-functional: p95 handler latency <50ms (excluding DB)

## Architecture

```
apps/api/src/
├── repositories/
│   ├── base-repo.ts            # shared cursor logic, helpers
│   ├── projects-repo.ts
│   ├── posts-repo.ts
│   └── contact-messages-repo.ts
├── routes/v1/
│   ├── projects.ts             # createRoute() definitions + handlers
│   ├── posts.ts
│   ├── contact.ts
│   └── api-keys.ts             # mint/list/revoke (uses auth/api-key.ts from Phase 5)
└── lib/
    ├── cursor.ts               # encode/decode opaque cursors
    └── query-parser.ts         # ?fields=, ?sort=, filter parsing
```

### Repository contract (locked in `docs/code-standards.md`)

```ts
type RepoCtx = { db: DbClient; ownerId: string };

interface ProjectsRepo {
  list(ctx, opts: ListOpts): Promise<{ rows, nextCursor }>;
  get(ctx, id: string): Promise<Project | null>;
  create(ctx, input): Promise<Project>;
  update(ctx, id, patch): Promise<Project>;
  delete(ctx, id): Promise<void>;
}
```

Every query MUST include `eq(table.owner_id, ctx.ownerId)`. Repositories return `null` (not throw) when the resource doesn't exist for this owner — handler decides 404 vs 403 (defaults to 404 to avoid leaking existence).

## Related Code Files

**Create:** every file in tree above + corresponding `__tests__/` siblings.

**Modify:**
- `apps/api/src/index.ts` — mount `/v1/projects`, `/v1/posts`, `/v1/contact`, `/v1/api-keys`
- `@fortunel/shared-types` — finalize resource schemas if they need fields (added in Phase 3)

## Implementation Steps

1. Write `cursor.ts`: opaque base64 of `{ id, created_at }`; encode/decode; reject malformed
2. Write `query-parser.ts`: parse `?fields=a,b,c` → field allowlist; `?sort=-created_at` → ORDER BY; `?published_at[gte]=2024-01-01` → WHERE clauses (limit operators to: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`)
3. Write `base-repo.ts` with shared list logic using cursor + sort + filters
4. Write each resource repo. Tests must include: list paginates correctly, get/update/delete of someone else's resource returns null, create stamps `owner_id` from ctx (handler can't override it)
5. Write each route file using `@hono/zod-openapi`'s `createRoute()` + `app.openapi(route, handler)`
6. Hook `requireScope()` per route (e.g. `POST /v1/posts` → `requireScope('posts:write')`)
7. Add example field to every route + every schema for Scalar docs UX
8. ContactMessages: `POST /v1/contact` is **unauthenticated** (it's a public contact form). Still stamps an `owner_id` — which? **Open question, defer to user.** Working assumption: the project owner's id is hardcoded as a "site owner" env var until multi-tenant. Document the temporary hack.

## Success Criteria

- [ ] All four resource families CRUD via REST with API key auth and session cookie auth
- [ ] OpenAPI doc renders every route with description + example
- [ ] Integration test: create resource as user A, attempt to read/update/delete as user B → 404 (not 403, to avoid leaking existence)
- [ ] Cursor pagination: list first page, use returned cursor → second page contains the next N rows in deterministic order
- [ ] Field selection: `?fields=id,title` strips other fields server-side
- [ ] Filter suffix: `?created_at[gte]=2026-01-01` returns only matching rows
- [ ] Repo-layer test: grep'ing `apps/api/src/routes/` finds zero `db.select(` calls (all queries go through repos)

## Risk Assessment

- **Risk:** `ContactMessage` ownership without multi-tenant. **Mitigation:** hardcoded site-owner env var, documented as Phase A temporary; remove when multi-tenant lands.
- **Risk:** Field selection over-engineered. **Mitigation:** V1 supports top-level scalar fields only; nested/expand deferred (see Open Question 4 in plan.md).
- **Risk:** Cursor format leaks DB internals if reverse-engineered. **Mitigation:** sign cursor with a secret HMAC, or accept the leak (it's just a row's `(id, created_at)` — public knowledge). V1: accept, no signing.
- **Risk:** Drizzle parameterized query mistakes. **Mitigation:** ESLint rule banning string concatenation in repo files; review checklist.
- **Risk:** Soft-vs-hard delete uncertainty. **Mitigation:** V1 hard-delete only; add `deleted_at` columns later if needed.
