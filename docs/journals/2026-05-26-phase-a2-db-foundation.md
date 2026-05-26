# Phase A.2 DB Foundation Complete

**Date**: 2026-05-26 16:55
**Severity**: Medium
**Component**: `packages/db` — Drizzle schema, migrations, dual driver
**Status**: Resolved

## What Shipped

Committed `ace5693`: `packages/db` is now the single source of truth for the data model. Seven Drizzle tables (`users`, `api_keys`, `sessions`, `accounts`, `projects`, `posts`, `contact_messages`) with `owner_id NOT NULL` + cascading FK to `users(id)` on every non-Better-Auth table, cursor-pagination indices `(owner_id, created_at DESC)`, `pgEnum('user_role')` for DB-level role enforcement, citext email with case-insensitive unique. Split-driver client factory: `createClient` (drizzle/neon-http for Workers runtime) and `createNodeClient` (drizzle/postgres-js for CLI tooling). `drizzle-kit generate` committed migration `0000_initial.sql` (with `CREATE EXTENSION IF NOT EXISTS citext` self-prepended). Smoke test 2/2 green. Migration applied cleanly to a fresh TimescaleDB-pg16 container; `\dt` shows all 7 tables; `\dT` shows citext + user_role types present.

**Time spent**: ~3h of 10h Phase A.2 budget — under because the planned 1h Workers spike was rationally skipped (see below).

## The Brutal Truth

The plan called for a 1-hour Workers spike on `postgres-js` (does `nodejs_compat` provide enough of a TCP socket shim?). I couldn't run that spike — it requires `wrangler deploy` to a real `*.workers.dev` URL, which is outside this session's reach. Two options: punt and ask the user to run the spike themselves (sequential, slow), or read the existing research and trust the fallback. The research file at `plans/.../research/better-auth-workers.md` already concluded — with citations and an explicit "use `neon-http` (non-websocket) not native Neon client" recommendation — that `neon-http` is the production-tested path on Workers. The plan's fallback ("`neon-http` on Workers + `postgres-js` for Node tooling. Two clients, one schema. Acceptable cost.") *is* the answer. Skipping the spike, documenting the reasoning, and shipping the split-driver client was the right call. But it sat uncomfortably for ~5 minutes before I committed — there's always a pull toward "do the literal thing the plan says" even when the plan itself listed the fallback as acceptable.

The code-reviewer flagged two "Critical" findings that on closer reading weren't both critical:

1. **Missing Better Auth `verifications` table** — reviewer didn't have full plan context. Phase 5 explicitly says "Email verification: OUT OF SCOPE for Phase A. Do not wire Resend or Better Auth's email-verification plugin in this phase." So no verifications table is needed; downgraded to a note in Phase 5 about disabling the corresponding plugins.
2. **Plural vs singular table names** — Better Auth's Drizzle adapter expects `user`, `session`, `account` (singular). Our tables are plural. This is a real Phase 5 papercut but not a Phase A.2 bug — it's a config knob at adapter setup time. Documented in Phase 5 plan with the exact `schema: { user: users, session: sessions, account: accounts }` mapping shape.

The Mediums and Lows landed cleaner: switched `role` from `text` to `pgEnum` (DB-level enforcement, cheap on a baseline migration), added `sessions_user_id_idx`, wired `$onUpdate(() => new Date())` on every `updated_at`, prepended `CREATE EXTENSION IF NOT EXISTS citext` to the migration SQL so Neon branches self-provision. All six in ten minutes because the baseline migration had no production data.

## Technical Details

- **Tables created**: 7 — `users` (citext email, `pgEnum` role, 8 cols), `api_keys` (10 cols, 2 indices: owner_created, prefix), `sessions` (8 cols, 1 index: user_id), `accounts` (13 cols, 1 unique index: provider_id+account_id), `projects` (10 cols, 2 indices: owner_slug unique + owner_created), `posts` (10 cols, 3 indices: owner_slug unique + owner_created + owner_published), `contact_messages` (10 cols, 2 indices: owner_created + owner_unread).
- **Cascading FKs**: every non-users table → `users(id) ON DELETE CASCADE`. User deletion fans out cleanly.
- **Driver split**: `createClient` returns `drizzleNeon(neon(url), { schema })` — HTTP, edge-ready. `createNodeClient` returns `drizzlePg(postgres(url), { schema })` — TCP, CLI/migration use. Same `schema` object so generated SQL is identical.
- **citext**: Postgres extension provisioned three ways (defense in depth) — local Docker init script, migration SQL, and Neon dashboard fallback. The migration approach means a fresh Neon branch just works.
- **`pgEnum('user_role')`**: DB rejects `'banana'` writes; previous `text+enum` widened silently to `string` on direct SQL.
- **Lint/Type/Test/Migrate**: `pnpm --filter @fortunel/db lint && typecheck && test` clean; migration applied to `fortunel-postgres-dev` (timescale/timescaledb:2.17.2-pg16); `docker exec ... psql` confirmed all artifacts.
- **Smoke test**: 2 assertions — every expected table is exported, every non-auth table has an `ownerId` column. Cheap; catches circular-import / missing-re-export regressions in the schema barrel.

