---
phase: 5
title: "Auth surface — Better Auth + API keys"
status: pending
priority: P1
effort: "24h"
dependencies: [2, 3, 4]
---

> **Red-team revisions applied:** added missing dep 3 (scope vocabulary lives in shared-types so handlers can typecheck against it); effort bumped 12h→24h (realistic for Better Auth wiring + OAuth round trip + API key middleware + own KV session cache + integration tests); added requirement for our own KV session cache (Better Auth `cookieCache` is broken per #4203 — without our cache, every protected request hits Postgres for session lookup).
>
> **Execution can split into two sub-phases if needed:** 5a = Better Auth + OAuth + own KV session cache (~14h); 5b = API key mint/verify/scope middleware (~10h). Same dependencies, same DoD. Keep as one phase file for now.
>
> **Blocker resolved (Validation Session 1):** scope vocabulary = `posts:read|write`, `projects:read|write`, `contact:read|write`, `signals:read|write`, `*:*`. Codify as a Zod enum in `packages/shared-types/src/primitives.ts` so handlers can typecheck `requireScope(scope)` calls.
>
> **Email verification (Validation Session 1):** OUT OF SCOPE for Phase A. `POST /auth/sign-up/email` creates an active user with no email-confirmation gate. Revisit when inviting real users. Do not wire Resend or Better Auth's email-verification plugin in this phase.
>
> **Note from Phase 2 implementation (2026-05-26):** the Drizzle adapter must be configured with an explicit schema mapping because our tables use plural names (`users`, `sessions`, `accounts`) while Better Auth defaults expect singular. In `auth/config.ts`, pass `schema: { user: users, session: sessions, account: accounts }` to `drizzleAdapter(...)`. No `verification` table exists — keep email-verification / password-reset / OTP plugins disabled. If they're ever needed, add `verifications` table + a follow-up migration.

<!-- Updated: Validation Session 1 - scope vocab resolved, email verification deferred -->


# Phase 5: Auth surface

## Overview

Wire Better Auth (email/password + GitHub OAuth) with the Drizzle adapter, plus a separate machine API-key middleware. Dual-auth: route handlers see a unified `c.var.user` regardless of which credential was used.

## Requirements

- Functional: user can sign up via `POST /auth/sign-up/email` (Better Auth route)
- Functional: user can sign in via GitHub OAuth (`GET /auth/sign-in/github`)
- Functional: authenticated user can mint API keys via `POST /v1/api-keys` (Phase 6 route, this phase exposes the underlying ops)
- Functional: requests with `Authorization: Bearer <api-key>` resolve to the key's owner_id + scopes
- Functional: requests with the session cookie resolve to the cookie's owner_id + implicit `*:*` scope (full user-level access)
- Non-functional: password verify <2s on Workers (scrypt CPU budget)
- Non-functional: API key hash compare <50ms (use scrypt with low cost factor for keys since the entropy is high)

## Architecture

```
apps/api/src/
├── auth/
│   ├── config.ts               # Better Auth instance: drizzleAdapter, github provider, session storage
│   ├── api-key.ts              # mint/verify/revoke (NOT Better Auth's plugin — see note)
│   ├── session-cache.ts        # KV write-through for sessions (60s TTL) — see Caveat #1
│   ├── scopes.ts               # scope vocabulary + check helpers
│   └── middleware.ts           # dual-auth: branch on Authorization vs cookie, set c.var.user
├── routes/
│   └── auth.ts                 # mounts Better Auth at /auth/*
```

### Decision: API key plugin vs custom

Researcher noted Better Auth ships `@better-auth/api-key`. **Reject for now** — keeping API key logic in our own middleware gives us:
- Clean scope vocabulary independent of Better Auth's plugin churn
- One less external dep version to track
- Direct argon2/scrypt cost-factor control

Revisit in Phase B if the plugin matures.

### Critical caveats (from researcher)

1. **Disable Better Auth `cookieCache`** — bug #4203 keeps expired cookies live. **But** raw Postgres-per-request is a latency disaster at the edge. Mitigation: write our own KV-backed session cache layer in `auth/session-cache.ts` — on session lookup, check `SESSION_CACHE` KV first (key = session id, TTL = 60s), miss → query Postgres → write-through. Invalidate on sign-out. This is small (~50 LOC) and avoids the Better Auth plugin altogether.
2. **Use `postgres-js` driver** (decided in Phase 2) — works with Better Auth's drizzleAdapter.
3. **scrypt via `@noble/hashes/scrypt`** for password hashing (no argon2 native in Workers).

## Related Code Files

**Create:**
- `apps/api/src/auth/config.ts`
- `apps/api/src/auth/api-key.ts`
- `apps/api/src/auth/scopes.ts`
- `apps/api/src/auth/middleware.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/__tests__/auth.test.ts` — integration tests against test DB

**Modify:**
- `apps/api/src/index.ts` — mount `app.route('/auth', authRoutes)` and apply `authMiddleware` to `/v1/*`
- `apps/api/wrangler.toml` — secrets: `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (added via `wrangler secret put`)
- `apps/api/.dev.vars.example` — already has placeholders

## Implementation Steps

1. Install: `pnpm --filter @fortunel/api add better-auth @noble/hashes`
2. Create GitHub OAuth Apps (3 of them, one per env):
   - Dev: redirect `http://localhost:8787/auth/callback/github`
   - Staging: `https://staging.api.fortunel.dev/auth/callback/github`
   - Prod: `https://api.fortunel.dev/auth/callback/github`
3. Wire Better Auth config with `drizzleAdapter`, `github` provider, `cookieCache: { enabled: false }`
4. Write API key module: `mint()` → returns `{ id, plaintext, hashed }` (plaintext shown ONCE to user); `verify(plaintext)` → looks up by `hashed_key` index, scrypt-compare; `revoke(id)`
5. Define scope vocabulary (locked): `posts:read|write`, `projects:read|write`, `contact:read|write`, `signals:read|write`, `*:*`. Export `Scope` enum from `@fortunel/shared-types`; `requireScope()` accepts `Scope` only (typecheck rejects typos).
6. Write `authMiddleware`:
   ```
   if (Authorization header starts with 'Bearer ') {
     resolve via api-key.ts → set c.var.user = { id, scopes }
   } else {
     resolve via Better Auth session → set c.var.user = { id, scopes: ['*:*'] }
   }
   if neither: throw 401 (RFC 7807 problem)
   ```
7. Write `requireScope(scope: string)` helper used by route handlers
8. Write integration tests against the Docker test DB: sign up, sign in, mint key, call protected route with key, revoke key, call again → 401

## Success Criteria

- [ ] `POST /auth/sign-up/email` creates a row in `users` + `accounts`
- [ ] GitHub OAuth round trip works on localhost
- [ ] Minted API key plaintext appears ONCE in the response, never again
- [ ] Hashed key in DB matches scrypt(plaintext, salt) when verifying
- [ ] Session-authed user → `requireScope('*:*')` passes
- [ ] API-key-authed user with only `posts:read` → `requireScope('posts:write')` returns 403
- [ ] Better Auth `cookieCache` confirmed disabled in code + comment cites #4203
- [ ] Integration tests green

## Risk Assessment

- **Risk:** scrypt password verify ~2s on Workers — every protected request hitting password verify hard-caps RPS. **Mitigation:** Better Auth's session model means password verify happens only at sign-in; the session cookie is the proof afterwards. Document this guarantee.
- **Risk:** API key plaintext leaked in logs. **Mitigation:** logger strips `Authorization` header by default; add a test that a logged request body never contains a known plaintext key.
- **Risk:** Better Auth Drizzle table shape drifts between minor versions. **Mitigation:** lock `better-auth` to a specific minor (e.g. `~1.0.0`); when bumping, run `pnpm db:generate` to detect schema diff.
- **Risk:** GitHub OAuth callback URI mismatch (one of three envs misconfigured). **Mitigation:** add to deployment checklist; smoke-test in staging before flipping prod.
- **Risk:** Scope vocabulary fork — adding new resources requires touching this file. **Mitigation:** keep `scopes.ts` short; document the pattern.
