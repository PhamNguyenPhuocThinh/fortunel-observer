# Phase A.6 Repository Pattern + CRUD Resources Complete

**Date**: 2026-05-26
**Severity**: Low
**Component**: `apps/api` — repository layer + `/v1/*` CRUD surface
**Status**: Resolved

## What Shipped

Owner-scoped repository pattern (`apps/api/src/repositories/`) for the four V1 resources — `projects-repo.ts`, `posts-repo.ts`, `contact-messages-repo.ts`, `api-keys-repo.ts` — backed by a shared `base-repo.ts` that mints the keyset-pagination WHERE (`(created_at, id)` tuple), normalizes 23505 → `RepoConflictError('slug')`, and threads `RepoCtx = {db, ownerId}` through every call. The route layer (`apps/api/src/routes/v1/projects.ts`, `posts.ts`, `contact.ts`, `api-keys.ts`) never imports `drizzle-orm` or `@fortunel/db` — a structural assertion test (`routes-no-drizzle.test.ts`) enforces that boundary so owner-scoping cannot be bypassed by a future hand on the keyboard. Public `POST /v1/contact` ships with three independent defenses: IP-keyed KV rate limit (5/hour, scoped to exactly `/v1/contact`), Cloudflare Turnstile verification (toggle-ready — only enforced when `TURNSTILE_SECRET_KEY` is set, fail-closed on siteverify-unreachable), and auth-bypass restricted to that one method+path. Admin contact reads/writes still require `contact:read|write`. The api-keys mint route returns plaintext exactly once and now avoids a redundant second DB roundtrip by serializing directly from `MintResult` via `serializeMintResult()`. Site-owner resolution (`apps/api/src/lib/site-owner.ts`) caches the bootstrap user per Worker isolate without negative caching, so a fresh DB falls through to 503 instead of locking in null. Twenty-five new tests pass (94/94 total across 16 files). Typecheck and lint clean. Not yet committed.

**Time spent**: ~5h of 10h Phase A.6 budget. Most of the friction lived in the unauthenticated contact endpoint — the path-equality auth-bypass check and the X-Forwarded-For spoofing window were both caught by code review and required real fixes rather than rationalization.

## The Brutal Truth

This phase looked simple — four repos, four route files, glue. It wasn't. The traps were all in the seams.