## What We Tried

1. Generated migration v1 with `role: text('role', { enum: userRole })` — passed tests but reviewer correctly flagged the DB had no `CHECK` constraint. Regenerated with `pgEnum`.
2. Reviewer flagged citext not in migration SQL → would break Neon acceptance criterion. drizzle-kit doesn't auto-emit `CREATE EXTENSION` for custom types, so prepended it manually as the first statement of `0000_initial.sql`. Verified by `pnpm db:reset && pnpm db:migrate` against fresh container — clean apply, citext + user_role both present.
3. Considered renaming tables to singular (matches Better Auth defaults) — rejected because plural is conventional Drizzle style for the rest of the codebase, and the adapter accepts an explicit name map. Documented in Phase 5 instead of forcing a rename.

## Root Cause Analysis

Two-thirds of the reviewer's "Critical/High" findings stemmed from the same root: **the reviewer didn't see the validation log and Phase 5 plan when it wrote its review.** It applied a generic Better Auth checklist (needs `verifications` table; needs singular table names) without knowing that Phase 5 explicitly defers email verification and that the team is fine with adapter-level name mapping. Lesson: when delegating reviews on schema work, pass the relevant downstream phase plan as context, not just the current phase. Cheap to do in the prompt; would have removed two "Critical" flags and shaved 10min off the review-fix loop.

## Lessons Learned

- **Trust the research when the spike isn't runnable.** The plan's fallback isn't a degraded option; it's already the recommendation from a written-down investigation. Skipping a 1h spike with `Why:` documentation > pretending to do a spike I can't actually deploy.
- **Reviewers without full plan context will fabricate gaps.** Pass downstream phase plans into review prompts so they don't re-flag intentional scope cuts.
- **Hardening on baseline migrations is free.** `pgEnum`, `$onUpdate`, extra indices, extension provisioning — all changed cost ~5 minutes total because no data existed yet. Same fixes in Phase B would have cost an hour each.
- **Don't trust drizzle-kit for ecosystem-level concerns.** It generates table DDL beautifully but won't emit `CREATE EXTENSION`, won't seed required Postgres types, won't know about your migration runner's prerequisites. Prepend those manually.

## Carry-forwards into Phase A.4 / A.5

- **Phase 4 (API foundation)**: `postgres` is currently a runtime dep of `@fortunel/db`. Confirm Wrangler tree-shakes it out of the Worker bundle when only `createClient` is imported. If it leaks, move to `optionalDependencies` or accept that CLI consumers must bring their own.
- **Phase 5 (auth surface)**: Use `schema: { user: users, session: sessions, account: accounts }` when wiring `drizzleAdapter`. Keep email-verification, password-reset, and OTP plugins disabled.
- **Phase 6 (CRUD)**: Default `users.role` is `'owner'`. Fine for single-tenant V1; change to `'user'` if/when public signup lands. Don't forget — solo-founder mode papers over this.
- **Phase 7 (CI deploy)**: Migration job needs `DATABASE_URL` for Neon staging. `pnpm --filter @fortunel/db migrate` works on Node, but the underlying `postgres-js` driver needs network access to Neon's TCP endpoint. Verify CI runner network policy allows outbound 5432.

## Plan Sync-Back

- `phase-02-db-foundation.md` status: `pending` → `completed`; all 6 success criteria checked except "applies cleanly to fresh Neon branch" (deferred — migration self-provisions citext, should work, but not run this session).
- `phase-05-auth-surface.md`: appended adapter-mapping note for the plural→singular Better Auth table-name override.
- `plan.md`: Phase 2 row marked ✅.
