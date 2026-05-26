---
phase: 2
title: "DB foundation"
status: pending
priority: P1
effort: "10h"
dependencies: [1]
---

# Phase 2: DB foundation

## Overview

`packages/db` becomes the single source of truth for the data model. Drizzle schema with `owner_id` on every entity, migrations directory, `createClient(DATABASE_URL)` factory using the `neon-http` driver, generated SQL committed.

## Requirements

- Functional: schema for User, ApiKey, Session, Account, Project, Post, ContactMessage
- Functional: `pnpm db:generate` creates SQL files, `pnpm db:migrate` applies them
- Functional: same schema runs against local Docker Postgres AND Neon Postgres
- Non-functional: every query reachable from the API filters by `owner_id`

## Architecture

```
packages/db/
├── src/
│   ├── schema/
│   │   ├── users.ts            # id uuid, email citext UNIQUE, role enum, created_at, updated_at
│   │   ├── api-keys.ts         # id, user_id FK, name, hashed_key, scopes text[], last_used_at
│   │   ├── sessions.ts         # Better Auth required shape
│   │   ├── accounts.ts         # Better Auth OAuth account links
│   │   ├── projects.ts         # id, owner_id FK, slug, title, description, tech jsonb, links jsonb
│   │   ├── posts.ts            # id, owner_id, slug, title, body_md, tags text[], published_at
│   │   ├── contact-messages.ts # id, owner_id, from_name, from_email, message, ip, user_agent
│   │   └── index.ts            # re-exports all tables
│   ├── client.ts               # createClient(databaseUrl): drizzle({ schema }, neonHttp(url))
│   └── index.ts                # public surface
├── drizzle.config.ts           # points at process.env.DATABASE_URL
├── migrations/                 # committed SQL
└── package.json
```

### Driver decision (must spike before committing)

`postgres-js` was the original target ("single driver, single codepath") but `nodejs_compat` on Workers does **not** provide raw TCP sockets — only a Node API shim. Red-team flagged: postgres-js may not run on Workers at all.

**Plan:** 1-hour spike at the start of this phase:
1. Build a Worker that imports `postgres-js`, opens a connection to a Neon branch, runs `SELECT 1`.
2. Deploy to a throwaway `*.workers.dev` URL with `nodejs_compat` flag.
3. If it works: adopt `postgres-js` everywhere.
4. If it fails (likely): use `drizzle-orm/neon-http` in Workers + `postgres-js` in Node tooling (migrate, studio, scripts). Two clients, one schema. Acceptable cost.

Either way, `packages/db/src/client.ts` exposes a single `createClient(url)` factory; the caller's runtime determines which driver underneath.

## Related Code Files

**Create:**
- `packages/db/drizzle.config.ts`
- `packages/db/src/schema/users.ts`
- `packages/db/src/schema/api-keys.ts`
- `packages/db/src/schema/sessions.ts`
- `packages/db/src/schema/accounts.ts`
- `packages/db/src/schema/projects.ts`
- `packages/db/src/schema/posts.ts`
- `packages/db/src/schema/contact-messages.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/client.ts`
- `packages/db/src/index.ts`
- `packages/db/migrations/0000_initial.sql` (drizzle-kit generated)

**Modify:**
- `packages/db/package.json` — add deps: `drizzle-orm`, `drizzle-kit`, `postgres`, `pg` (types), update scripts
- Root `package.json` — `db:generate`, `db:migrate`, `db:studio` scripts already pass through

## Implementation Steps

0. **Driver spike** (see Architecture). Decide `postgres-js` vs split (`neon-http` Workers + `postgres-js` Node) before writing any schema code.
1. Install deps per spike outcome: at minimum `drizzle-orm`, `drizzle-kit`. Add `postgres` and/or `@neondatabase/serverless` based on step 0.
2. Write schema files; every non-Better-Auth table MUST have `owner_id uuid NOT NULL REFERENCES users(id)`
3. Add indices: `(owner_id, slug)` unique on projects + posts; `(owner_id, created_at DESC)` on every list-able table for cursor pagination
4. Add citext extension to local init script (`infra/dev/init-scripts/01-extensions.sql` — append `CREATE EXTENSION IF NOT EXISTS citext;`)
5. Run `pnpm db:generate` → check the generated SQL into git
6. Run `pnpm db:migrate` against local Docker; verify with `pnpm db:psql` then `\dt` shows tables
7. Manually point `DATABASE_URL` at a Neon staging branch and run `pnpm db:migrate` to verify Neon compatibility
8. Add `packages/db/src/__tests__/schema-smoke.test.ts` that imports every schema file (catches accidental circular imports)

## Success Criteria

- [ ] `pnpm db:up && pnpm db:migrate` creates all tables in local Docker
- [ ] Same migrations apply cleanly against a fresh Neon branch
- [ ] `pnpm db:psql` then `\dt` shows: users, api_keys, sessions, accounts, projects, posts, contact_messages
- [ ] Every non-auth table has `owner_id` column with NOT NULL + FK
- [ ] `packages/db` exports `createClient`, `schema`, and per-table types
- [ ] Schema smoke test passes

## Risk Assessment

- **Risk:** Better Auth's table shapes may change between minor versions. **Mitigation:** pin Better Auth to a specific version in Phase 5; document the contract.
- **Risk:** `postgres-js` driver bundle size on Workers. **Mitigation:** verify gzipped bundle stays under budget; fall back to `neon-http` for Workers + `postgres-js` for Node if needed.
- **Risk:** citext not available on managed Postgres providers. **Mitigation:** Neon supports it. Hyperdrive Phase D+ uses our own Docker → also supports.
- **Risk:** Migration order matters when adding FKs. **Mitigation:** `drizzle-kit generate` handles dependency ordering; commit generated SQL and review before merge.