**First, the public contact endpoint is a hairline crack masquerading as a boring route.** I wrote `if (c.req.method === 'POST' && c.req.path === '/v1/contact') return next()` to bypass auth. Code review caught the trailing-slash bug (`/v1/contact/` would have 401'd) and the latent base-path bug (any future `basePath()` mount silently breaks the bypass). I switched to explicit equality on both `/v1/contact` and `/v1/contact/`, accepted the base-path concern as documented limitation. Then `clientIp()` had the same shape of bug: it read `X-Forwarded-For` unconditionally as a "test fallback." On Workers, `CF-Connecting-IP` is always set by Cloudflare and the XFF fallback never runs — *except* when the prod request comes in without `CF-Connecting-IP` (Service Bindings, misconfigured proxy chain), in which case the attacker chooses their own IP for both the rate-limiter and the audit column. Gated XFF on `NODE_ENV !== 'production'`. Both bugs were 5-line fixes. Both were invisible until someone adversarially walked the path.

**Second, the structural test almost caught me lying.** I wrote `serializeMintResult()` to skip the extra `getApiKey()` roundtrip in the mint route. My first instinct was to `import type { ApiKey as ApiKeyRow } from '@fortunel/db'` directly into the route. That would have broken `routes-no-drizzle.test.ts` — which is exactly the point of having a structural test. Reverted in 30 seconds, moved the helper into the repo. The test paid for itself before merge.

**Third, owner-scoping by construction is not the same as owner-scoping by assertion.** Every repo I wrote has `eq(table.ownerId, ctx.ownerId)` in the WHERE — but the discipline came from the shared `keysetWhere()` helper and from manual review, not from a type system that refuses to compile a cross-tenant query. The codepath I trust most is `RepoCtx` itself: routes call `repoCtx(c)` which throws 401 if `c.var.user` is null, so every repo call gets a tenant-stamped ctx by construction. The codepath I trust least is anyone who in the future writes a new repo method and forgets the ownerId predicate on an UPDATE or DELETE. The structural test catches "no drizzle in routes" but does not catch "drizzle without ownerId in repos." That's a Phase B carry-forward — a lint rule or a wrapper type that makes `eq(table.ownerId, ctx.ownerId)` non-skippable.

I also deferred two recommendations from review: defensive scope re-validation in `mintApiKey` (YAGNI — the only caller validates), and the scrypt prefix-collision DoS amplification concern (the prefix is 72 bits of random; an attacker can't induce collisions against a victim without already knowing the victim's prefix, which they don't). Both are documented in the review report; both are honest defers, not silent dismissals.

## Technical Details

- **Files created (12)**: repos × 4 (`projects-repo.ts`, `posts-repo.ts`, `contact-messages-repo.ts`, `api-keys-repo.ts`), routes × 4 (`routes/v1/projects.ts`, `posts.ts`, `contact.ts`, `api-keys.ts`), lib helpers × 3 (`route-helpers.ts`, `site-owner.ts`, `turnstile.ts`), one structural test (`routes-no-drizzle.test.ts`). Plus 5 unit test files (projects-repo, posts-repo, contact-messages-repo, turnstile, cursor).
- **Files modified**: `apps/api/src/index.ts` (route registration + conditional auth wrapper), `lib/env.ts` (added `TURNSTILE_SECRET_KEY`), `middleware/rate-limit.ts` (parameterized `windowMs`, `prefix`, `keyFn` so the contact-specific 5/hour IP bucket reuses the same code path as the default 100/min/key bucket), `lib/cursor.ts` (added defense-in-depth 1024-char bound before `atob`).
- **Repository pattern**: `RepoCtx = {db: Database, ownerId: string}`. Every repo query uses `and(eq(table.id, id), eq(table.ownerId, ctx.ownerId))`. `RepoConflictError(field)` is thrown on 23505 SQLSTATE; routes catch via `rethrowConflict()` → HTTPException 409. List endpoints use `keysetWhere()` (centralized owner + cursor predicate) and `finalizePage()` (limits + extracts next cursor). Empty patches in `updateProject/Post` short-circuit to `getProject/getPost`.
- **API key plaintext flow**: `mintApiKey()` returns `MintResult` with all fields needed for the response envelope. The route calls `serializeMintResult(minted)` (no second DB read) and spreads `{...row, plaintext: minted.plaintext}`. `last_used_at` and `revoked_at` are null at mint time by construction. Subsequent `GET /v1/api-keys/{id}` returns the row without plaintext via the standard `serializeApiKey()`. Plaintext is never logged, never persisted (only the scrypt hash is).
- **Contact endpoint defenses (3 layers)**:
  - IP rate limit via `app.use('/v1/contact', ...)` middleware, scoped to exactly `POST /v1/contact[/]` (explicit path-equality guard inside), prefix `rl-contact:`, window 1h, limit 5.
  - Turnstile via `verifyTurnstile()` — bypasses when `TURNSTILE_SECRET_KEY` is unset (toggle-ready), fail-closed on siteverify HTTP errors or network timeouts.
  - Body validation via `contactMessageCreateSchema` (extended with optional `turnstile_token`).
- **Site-owner resolution**: `resolveSiteOwnerId(db)` returns the oldest user row's id, cached per isolate. Does NOT cache nulls (fresh DB → 503 → next request retries). In-flight dedup via shared promise. Documented limitation: no TTL or invalidation hook — deleting the bootstrap user is unsupported in V1.
- **Auth bypass**: `app.use('/v1/*', authWrapper)` checks `if (c.req.method === 'POST') { const p = c.req.path; if (p === '/v1/contact' || p === '/v1/contact/') return next() }` then runs the dual-auth middleware. Trailing slash is tolerated.
- **clientIp() hardening**: `CF-Connecting-IP` always trusted (set by Cloudflare, strips client copies). `X-Forwarded-For` honoured only when `NODE_ENV !== 'production'`. In prod with no CF-Connecting-IP → returns null (rate-limit keys to null IP-bucket, which is still rate-limited).
- **Structural test**: `routes-no-drizzle.test.ts` walks every file in `routes/v1/` and asserts no `from 'drizzle-orm'` or `from '@fortunel/db'` import. Single test, ~10 lines, prevents an entire class of bug.
- **Tests landed (25 new this phase)**: projects-repo (14: serialize, list keyset, get owner-scope, create stamps owner, 23505 → conflict, empty patch fallthrough, delete returns bool), posts-repo (11: mirror of projects with body_md/tags), contact-messages-repo (8: IngestMeta capture, mark-read), turnstile (5: bypass, missing token, success, error-codes, unreachable), cursor (6 — existed prior, includes the new 1024-char bound), routes-no-drizzle (1). Full suite: 94/94 across 16 files.

## What We Tried

1. **Auth-bypass via `c.req.path === '/v1/contact'`**. Caught by review for trailing-slash fragility. Switched to explicit `=== '/v1/contact' || === '/v1/contact/'`. Base-path concern documented as future-work.
2. **Importing `ApiKey` row type from `@fortunel/db` into the route to skip second roundtrip**. Would have broken `routes-no-drizzle.test.ts`. Reverted, added `serializeMintResult()` to the repo layer instead.
3. **`clientIp()` reading X-Forwarded-For unconditionally** as a "test fallback." Spoofable in production whenever `CF-Connecting-IP` is missing. Gated on `NODE_ENV !== 'production'`.
4. **Site-owner cache with negative caching** — initial draft cached `null`. Realized that locks in 503 forever past the bootstrap-user sign-up event. Removed the null caching (`if (id) cached = id`). Verified: in-flight dedup still works, transient errors don't poison the cache.
5. **`app.use('/v1/contact', ...)` for the IP rate-limit middleware**. Reviewer flagged uncertainty about whether Hono's `app.use(path)` matches by prefix or exact. Added explicit `if (p !== '/v1/contact' && p !== '/v1/contact/') return next()` guard as belt-and-suspenders so a future Hono router change can't accidentally rate-limit `POST /v1/contact/{id}/read`.
6. **`mintApiKey()` second `getApiKey()` roundtrip** to fetch the row for serialization. Reviewer correctly pointed out `MintResult` already has every needed field. Added `serializeMintResult()`, dropped the wasted RTT and the spurious `'mint succeeded but row vanished'` 500 path.

## Root Cause Analysis

The contact-endpoint bugs (path-equality + XFF) are both instances of a single pattern: **defensive code written against the happy path becomes the attack surface in the adversarial path**. The "test fallback" XFF read assumed tests are the only callers without `CF-Connecting-IP`. The exact-equality path check assumed clients always normalize trailing slashes. Both assumptions are true in development and CI, false against an attacker who reads the source. The fix is the same in both cases: bound the trusted input by environment, not by hope.

The repository-pattern correctness lives in two places: the `RepoCtx` discipline (routes can't get a context without going through `repoCtx(c)`, which requires `c.var.user`) and the `keysetWhere()` centralization (the owner predicate is in one place, not four). The structural test prevents one specific bypass (route imports drizzle directly), not all bypasses (repo writes a new method without the predicate). That's the next layer of investment for Phase B if owner-scoping ever drifts.

## Lessons Learned

- **Structural tests beat documentation.** "Routes must not import drizzle" was written in the plan. The test made it true. Without the test, the api-key serialization change would have silently broken the boundary.
- **Defensive bypass code needs the same scrutiny as the path it bypasses.** The auth-bypass for the contact endpoint is one line. Code review caught two bugs in it. The rule: any code that says "skip the security control here" gets adversarial review, not just functional review.
- **Per-isolate caches without invalidation are a slow-burn footgun.** `site-owner.ts` is correct for V1 (single-tenant, owner never deleted) but the failure mode if those assumptions break (FK violation 500 on every subsequent contact submit) is silent enough to take hours to debug. Document the assumption inline so the next person looking at the cache knows what triggers the bomb.
- **Centralize the predicate, don't repeat it.** `keysetWhere()` ensures the owner-scoping WHERE clause is identical across all four repos. If the predicate ever needs to change (e.g., add a `deleted_at IS NULL` for soft-delete), one edit covers four resources. The temptation to inline `and(eq(...), eq(...), ...)` per repo would have been a maintenance bomb.
- **`MintResult` already had the answer.** When the reviewer flagged the wasted roundtrip, I almost defended it on grounds of "it's safer to re-read from DB." It wasn't safer — it added a 500 path that fires only on neon-http read-after-write replication weirdness. The cleanest code is the code that doesn't run.

## Next Steps

- Phase A.7: CI green + Workers deploy. Migrations as separate job, deploy gated on migrate success.
- Carry-forward: consider a typed wrapper around Drizzle queries that requires `ownerId` at the type level for any write to a tenant-scoped table. Would prevent the "repo author forgot the ownerId predicate" footgun.
- Carry-forward: add a contact-route integration test that exercises both `/v1/contact` and `/v1/contact/` to lock in the trailing-slash bypass behavior.
- Carry-forward: revisit Cloudflare Turnstile keys when staging is deployed (Phase A.7); the toggle-ready code path needs a real key to validate the production failure mode.
